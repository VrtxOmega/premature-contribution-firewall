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

  async function request(path, options = {}) {
    const url = `${apiBase}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? safeJson(text) : null;
    if (!response.ok) {
      const detail = data?.message || text || response.statusText;
      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${detail}`);
    }
    return data;
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
    upstreamRepository = ""
  }) {
    const repository = `${owner}/${repo}`;
    const terms = searchTerms(`${title}\n${body}`);
    const queryText = terms.length ? terms.join(" ") : title || repo;
    const localSearch = await readRequest(installationId, `/search/issues?q=${encodeURIComponent(`${queryText} repo:${repository} in:title,body`)}&per_page=20`);
    const pullFiles = kind === "pull_request" && number && files.length === 0
      ? await safeReadPullFiles({ owner, repo, number, installationId })
      : files;

    const issues = [];
    const pullRequests = [];
    for (const item of localSearch.items || []) {
      if (String(item.number) === String(number) && ((kind === "issue" && !item.pull_request) || (kind !== "issue" && item.pull_request))) continue;
      const normalized = normalizeSearchItem(item);
      if (item.pull_request) pullRequests.push(normalized);
      else issues.push(normalized);
    }

    const context = {
      source: "github-api",
      repository,
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
      const upstreamSearch = await request(`/search/issues?q=${encodeURIComponent(`${queryText} repo:${upstreamRepository} in:title,body`)}&per_page=20`);
      for (const item of upstreamSearch.items || []) {
        const normalized = normalizeSearchItem(item, "upstream");
        if (item.pull_request) context.upstream.pullRequests.push(normalized);
        else context.upstream.issues.push(normalized);
      }
      context.upstream.commits = await safeSearchCommits({ repository: upstreamRepository, queryText });
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
    upstreamRepository = config.upstreamRepository || ""
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
          const files = await safeReadPullFileStats({ owner, repo, number: pullRequest.number, installationId });
          items.push(await normalizePullRequestQueueItem({
            owner,
            repo,
            pullRequest,
            files,
            installationId,
            upstreamRepository
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
        const issueItems = await readOpenIssuesOnly({ owner, repo, limit: issueLimit, installationId });
        for (const issue of issueItems) {
          items.push(await normalizeIssueQueueItem({
            owner,
            repo,
            issue,
            installationId,
            upstreamRepository
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

  async function readOpenIssuesOnly({ owner, repo, limit, installationId }) {
    const issueLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const perPage = Math.min(100, Math.max(25, issueLimit * 4));
    const issuesOnly = [];

    for (let page = 1; issuesOnly.length < issueLimit && page <= 10; page += 1) {
      const issues = await readRequest(
        installationId,
        `/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=${perPage}&page=${page}`
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

  async function safeReadPullFiles({ owner, repo, number, installationId }) {
    try {
      const data = await readRequest(installationId, `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
      return Array.isArray(data) ? data.map((file) => file.filename).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async function safeReadPullFileStats({ owner, repo, number, installationId }) {
    try {
      const data = await readRequest(installationId, `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
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

  async function normalizePullRequestQueueItem({ owner, repo, pullRequest, files, installationId, upstreamRepository }) {
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
      upstreamRepository
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

  async function normalizeIssueQueueItem({ owner, repo, issue, installationId, upstreamRepository }) {
    const repository = `${owner}/${repo}`;
    const title = issue.title || "";
    const body = issue.body || "";
    const number = issue.number;
    const repositoryContext = await safeCollectQueueContext({
      owner,
      repo,
      number,
      kind: "issue",
      title,
      body,
      files: [],
      installationId,
      upstreamRepository
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

  async function safeSearchCommits({ repository, queryText }) {
    try {
      const data = await request(`/search/commits?q=${encodeURIComponent(`${queryText} repo:${repository}`)}&per_page=10`, {
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

function searchTerms(text) {
  const words = String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  const stop = new Set(["and", "are", "for", "from", "into", "that", "the", "this", "with", "fixes", "problem", "change", "verification"]);
  return [...new Set(words.filter((word) => !stop.has(word)))].slice(0, 8);
}
