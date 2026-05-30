import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiSpec, createSetupGuide, createSetupStatus, evaluateBatch, evaluateMaintainerQueue } from "./core/api.mjs";
import { applyFeedbackFixtureCandidates, buildCandidateEvidenceArtifact, buildCandidateReplayComparison, readCandidateCorpus, replayCandidateCorpus } from "./core/candidates.mjs";
import { buildFeedbackCalibration } from "./core/calibration.mjs";
import { appendFeedback, buildRegressionExport, readFeedbackLedger } from "./core/feedback.mjs";
import { appendQueueHistory, readQueueHistory } from "./core/history.mjs";
import { runBenchmark } from "./core/benchmark.mjs";
import { availableProfiles, evaluateContribution } from "./core/evaluator.mjs";
import { parsePatchSubmission } from "./core/patch.mjs";
import { renderSetupGuideMarkdown } from "./core/setup-guide.mjs";
import { loadConfig } from "./config.mjs";
import { createGitHubClient } from "./github/client.mjs";
import { handleGitHubWebhook } from "./github/webhook.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const fixturesDir = join(root, "fixtures");
const config = loadConfig(root);
const githubClient = createGitHubClient(config);

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error("[premature-contribution-firewall] request failed", error);
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[premature-contribution-firewall] listening on http://${config.host}:${config.port}`);
  console.log(`[premature-contribution-firewall] dryRun=${config.dryRun} postComments=${config.postComments} applyLabels=${config.applyLabels} collectRepositoryContext=${config.collectRepositoryContext} queueLimit=${config.githubQueueLimit}`);
});

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      app: "premature-contribution-firewall",
      dryRun: config.dryRun,
      postComments: config.postComments,
      applyLabels: config.applyLabels,
      collectRepositoryContext: config.collectRepositoryContext,
      githubQueueLimit: config.githubQueueLimit,
      feedbackEnabled: config.feedbackEnabled
    });
  }

  if (request.method === "GET" && url.pathname === "/api/profiles") {
    return sendJson(response, 200, {
      ok: true,
      profiles: availableProfiles()
    });
  }

  if (request.method === "GET" && url.pathname === "/api/spec") {
    return sendJson(response, 200, createApiSpec(config));
  }

  if (request.method === "GET" && url.pathname === "/api/github/setup") {
    return sendJson(response, 200, createSetupStatus(config));
  }

  if (request.method === "GET" && url.pathname === "/api/github/setup/guide") {
    const guide = createSetupGuide(config, {
      repository: url.searchParams.get("repository") || "",
      baseUrl: url.searchParams.get("baseUrl") || `http://${request.headers.host || `${config.host}:${config.port}`}`,
      publicBaseUrl: url.searchParams.get("publicBaseUrl") || url.searchParams.get("webhookBaseUrl") || ""
    });
    if (url.searchParams.get("format") === "markdown") {
      return send(response, 200, renderSetupGuideMarkdown(guide), "text/markdown; charset=utf-8");
    }
    return sendJson(response, 200, guide);
  }

  if (request.method === "POST" && url.pathname === "/api/github/test-connection") {
    const rawBody = await readRequestBody(request);
    const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    const result = await testGithubConnection(payload);
    console.log(`[premature-contribution-firewall] setup-test repository=${result.connection.repository || "n/a"} ok=${result.connection.ok} readOnly=true`);
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "GET" && url.pathname === "/api/queue/history") {
    const history = await readQueueHistory(config.queueHistoryPath, {
      repository: url.searchParams.get("repository") || "",
      limit: Number(url.searchParams.get("limit") || 20)
    });
    return sendJson(response, 200, {
      ok: true,
      history
    });
  }

  if (request.method === "GET" && url.pathname === "/api/feedback") {
    const feedback = await readFeedbackLedger(config.feedbackPath, {
      repository: url.searchParams.get("repository") || "",
      itemKey: url.searchParams.get("itemKey") || "",
      limit: Number(url.searchParams.get("limit") || 20)
    });
    return sendJson(response, 200, {
      ok: true,
      feedback
    });
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/summary") {
    const feedback = await readFeedbackLedger(config.feedbackPath, {
      repository: url.searchParams.get("repository") || ""
    });
    return sendJson(response, 200, {
      ok: true,
      summary: feedback.summary
    });
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/calibration") {
    const calibration = await loadLocalFeedbackCalibration(url.searchParams.get("repository") || "");
    return sendJson(response, 200, calibration);
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/export") {
    const feedback = await readFeedbackLedger(config.feedbackPath, {
      repository: url.searchParams.get("repository") || ""
    });
    return sendJson(response, 200, buildRegressionExport(feedback.entries));
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/candidates") {
    const corpus = await readCandidateCorpus(config.feedbackCandidatesPath, {
      repository: url.searchParams.get("repository") || "",
      limit: Number(url.searchParams.get("limit") || 50)
    });
    return sendJson(response, 200, {
      ok: true,
      corpus,
      replay: replayCandidateCorpus(corpus.candidates)
    });
  }

  if (request.method === "POST" && url.pathname === "/api/feedback/candidates/apply") {
    const rawBody = await readRequestBody(request);
    const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    const feedback = await readFeedbackLedger(config.feedbackPath, {
      repository: payload.repository || ""
    });
    const result = await applyFeedbackFixtureCandidates({
      filePath: config.feedbackCandidatesPath,
      feedbackEntries: feedback.entries,
      caseIds: payload.caseIds || [],
      applyAllRunnable: payload.applyAllRunnable === true,
      maxEntries: config.feedbackCandidatesLimit
    });
    console.log(`[premature-contribution-firewall] feedback-candidates applied=${result.applied?.length || 0} skipped=${result.skipped?.length || 0} corpus=${result.corpus?.summary?.total || 0}`);
    result.calibration = await loadLocalFeedbackCalibration(payload.repository || "");
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/candidates/replay") {
    const corpus = await readCandidateCorpus(config.feedbackCandidatesPath, {
      repository: url.searchParams.get("repository") || ""
    });
    return sendJson(response, 200, replayCandidateCorpus(corpus.candidates));
  }

  if (request.method === "GET" && url.pathname === "/api/feedback/candidates/export") {
    const corpus = await readCandidateCorpus(config.feedbackCandidatesPath, {
      repository: url.searchParams.get("repository") || ""
    });
    const artifact = buildCandidateEvidenceArtifact(corpus.candidates);
    if (url.searchParams.get("format") === "markdown") {
      return send(response, 200, artifact.markdown, "text/markdown; charset=utf-8");
    }
    return sendJson(response, 200, artifact);
  }

  if (request.method === "POST" && url.pathname === "/api/feedback/candidates/compare") {
    const rawBody = await readRequestBody(request);
    const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    const corpus = await readCandidateCorpus(config.feedbackCandidatesPath, {
      repository: payload.repository || ""
    });
    const currentReplay = replayCandidateCorpus(corpus.candidates);
    const comparison = buildCandidateReplayComparison({
      baselineReplay: payload.baselineReplay || payload.baseline || payload.replay,
      currentReplay
    });
    console.log(`[premature-contribution-firewall] feedback-candidates compare ok=${comparison.ok} current=${comparison.summary?.currentTotal || 0} regressed=${comparison.summary?.regressed || 0}`);
    return sendJson(response, comparison.ok ? 200 : 400, comparison);
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    const rawBody = await readRequestBody(request);
    const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
    const result = await recordFeedback(payload);
    const entry = result.feedback?.entry || {};
    console.log(`[premature-contribution-firewall] feedback repository=${entry.repository || "n/a"} item=${entry.itemKey || "n/a"} verdict=${entry.maintainer?.verdict || "n/a"}`);
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "GET" && url.pathname === "/api/benchmark") {
    const includeCases = url.searchParams.get("cases") !== "false";
    return sendJson(response, 200, runBenchmark({ includeCases }));
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/examples/")) {
    const name = url.pathname.split("/").pop();
    const safeName = name.replace(/[^a-z0-9.-]/gi, "");
    const file = join(fixturesDir, safeName.endsWith(".json") ? safeName : `${safeName}.json`);
    const text = await readFile(file, "utf8");
    return send(response, 200, text, "application/json; charset=utf-8");
  }

  if (request.method === "POST" && url.pathname === "/api/evaluate") {
    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody.toString("utf8"));
    const calibration = payload.feedbackCalibration || await loadLocalFeedbackCalibration(payload.repository || payload.input?.repository || "");
    const evaluation = evaluateContribution(payload, { feedbackCalibration: calibration });
    console.log(`[premature-contribution-firewall] evaluated ${evaluation.kind} status=${evaluation.status} score=${evaluation.score}`);
    return sendJson(response, 200, { ok: true, evaluation });
  }

  if (request.method === "POST" && url.pathname === "/api/evaluate-patch") {
    const rawBody = await readRequestBody(request);
    const contentType = request.headers["content-type"] || "";
    const payload = contentType.includes("application/json")
      ? JSON.parse(rawBody.toString("utf8"))
      : { text: rawBody.toString("utf8") };
    const parsed = parsePatchSubmission(payload.text || payload.patchText || "", {
      profile: payload.profile || "kernel-grade",
      repositoryFiles: payload.repositoryFiles || payload.policyFiles || []
    });
    parsed.repository = payload.repository || "";
    parsed.repositoryContext = payload.repositoryContext || payload.repoContext || null;
    const calibration = payload.feedbackCalibration || await loadLocalFeedbackCalibration(payload.repository || "");
    const evaluation = evaluateContribution(parsed, { profile: payload.profile || parsed.profile, feedbackCalibration: calibration });
    console.log(`[premature-contribution-firewall] evaluated patch-series status=${evaluation.status} score=${evaluation.score} patches=${parsed.patchSeries.patchCount}`);
    return sendJson(response, 200, { ok: true, parsed: parsed.patchSeries, evaluation });
  }

  if (request.method === "POST" && url.pathname === "/api/evaluate-batch") {
    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody.toString("utf8"));
    const calibration = payload.feedbackCalibration || await loadLocalFeedbackCalibration(payload.repository || "");
    const result = evaluateBatch(payload, { feedbackCalibration: calibration });
    const requested = result.summary?.requested ?? (Array.isArray(payload.items) ? payload.items.length : "invalid");
    const errors = result.summary?.errors ?? (result.ok ? 0 : 1);
    const errorSuffix = result.error ? ` error=${result.error}` : "";
    console.log(`[premature-contribution-firewall] evaluated batch requested=${requested} errors=${errors}${errorSuffix}`);
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/api/github/queue") {
    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody.toString("utf8"));
    const result = await evaluateGithubQueuePayload(payload);
    console.log(`[premature-contribution-firewall] queue source=${result.queue?.source || "n/a"} repository=${result.queue?.repository || payload.repository || "n/a"} items=${result.queue?.summary?.total ?? 0} errors=${result.collectionErrors?.length || 0}`);
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  const repositoryQueueRoute = parseRepositoryQueuePath(url.pathname);
  if (request.method === "GET" && repositoryQueueRoute) {
    const result = await evaluateGithubQueuePayload({
      owner: repositoryQueueRoute.owner,
      repo: repositoryQueueRoute.repo,
      upstreamRepository: url.searchParams.get("upstream") || config.upstreamRepository || "",
      limit: Number(url.searchParams.get("limit") || config.githubQueueLimit),
      includePullRequests: url.searchParams.get("pulls") !== "false",
      includeIssues: url.searchParams.get("issues") !== "false"
    });
    console.log(`[premature-contribution-firewall] queue source=${result.queue?.source || "n/a"} repository=${result.queue?.repository || "n/a"} items=${result.queue?.summary?.total ?? 0} errors=${result.collectionErrors?.length || 0}`);
    return sendJson(response, result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/webhook/github") {
    const rawBody = await readRequestBody(request);
    const result = await handleGitHubWebhook({
      headers: request.headers,
      rawBody,
      config,
      githubClient
    });
    console.log(`[premature-contribution-firewall] webhook status=${result.statusCode} event=${result.body.event || "n/a"} dryRun=${result.body.dryRun ?? "n/a"}`);
    return sendJson(response, result.statusCode, result.body);
  }

  if (request.method === "GET") {
    return serveStatic(url.pathname, response);
  }

  sendJson(response, 405, { ok: false, error: "method not allowed" });
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);
  if (!filePath.startsWith(publicDir)) {
    return sendJson(response, 403, { ok: false, error: "forbidden" });
  }
  try {
    const content = await readFile(filePath);
    send(response, 200, content, contentType(filePath));
  } catch {
    sendJson(response, 404, { ok: false, error: "not found" });
  }
}

function readRequestBody(request, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, value) {
  send(response, statusCode, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
}

function send(response, statusCode, body, type) {
  response.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

async function evaluateGithubQueuePayload(payload = {}) {
  const repositoryParts = parseRepositoryName(payload.repository);
  const owner = payload.owner || repositoryParts.owner;
  const repo = payload.repo || repositoryParts.repo;
  const upstreamRepository = payload.upstreamRepository || config.upstreamRepository || "";
  const limit = Number(payload.limit || config.githubQueueLimit);

  if (Array.isArray(payload.items)) {
    const calibration = payload.feedbackCalibration || await loadLocalFeedbackCalibration(payload.repository || (owner && repo ? `${owner}/${repo}` : ""));
    const queue = evaluateMaintainerQueue({
      ...payload,
      repository: payload.repository || (owner && repo ? `${owner}/${repo}` : ""),
      upstreamRepository,
      source: payload.source || "supplied",
      dryRun: true,
      feedbackCalibration: calibration
    });
    const result = {
      ok: true,
      dryRun: true,
      collectionErrors: [],
      queue
    };
    result.history = await maybeRecordQueueHistory({ result, requestPayload: payload });
    return result;
  }

  if (!owner || !repo) {
    return {
      ok: false,
      dryRun: true,
      error: "owner and repo are required unless queue items are supplied",
      collectionErrors: [],
      queue: null
    };
  }

  if (!githubClient?.collectRepositoryQueue) {
    return {
      ok: false,
      dryRun: true,
      error: "GitHub queue collection is unavailable",
      collectionErrors: [],
      queue: null
    };
  }

  const collected = await githubClient.collectRepositoryQueue({
    owner,
    repo,
    limit,
    includePullRequests: payload.includePullRequests !== false,
    includeIssues: payload.includeIssues !== false,
    upstreamRepository,
    installationId: payload.installationId || ""
  });
  const calibration = payload.feedbackCalibration || await loadLocalFeedbackCalibration(`${owner}/${repo}`);
  const queue = evaluateMaintainerQueue(collected, {
    source: "github-api",
    repository: `${owner}/${repo}`,
    upstreamRepository,
    feedbackCalibration: calibration
  });
  const result = {
    ok: collected.collectionErrors.length === 0 || queue.items.length > 0,
    dryRun: true,
    collectionErrors: collected.collectionErrors,
    queue
  };
  result.history = await maybeRecordQueueHistory({ result, requestPayload: { ...payload, owner, repo, upstreamRepository, limit } });
  return result;
}

async function testGithubConnection(payload = {}) {
  const repositoryParts = parseRepositoryName(payload.repository);
  const owner = payload.owner || repositoryParts.owner;
  const repo = payload.repo || repositoryParts.repo;
  const setup = createSetupStatus(config);
  if (!owner || !repo) {
    return {
      ok: true,
      dryRun: true,
      setup,
      connection: {
        ok: false,
        tested: false,
        readOnly: true,
        repository: "",
        message: "owner and repo are required to test repository access"
      }
    };
  }
  try {
    const repository = await githubClient.request(`/repos/${owner}/${repo}`);
    return {
      ok: true,
      dryRun: true,
      setup,
      connection: {
        ok: true,
        tested: true,
        readOnly: true,
        repository: repository.full_name || `${owner}/${repo}`,
        private: Boolean(repository.private),
        defaultBranch: repository.default_branch || "",
        htmlUrl: repository.html_url || "",
        message: "Read-only repository access succeeded."
      }
    };
  } catch (error) {
    return {
      ok: false,
      dryRun: true,
      setup,
      connection: {
        ok: false,
        tested: true,
        readOnly: true,
        repository: `${owner}/${repo}`,
        message: error.message
      }
    };
  }
}

async function maybeRecordQueueHistory({ result, requestPayload }) {
  if (!config.queueHistoryEnabled || !result.queue) {
    return {
      recorded: false,
      reason: "queue history disabled"
    };
  }
  try {
    const history = await appendQueueHistory({
      filePath: config.queueHistoryPath,
      queue: result.queue,
      collectionErrors: result.collectionErrors || [],
      request: requestPayload,
      maxEntries: config.queueHistoryLimit
    });
    return {
      recorded: true,
      pathConfigured: Boolean(config.queueHistoryPath),
      summary: history.summary,
      entry: {
        id: history.entries[0]?.id || "",
        recordedAt: history.entries[0]?.recordedAt || "",
        transitions: history.entries[0]?.transitions || {}
      }
    };
  } catch (error) {
    return {
      recorded: false,
      reason: error.message
    };
  }
}

async function recordFeedback(payload = {}) {
  if (!config.feedbackEnabled) {
    return {
      ok: false,
      error: "feedback capture is disabled"
    };
  }
  try {
    const { ledger, entry } = await appendFeedback({
      filePath: config.feedbackPath,
      feedback: payload,
      maxEntries: config.feedbackLimit
    });
    return {
      ok: true,
      feedback: {
        recorded: true,
        pathConfigured: Boolean(config.feedbackPath),
        summary: ledger.summary,
        entry
      },
      calibration: await loadLocalFeedbackCalibration(entry.repository || payload.repository || "")
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

async function loadLocalFeedbackCalibration(repository = "") {
  if (!config.feedbackEnabled) {
    return buildFeedbackCalibration({ repository });
  }
  const [feedback, corpus] = await Promise.all([
    readFeedbackLedger(config.feedbackPath, { repository }),
    readCandidateCorpus(config.feedbackCandidatesPath, { repository })
  ]);
  return buildFeedbackCalibration({
    feedbackEntries: feedback.entries,
    candidates: corpus.candidates,
    repository
  });
}

function parseRepositoryQueuePath(pathname) {
  const match = pathname.match(/^\/api\/repositories\/([^/]+)\/([^/]+)\/queue$/);
  if (!match) return null;
  return {
    owner: decodeURIComponent(match[1]),
    repo: decodeURIComponent(match[2])
  };
}

function parseRepositoryName(repository = "") {
  const match = String(repository || "").match(/^([^/\s]+)\/([^/\s]+)$/);
  return match ? { owner: match[1], repo: match[2] } : { owner: "", repo: "" };
}

function contentType(filePath) {
  const ext = extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
