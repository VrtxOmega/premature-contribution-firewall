import { existsSync } from "node:fs";
import { basename } from "node:path";

export function buildSetupStatus(config = {}) {
  const appIdConfigured = Boolean(config.githubAppId);
  const privateKeyConfigured = Boolean(config.githubPrivateKeyPath);
  const privateKeyReadable = privateKeyConfigured && existsSync(config.githubPrivateKeyPath);
  const webhookSecretConfigured = Boolean(config.webhookSecret);
  const tokenConfigured = Boolean(config.githubToken);
  const writesRequested = Boolean(config.postComments || config.applyLabels);
  const writesArmed = config.dryRun === false && writesRequested;
  const appAuthReady = appIdConfigured && privateKeyConfigured && privateKeyReadable;
  const writeReady = writesArmed && appAuthReady && webhookSecretConfigured;
  const mode = config.dryRun !== false
    ? "dry-run"
    : writesRequested
      ? "write-armed"
      : "read-only";
  const warnings = setupWarnings({
    appIdConfigured,
    privateKeyConfigured,
    privateKeyReadable,
    webhookSecretConfigured,
    writesRequested,
    writesArmed,
    appAuthReady,
    writeReady,
    config
  });

  return {
    ok: true,
    app: "premature-contribution-firewall",
    mode,
    dryRun: config.dryRun !== false,
    safety: {
      writesRequested,
      writesArmed,
      writeReady,
      postComments: Boolean(config.postComments),
      applyLabels: Boolean(config.applyLabels),
      verdict: writeReady
        ? "writes-enabled"
        : writesArmed
          ? "writes-blocked-by-setup"
          : "safe-dry-run-or-read-only"
    },
    github: {
      apiBase: config.githubApiBase || "https://api.github.com",
      appIdConfigured,
      privateKeyConfigured,
      privateKeyReadable,
      privateKeyFile: privateKeyConfigured ? basename(config.githubPrivateKeyPath) : "",
      appAuthReady,
      tokenConfigured,
      webhookSecretConfigured,
      collectRepositoryContext: config.collectRepositoryContext !== false,
      upstreamRepository: config.upstreamRepository || "",
      queueLimit: config.githubQueueLimit || 25,
      cacheTtlMs: config.githubCacheTtlMs ?? 60_000
    },
    history: {
      enabled: config.queueHistoryEnabled !== false,
      limit: config.queueHistoryLimit || 50,
      pathConfigured: Boolean(config.queueHistoryPath)
    },
    pilot: buildPilotPlan({ config, mode, appAuthReady, writeReady, warnings }),
    checklist: [
      checklistItem("webhook-secret", "Webhook secret configured", webhookSecretConfigured, webhookSecretConfigured ? "Webhook signatures can be verified." : "Set PCF_WEBHOOK_SECRET before accepting real webhooks."),
      checklistItem("github-app-id", "GitHub App ID configured", appIdConfigured, appIdConfigured ? "GitHub App identity is present." : "Set GITHUB_APP_ID for installation-authenticated reads or writes."),
      checklistItem("github-private-key", "GitHub private key readable", privateKeyReadable, privateKeyReadable ? "Private key file exists and is readable by this process." : "Set GITHUB_PRIVATE_KEY_PATH to a readable GitHub App private key file."),
      checklistItem("dry-run", "Dry-run safety", config.dryRun !== false, config.dryRun !== false ? "GitHub writes are disabled." : "Dry-run is disabled; write settings must be intentional."),
      checklistItem("queue-history", "Queue history enabled", config.queueHistoryEnabled !== false, config.queueHistoryEnabled !== false ? "Queue runs will be recorded locally." : "Queue history is disabled.")
    ],
    warnings
  };
}

export function sanitizeSetupForLog(setupStatus = {}) {
  return {
    mode: setupStatus.mode,
    writesArmed: Boolean(setupStatus.safety?.writesArmed),
    writeReady: Boolean(setupStatus.safety?.writeReady),
    appAuthReady: Boolean(setupStatus.github?.appAuthReady),
    webhookSecretConfigured: Boolean(setupStatus.github?.webhookSecretConfigured),
    historyEnabled: Boolean(setupStatus.history?.enabled),
    warnings: setupStatus.warnings || []
  };
}

function setupWarnings(state) {
  const warnings = [];
  if (!state.webhookSecretConfigured) {
    warnings.push("PCF_WEBHOOK_SECRET is not configured; real GitHub webhooks cannot be authenticated.");
  }
  if (state.privateKeyConfigured && !state.privateKeyReadable) {
    warnings.push("GITHUB_PRIVATE_KEY_PATH is configured but the private key file is not readable.");
  }
  if (state.writesArmed && !state.writeReady) {
    warnings.push("Write mode was requested, but GitHub App credentials or webhook secret are incomplete.");
  }
  if (state.config.dryRun !== false && state.writesRequested) {
    warnings.push("Comment or label writes are requested, but dry-run mode is still active.");
  }
  if (state.config.dryRun === false && !state.writesRequested) {
    warnings.push("Dry-run is disabled, but no write action is enabled; the app will still behave read-only.");
  }
  return warnings;
}

function checklistItem(id, label, ok, detail) {
  return {
    id,
    label,
    ok: Boolean(ok),
    status: ok ? "pass" : "warn",
    detail
  };
}

function buildPilotPlan({ config, mode, appAuthReady, writeReady, warnings }) {
  const dryRunSafe = config.dryRun !== false;
  const baseUrl = `http://${config.host || "127.0.0.1"}:${config.port || 3791}`;
  return {
    estimatedMinutes: 10,
    phase: writeReady ? "write-ready-after-dry-run-review" : "dry-run-first",
    mode,
    readyFor: writeReady
      ? "A maintainer can review dry-run output and deliberately decide whether to allow writes."
      : "Local dry-run evaluation, queue sorting, feedback capture, candidate replay, and read-only connection checks.",
    blockedBy: warnings,
    safeDefaults: [
      "PCF_DRY_RUN stays true unless explicitly disabled.",
      "PCF_POST_COMMENTS and PCF_APPLY_LABELS stay false by default.",
      "Queue history and feedback evidence stay local under data/ by default."
    ],
    steps: [
      pilotStep("verify", "Run local proof gates", "npm run ci:gates", "manual", "Proves repository hygiene, syntax, tests, benchmark, red-test, and maintainer demo."),
      pilotStep("start", "Start the local server", "npm start", "manual", "Serves the browser UI and local API."),
      pilotStep("setup", "Check sanitized setup posture", `curl ${baseUrl}/api/github/setup`, dryRunSafe ? "pass" : "warn", "Returns booleans and safe metadata only."),
      pilotStep("connection", "Test read-only repository access", `curl -s -H 'Content-Type: application/json' --data '{\"owner\":\"octocat\",\"repo\":\"Hello-World\"}' ${baseUrl}/api/github/test-connection`, appAuthReady ? "ready" : "manual", "Requires GitHub App credentials for authenticated repository reads."),
      pilotStep("queue", "Run a dry-run maintainer queue", `curl -s -H 'Content-Type: application/json' --data-binary @fixtures/queue-sample.json ${baseUrl}/api/github/queue`, "manual", "Sorts ready, repair-needed, and low-value work without writing to GitHub."),
      pilotStep("feedback", "Capture and replay maintainer feedback", `curl ${baseUrl}/api/feedback/calibration`, "manual", "Shows whether local corrections and promoted candidates are calibrating future triage.")
    ]
  };
}

function pilotStep(id, label, command, status, detail) {
  return {
    id,
    label,
    command,
    status,
    detail
  };
}
