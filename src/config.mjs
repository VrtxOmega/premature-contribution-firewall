import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadConfig(cwd = process.cwd(), env = process.env) {
  loadDotEnv(join(cwd, ".env"), env);
  return {
    host: env.PCF_HOST || "127.0.0.1",
    port: Number(env.PCF_PORT || 3791),
    webhookSecret: env.PCF_WEBHOOK_SECRET || "",
    dryRun: env.PCF_DRY_RUN !== "false",
    postComments: env.PCF_POST_COMMENTS === "true",
    applyLabels: env.PCF_APPLY_LABELS === "true",
    collectRepositoryContext: env.PCF_COLLECT_REPOSITORY_CONTEXT !== "false",
    upstreamRepository: env.PCF_UPSTREAM_REPOSITORY || "",
    githubQueueLimit: clampNumber(env.PCF_GITHUB_QUEUE_LIMIT, 25, 1, 100),
    githubCacheTtlMs: clampNumber(env.PCF_GITHUB_CACHE_TTL_MS, 60_000, 0, 10 * 60_000),
    githubSearchDelayMs: clampNumber(env.PCF_GITHUB_SEARCH_DELAY_MS, 2_000, 0, 30_000),
    queueHistoryEnabled: env.PCF_QUEUE_HISTORY_ENABLED !== "false",
    queueHistoryPath: env.PCF_QUEUE_HISTORY_PATH || join(cwd, "data", "queue-history.json"),
    queueHistoryLimit: clampNumber(env.PCF_QUEUE_HISTORY_LIMIT, 50, 1, 500),
    feedbackEnabled: env.PCF_FEEDBACK_ENABLED !== "false",
    feedbackPath: env.PCF_FEEDBACK_PATH || join(cwd, "data", "feedback.json"),
    feedbackLimit: clampNumber(env.PCF_FEEDBACK_LIMIT, 200, 1, 1000),
    feedbackCandidatesPath: env.PCF_FEEDBACK_CANDIDATES_PATH || join(cwd, "data", "feedback-candidates.json"),
    feedbackCandidatesLimit: clampNumber(env.PCF_FEEDBACK_CANDIDATES_LIMIT, 250, 1, 1000),
    githubAppId: env.GITHUB_APP_ID || "",
    githubPrivateKeyPath: env.GITHUB_PRIVATE_KEY_PATH || "",
    githubToken: env.GITHUB_TOKEN || env.GH_TOKEN || "",
    githubApiBase: env.GITHUB_API_BASE || "https://api.github.com"
  };
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function loadDotEnv(path, env) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!Object.hasOwn(env, key)) env[key] = value;
  }
}
