import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { labelDefinitionFor } from "./templates.mjs";

export function createGitHubClient(config = {}) {
  const apiBase = config.githubApiBase || "https://api.github.com";
  const appId = config.githubAppId;
  const privateKeyPath = config.githubPrivateKeyPath;
  const readToken = config.githubToken || "";
  const tokenCache = new Map();
  const readCache = new Map();
  const readCacheTtlMs = Number.isFinite(Number(config.githubCacheTtlMs)) ? Number(config.githubCacheTtlMs) : 60_000;
  const searchDelayMs = Number.isFinite(Number(config.githubSearchDelayMs)) ? Math.max(0, Number(config.githubSearchDelayMs)) : 3_000;
  const rateLimitRetries = Number.isFinite(Number(config.githubRateLimitRetries)) ? Math.floor(Math.max(0, Math.min(5, Number(config.githubRateLimitRetries)))) : 2;
  const rateLimitFallbackMs = Number.isFinite(Number(config.githubRateLimitFallbackMs)) ? Math.max(0, Number(config.githubRateLimitFallbackMs)) : 60_000;
  const rateLimitMaxWaitMs = Number.isFinite(Number(config.githubRateLimitMaxWaitMs)) ? Math.max(0, Number(config.githubRateLimitMaxWaitMs)) : 5 * 60_000;
  const requestTimeoutMs = Number.isFinite(Number(config.githubRequestTimeoutMs)) ? Math.max(0, Number(config.githubRequestTimeoutMs)) : 20_000;
  let nextSearchAt = 0;

  async function request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const maxRetries = ["GET", "HEAD"].includes(method) ? rateLimitRetries : 0;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await requestOnce(path, options);
      } catch (error) {
        if (!error?.rateLimited || attempt >= maxRetries) throw error;
        const advertisedWaitMs = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : null;
        if (advertisedWaitMs !== null && advertisedWaitMs > rateLimitMaxWaitMs) throw error;
        const waitMs = advertisedWaitMs ?? Math.min(rateLimitMaxWaitMs, rateLimitFallbackMs * (2 ** attempt));
        if (waitMs > 0) await delay(waitMs);
      }
    }
  }

  async function requestOnce(path, options = {}) {
    const url = `${apiBase}${path}`;
    const { signal: upstreamSignal, timeoutMs: optionTimeoutMs, ...fetchOptions } = options;
    const timeoutMs = Number.isFinite(Number(optionTimeoutMs)) ? Math.max(0, Number(optionTimeoutMs)) : requestTimeoutMs;
    const controller = new AbortController();
    let timeout = null;
    const abort = (reason) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        abort(upstreamSignal.reason || new Error("request aborted"));
      } else {
        upstreamSignal.addEventListener("abort", () => abort(upstreamSignal.reason || new Error("request aborted")), { once: true });
      }
    }
    if (timeoutMs > 0) {
      timeout = setTimeout(() => abort(new Error(`GitHub API request timed out after ${timeoutMs}ms`)), timeoutMs);
    }
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}),
          ...(fetchOptions.headers || {})
        }
      });
      const text = await response.text();
      const data = text ? safeJson(text) : null;
      if (!response.ok) {
        const detail = data?.message || text || response.statusText;
        const error = new Error(`GitHub API ${response.status} ${response.statusText}: ${detail}`);
        error.status = response.status;
        error.rateLimited = isRateLimitResponse(response, detail);
        error.retryAfterMs = rateLimitRetryDelayMs(response);
        throw error;
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        const message = reason instanceof Error ? reason.message : String(reason || "request aborted");
        throw new Error(`${message}: ${path}`);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function getInstallationToken(installationId) {
    if (!appId || !privateKeyPath) {
      throw new Error("GITHUB_APP_ID and GITHUB_PRIVATE_KEY_PATH are required for GitHub writes.");
    }
    const cached = tokenCache.get(String(installationId));
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const jwt = await createAppJwt(appId, privateKeyPath);
    const data = await request(`/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    });
    const expiresAt = data?.expires_at ? Date.parse(data.expires_at) : Date.now() + 45 * 60_000;
    tokenCache.set(String(installationId), { token: data.token, expiresAt });
    return data.token;
  }

  async function installationRequest(installationId, path, options = {}) {
    const token = await getInstallationToken(installationId);
    return request(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  }

  async function postIssueComment({ owner, repo, issueNumber, body, installationId }) {
    return installationRequest(installationId, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }

  async function applyLabels({ owner, repo, issueNumber, labels, installationId }) {
    const safeLabels = [...new Set(labels)].slice(0, 10);
    for (const label of safeLabels) {
      await ensureLabel({ owner, repo, label, installationId });
    }
    return installationRequest(installationId, `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels: safeLabels })
    });
  }

  async function collectRepositoryContext({
    owner,
    repo,
    number = "",
    kind = "pull_request",
    title = "",
    body = "",
    files = [],
    installationId = "",
    upstreamRepository = "",
    signal = null
  }) {
    const repository = `${owner}/${repo}`;
    const currentIssueRefs = extractIssueRefs(`${title}\n${body}`, repository);
    const terms = searchTerms(`${title}\n${body}`);
    const queryText = terms.length ? terms.join(" ") : title || repo;
    await waitForSearchSlot();
    const localSearch = await readRequest(installationId, `/search/issues?q=${encodeURIComponent(`${queryText} repo:${repository} in:title,body`)}&per_page=20`, { signal });
    const pullFiles = kind === "pull_request" && number && files.length === 0
      ? await safeReadPullFiles({ owner, repo, number, installationId, signal })
      : files;

    const issues = [];
    const pullRequests = [];
    for (const item of localSearch.items || []) {
      if (String(item.number) === String(number) && ((kind === "issue" && !item.pull_request) || (kind !== "issue" && item.pull_request))) continue;
      const normalized = normalizeSearchItem(item);
      if (item.pull_request) pullRequests.push(normalized);
      else issues.push(normalized);
    }

    for (const issueRef of currentIssueRefs) {
      if (String(issueRef) === String(number)) continue;
      const referenced = await safeReadIssue({ owner, repo, number: issueRef, installationId, signal });
      if (!referenced) continue;
      if (referenced.type === "pull_request") pushContextItem(pullRequests, referenced);
      else pushContextItem(issues, referenced);
    }

    const context = {
      source: "github-api",
      repository,
      currentIssueRefs: [...currentIssueRefs],
      issues,
      pullRequests,
      upstream: {
        repository: upstreamRepository || "",
        issues: [],
        pullRequests: [],
        commits: [],
        releases: []
      }
    };

    if (upstreamRepository) {
      await waitForSearchSlot();
      const upstreamSearch = await request(`/search/issues?q=${encodeURIComponent(`${queryText} repo:${upstreamRepository} in:title,body`)}&per_page=20`, { signal });
      for (const item of upstreamSearch.items || []) {
        const normalized = normalizeSearchItem(item, "upstream");
        if (item.pull_request) context.upstream.pullRequests.push(normalized);
        else context.upstream.issues.push(normalized);
      }
      context.upstream.commits = await safeSearchCommits({ repository: upstreamRepository, queryText, signal });
    }

    if (pullFiles.length) {
      context.pullRequests.unshift({
        type: "pull_request",
        number,
        title,
        body,
        state: "current",
        files: pullFiles
      });
    }

    return context;
  }

  async function collectRepositoryQueue({
    owner,
    repo,
    limit = config.githubQueueLimit || 25,
    includePullRequests = true,
    includeIssues = true,
    installationId = "",
    upstreamRepository = config.upstreamRepository || "",
    signal = null
  }) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const repository = `${owner}/${repo}`;
    const items = [];
    const collectionErrors = [];

    if (includePullRequests) {
      try {
        const pullRequests = await readRequest(
          installationId,
          `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=${safeLimit}`
        );
        for (const pullRequest of (Array.isArray(pullRequests) ? pullRequests : []).slice(0, safeLimit)) {
          const files = await safeReadPullFileStats({ owner, repo, number: pullRequest.number, installationId, signal });
          items.push(await normalizePullRequestQueueItem({
            owner,
            repo,
            pullRequest,
            files,
            installationId,
            upstreamRepository,
            signal
          }));
        }
      } catch (error) {
        collectionErrors.push({
          scope: "pull_requests",
          message: error.message
        });
      }
    }

    if (includeIssues && items.length < safeLimit) {
      try {
        const issueLimit = safeLimit - items.length;
        const issueItems = await readOpenIssuesOnly({ owner, repo, limit: issueLimit, installationId, signal });
        for (const issue of issueItems) {
          items.push(await normalizeIssueQueueItem({
            owner,
            repo,
            issue,
            installationId,
            upstreamRepository,
            signal
          }));
        }
      } catch (error) {
        collectionErrors.push({
          scope: "issues",
          message: error.message
        });
      }
    }

    return {
      source: "github-api",
      repository,
      upstreamRepository,
      dryRun: true,
      limit: safeLimit,
      collectionErrors,
      items
    };
  }

  async function searchOpenPullRequestsForIssue({ owner, repo, issueNumber, installationId = "", signal = null }) {
    const repository = `${owner}/${repo}`;
    await waitForSearchSlot();
    const data = await readRequest(
      installationId,
      `/search/issues?q=${encodeURIComponent(`repo:${repository} is:pr is:open #${issueNumber}`)}&per_page=20`,
      { signal }
    );
    return (data.items || []).map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title || "",
      body: pullRequest.body || "",
      state: pullRequest.state || "open",
      htmlUrl: pullRequest.html_url || "",
      updatedAt: pullRequest.updated_at || ""
    }));
  }

  async function searchOpenPullRequests({ repository, query = "", limit = 20, installationId = "", signal = null }) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const safeRepository = String(repository || "").trim();
    if (!safeRepository) return [];
    const normalizedQuery = normalizeOpenPullRequestSearchQuery({ repository: safeRepository, query });
    await waitForSearchSlot();
    const data = await readRequest(
      installationId,
      `/search/issues?q=${encodeURIComponent(normalizedQuery)}&sort=updated&order=desc&per_page=${safeLimit}`,
      { signal }
    );
    const results = (data.items || [])
      .filter((item) => item.pull_request)
      .map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title || "",
        body: pullRequest.body || "",
        state: pullRequest.state || "open",
        htmlUrl: pullRequest.html_url || "",
        updatedAt: pullRequest.updated_at || ""
      }));
    Object.defineProperty(results, "incompleteResults", {
      value: Boolean(data.incomplete_results),
      enumerable: false
    });
    Object.defineProperty(results, "totalCount", {
      value: Number(data.total_count) || 0,
      enumerable: false
    });
    return results;
  }

  async function searchOpenIssues({ query, limit = 20, installationId = "", signal = null }) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const normalizedQuery = normalizeOpenIssueSearchQuery(query);
    await waitForSearchSlot();
    const data = await readRequest(
      installationId,
      `/search/issues?q=${encodeURIComponent(normalizedQuery)}&sort=updated&order=desc&per_page=${safeLimit}`,
      { signal }
    );
    return {
      query: normalizedQuery,
      totalCount: Number(data.total_count) || 0,
      incompleteResults: Boolean(data.incomplete_results),
      items: (data.items || [])
        .filter((item) => !item.pull_request)
        .map((item) => ({
          id: item.id || "",
          repository: repositoryFromSearchItem(item),
          repository_url: item.repository_url || "",
          number: item.number || "",
          title: item.title || "",
          body: item.body || "",
          author: item.user ? {
            login: item.user.login || "",
            type: item.user.type || ""
          } : null,
          author_association: item.author_association || "",
          labels: item.labels || [],
          state: item.state || "",
          assignee: item.assignee || null,
          assignees: item.assignees || [],
          html_url: item.html_url || "",
          updated_at: item.updated_at || "",
          created_at: item.created_at || ""
        }))
    };
  }

  async function ensureLabel({ owner, repo, label, installationId }) {
    const definition = labelDefinitionFor(label);
    const encoded = encodeURIComponent(label);
    try {
      await installationRequest(installationId, `/repos/${owner}/${repo}/labels/${encoded}`, {
        method: "PATCH",
        body: JSON.stringify({
          color: definition.color,
          description: definition.description
        })
      });
    } catch (error) {
      if (!/404/.test(error.message)) throw error;
      await installationRequest(installationId, `/repos/${owner}/${repo}/labels`, {
        method: "POST",
        body: JSON.stringify({
          name: label,
          color: definition.color,
          description: definition.description
        })
      });
    }
  }

  return {
    postIssueComment,
    applyLabels,
    collectRepositoryContext,
    collectRepositoryQueue,
    searchOpenPullRequestsForIssue,
    searchOpenPullRequests,
    searchOpenIssues,
    request
  };

  async function readRequest(installationId, path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const cacheKey = `${installationId || "public"} ${method} ${path}`;
    if (method === "GET" && readCacheTtlMs > 0) {
      const cached = readCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.data);
    }
    const data = installationId ? await installationRequest(installationId, path, options) : await request(path, options);
    if (method === "GET" && readCacheTtlMs > 0) {
      readCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + readCacheTtlMs
      });
    }
    return data;
  }

  async function readOpenIssuesOnly({ owner, repo, limit, installationId, signal = null }) {
    const issueLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const perPage = Math.min(100, Math.max(25, issueLimit * 4));
    const issuesOnly = [];

    for (let page = 1; issuesOnly.length < issueLimit && page <= 10; page += 1) {
      const issues = await readRequest(
        installationId,
        `/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
        { signal }
      );
      const pageItems = Array.isArray(issues) ? issues : [];
      for (const issue of pageItems) {
        if (!issue.pull_request) issuesOnly.push(issue);
        if (issuesOnly.length >= issueLimit) break;
      }
      if (pageItems.length < perPage) break;
    }

    return issuesOnly.slice(0, issueLimit);
  }

  async function safeReadPullFiles({ owner, repo, number, installationId, signal = null }) {
    try {
      const data = await readRequest(installationId, `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`, { signal });
      return Array.isArray(data) ? data.map((file) => file.filename).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async function safeReadPullFileStats({ owner, repo, number, installationId, signal = null }) {
    try {
      const data = await readRequest(installationId, `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`, { signal });
      return Array.isArray(data)
        ? data.map((file) => ({
          filename: file.filename,
          additions: Number(file.additions) || 0,
          deletions: Number(file.deletions) || 0,
          patch: file.patch || ""
        })).filter((file) => file.filename)
        : [];
    } catch {
      return [];
    }
  }

  async function safeReadIssue({ owner, repo, number, installationId, signal = null }) {
    try {
      const issue = await readRequest(installationId, `/repos/${owner}/${repo}/issues/${number}`, { signal });
      return issue ? normalizeSearchItem(issue) : null;
    } catch {
      return null;
    }
  }

  async function safeReadIssueCommentBodies({ owner, repo, number, installationId, signal = null }) {
    try {
      const comments = await readRequest(installationId, `/repos/${owner}/${repo}/issues/${number}/comments?per_page=20`, { signal });
      return Array.isArray(comments)
        ? comments.map((comment) => String(comment.body || "").trim()).filter(Boolean).join("\n\n")
        : "";
    } catch {
      return "";
    }
  }

  async function normalizePullRequestQueueItem({ owner, repo, pullRequest, files, installationId, upstreamRepository, signal = null }) {
    const repository = `${owner}/${repo}`;
    const title = pullRequest.title || "";
    const body = pullRequest.body || "";
    const number = pullRequest.number;
    const additions = files.reduce((sum, file) => sum + (Number(file.additions) || 0), 0);
    const deletions = files.reduce((sum, file) => sum + (Number(file.deletions) || 0), 0);
    const repositoryContext = await safeCollectQueueContext({
      owner,
      repo,
      number,
      kind: "pull_request",
      title,
      body,
      files,
      installationId,
      upstreamRepository,
      signal
    });

    return {
      id: `pull_request-${number}`,
      kind: "pull_request",
      number,
      title,
      body,
      authorAssociation: pullRequest.author_association || "",
      draft: Boolean(pullRequest.draft),
      labels: pullRequest.labels || [],
      changedFiles: Number(pullRequest.changed_files) || files.length,
      additions: Number(pullRequest.additions) || additions,
      deletions: Number(pullRequest.deletions) || deletions,
      files,
      checks: [],
      htmlUrl: pullRequest.html_url || "",
      updatedAt: pullRequest.updated_at || "",
      repository,
      repositoryContext
    };
  }

  async function normalizeIssueQueueItem({ owner, repo, issue, installationId, upstreamRepository, signal = null }) {
    const repository = `${owner}/${repo}`;
    const title = issue.title || "";
    const body = issue.body || "";
    const number = issue.number;
    const commentBody = await safeReadIssueCommentBodies({ owner, repo, number, installationId, signal });
    const contextBody = [body, commentBody ? `Issue comments:\n${commentBody}` : ""].filter(Boolean).join("\n\n");
    const repositoryContext = await safeCollectQueueContext({
      owner,
      repo,
      number,
      kind: "issue",
      title,
      body: contextBody,
      files: [],
      installationId,
      upstreamRepository,
      signal
    });

    return {
      id: `issue-${number}`,
      kind: "issue",
      number,
      title,
      body,
      authorAssociation: issue.author_association || "",
      labels: issue.labels || [],
      htmlUrl: issue.html_url || "",
      updatedAt: issue.updated_at || "",
      repository,
      repositoryContext
    };
  }

  async function safeCollectQueueContext(args) {
    if (config.collectRepositoryContext === false) {
      return null;
    }
    try {
      return await collectRepositoryContext(args);
    } catch (error) {
      return {
        source: "github-api",
        repository: `${args.owner}/${args.repo}`,
        upstreamRepository: args.upstreamRepository || "",
        error: error.message
      };
    }
  }

  async function safeSearchCommits({ repository, queryText, signal = null }) {
    try {
      await waitForSearchSlot();
      const data = await request(`/search/commits?q=${encodeURIComponent(`${queryText} repo:${repository}`)}&per_page=10`, {
        signal,
        headers: { Accept: "application/vnd.github.cloak-preview+json" }
      });
      return (data.items || []).map((item) => ({
        type: "commit",
        sha: item.sha,
        title: item.commit?.message?.split("\n")[0] || "",
        body: item.commit?.message || "",
        htmlUrl: item.html_url,
        state: "committed"
      }));
    } catch {
      return [];
    }
  }

  async function waitForSearchSlot() {
    if (!searchDelayMs) return;
    const now = Date.now();
    const waitMs = Math.max(0, nextSearchAt - now);
    nextSearchAt = Math.max(now, nextSearchAt) + searchDelayMs;
    if (waitMs > 0) await delay(waitMs);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitResponse(response, detail = "") {
  const status = Number(response?.status);
  if (status === 429) return true;
  if (status !== 403) return false;
  const remaining = response?.headers?.get?.("x-ratelimit-remaining");
  return remaining === "0"
    || Boolean(response?.headers?.get?.("retry-after"))
    || /secondary rate limit|rate limit exceeded|abuse detection/i.test(String(detail));
}

function rateLimitRetryDelayMs(response) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1_000));
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  if (response?.headers?.get?.("x-ratelimit-remaining") === "0") {
    const resetSeconds = Number(response?.headers?.get?.("x-ratelimit-reset"));
    if (Number.isFinite(resetSeconds)) return Math.max(0, resetSeconds * 1_000 - Date.now() + 1_000);
  }
  return null;
}

export async function createAppJwt(appId, privateKeyPath, nowSeconds = Math.floor(Date.now() / 1000)) {
  const privateKeyText = await readFile(privateKeyPath, "utf8");
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64urlJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: String(appId)
  });
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKeyText);
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalizeSearchItem(item, scope = "local") {
  return {
    type: item.pull_request ? "pull_request" : "issue",
    scope,
    number: item.number,
    title: item.title || "",
    body: item.body || "",
    state: item.pull_request && item.pull_request.merged_at ? "merged" : item.state || "",
    labels: item.labels || [],
    htmlUrl: item.html_url || "",
    closedAt: item.closed_at || "",
    mergedAt: item.pull_request?.merged_at || "",
    updatedAt: item.updated_at || ""
  };
}

function normalizeOpenIssueSearchQuery(query = "") {
  const parts = String(query || "").trim().split(/\s+/).filter(Boolean);
  const hasIssueQualifier = parts.some((part) => /^is:issue$/i.test(part));
  const hasOpenQualifier = parts.some((part) => /^is:open$/i.test(part));
  const normalized = [
    ...(!hasIssueQualifier ? ["is:issue"] : []),
    ...(!hasOpenQualifier ? ["is:open"] : []),
    ...parts
  ];
  return normalized.join(" ");
}

function normalizeOpenPullRequestSearchQuery({ repository, query = "" } = {}) {
  const parts = String(query || "").trim().split(/\s+/).filter(Boolean);
  const hasRepoQualifier = parts.some((part) => /^repo:/i.test(part));
  const hasPrQualifier = parts.some((part) => /^is:pr$/i.test(part));
  const hasOpenQualifier = parts.some((part) => /^is:open$/i.test(part));
  const normalized = [
    ...(!hasRepoQualifier ? [`repo:${repository}`] : []),
    ...(!hasPrQualifier ? ["is:pr"] : []),
    ...(!hasOpenQualifier ? ["is:open"] : []),
    ...parts
  ];
  return normalized.join(" ");
}

function repositoryFromSearchItem(item = {}) {
  const apiUrl = String(item.repository_url || "");
  const match = apiUrl.match(/\/repos\/([^/\s]+\/[^/\s]+)$/);
  return match ? match[1] : "";
}

function extractIssueRefs(text, repository = "") {
  const refs = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/#(\d+)\b/gi)) {
    refs.add(match[1]);
  }
  const [owner, repo] = String(repository || "").split("/");
  if (owner && repo) {
    const sameRepoPattern = new RegExp(`github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/(?:issues|pull)/(\\d+)\\b`, "gi");
    for (const match of source.matchAll(sameRepoPattern)) refs.add(match[1]);
  }
  for (const match of source.matchAll(/\b(?:issues|pull)\/(\d+)\b/gi)) {
    const prefix = source.slice(Math.max(0, (match.index || 0) - 80), match.index || 0);
    if (/github\.com\/[^/\s]+\/[^/\s]+\/$/i.test(prefix)) continue;
    refs.add(match[1]);
  }
  return refs;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pushContextItem(items, item) {
  if (!items.some((existing) => String(existing.number) === String(item.number) && existing.type === item.type)) {
    items.push(item);
  }
}

function searchTerms(text) {
  const words = String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  const stop = new Set(["and", "are", "for", "from", "into", "that", "the", "this", "with", "fixes", "problem", "change", "verification"]);
  return [...new Set(words.filter((word) => !stop.has(word)))].slice(0, 8);
}
