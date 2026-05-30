import { buildSetupStatus } from "./setup.mjs";

const APP_NAME = "Premature Contribution Firewall";
const APP_SLUG = "premature-contribution-firewall";
const DEFAULT_REPOSITORY = "owner/repo";

export function buildSetupGuide(config = {}, options = {}) {
  const setup = buildSetupStatus(config);
  const repository = normalizeRepository(options.repository || options.repo || "");
  const targetRepository = repository || DEFAULT_REPOSITORY;
  const [owner, repo] = targetRepository.split("/");
  const baseUrl = normalizeBaseUrl(options.baseUrl) || `http://${config.host || "127.0.0.1"}:${config.port || 3791}`;
  const publicBaseUrl = normalizeBaseUrl(options.publicBaseUrl || options.webhookBaseUrl || "");
  const webhookPayloadUrl = publicBaseUrl
    ? `${publicBaseUrl}/webhook/github`
    : "public HTTPS URL ending in /webhook/github";

  return {
    ok: true,
    app: APP_SLUG,
    title: `${APP_NAME} guided pilot setup`,
    mode: setup.mode,
    dryRun: setup.dryRun,
    target: {
      repository: targetRepository,
      owner,
      repo,
      baseUrl,
      webhookPayloadUrl
    },
    safety: setup.safety,
    currentSetup: setup,
    promise: "A maintainer should be able to go from clone to first dry-run queue result without enabling GitHub writes.",
    githubApp: buildGitHubAppChecklist({ targetRepository, webhookPayloadUrl }),
    env: buildEnvGuide({ config, setup }),
    commands: buildPilotCommands({ baseUrl, owner, repo, targetRepository }),
    exitCriteria: [
      "Local proof gates pass.",
      "The setup endpoint returns only booleans and safe metadata.",
      "The connection test can read the target repository or reports an actionable read-only error.",
      "The first queue result is dry-run and contains no posted comments or labels.",
      "Queue history records the run locally under data/ unless explicitly disabled."
    ],
    warnings: setup.warnings
  };
}

export function renderSetupGuideText(guide = {}) {
  const lines = [
    `${guide.title || `${APP_NAME} guided pilot setup`}`,
    "",
    `Target repository: ${guide.target?.repository || DEFAULT_REPOSITORY}`,
    `Local API: ${guide.target?.baseUrl || "http://127.0.0.1:3791"}`,
    `Mode: ${guide.mode || "dry-run"}`,
    `Write posture: ${guide.safety?.verdict || "safe-dry-run-or-read-only"}`,
    "",
    "1. Local start",
    ...guide.commands.localStart.map((command) => `   ${command}`),
    "",
    "2. GitHub App registration checklist",
    `   Registration URL: ${guide.githubApp.registrationUrl}`,
    ...guide.githubApp.fields.map((field) => `   - ${field.label}: ${field.value}`),
    "",
    "3. Required repository permissions",
    ...guide.githubApp.permissions.map((permission) => `   - ${permission.name}: ${permission.access} (${permission.why})`),
    "",
    "4. Subscribe to webhook events",
    ...guide.githubApp.events.map((event) => `   - ${event}`),
    "",
    "5. Safe .env values",
    ...guide.env.values.map((entry) => `   ${entry.key}=${entry.displayValue}`),
    "",
    "6. First dry-run proof",
    `   ${guide.commands.checkSetup}`,
    `   ${guide.commands.testConnection}`,
    `   ${guide.commands.fixtureQueue}`,
    `   ${guide.commands.repositoryQueue}`,
    "",
    "Exit criteria",
    ...guide.exitCriteria.map((item) => `   - ${item}`)
  ];

  if (guide.warnings?.length) {
    lines.push("", "Warnings", ...guide.warnings.map((warning) => `   - ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}

export function renderSetupGuideMarkdown(guide = {}) {
  const lines = [
    `# ${guide.title || `${APP_NAME} guided pilot setup`}`,
    "",
    `Target repository: \`${guide.target?.repository || DEFAULT_REPOSITORY}\``,
    `Local API: \`${guide.target?.baseUrl || "http://127.0.0.1:3791"}\``,
    `Mode: \`${guide.mode || "dry-run"}\``,
    `Write posture: \`${guide.safety?.verdict || "safe-dry-run-or-read-only"}\``,
    "",
    "## Local Start",
    "",
    "```bash",
    ...guide.commands.localStart,
    "```",
    "",
    "## GitHub App Registration",
    "",
    `Registration URL: ${guide.githubApp.registrationUrl}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...guide.githubApp.fields.map((field) => `| ${field.label} | ${field.value.replaceAll("|", "\\|")} |`),
    "",
    "## Repository Permissions",
    "",
    "| Permission | Access | Why |",
    "| --- | --- | --- |",
    ...guide.githubApp.permissions.map((permission) => `| ${permission.name} | ${permission.access} | ${permission.why} |`),
    "",
    "## Webhook Events",
    "",
    ...guide.githubApp.events.map((event) => `- \`${event}\``),
    "",
    "## Safe Env",
    "",
    "```bash",
    ...guide.env.values.map((entry) => `${entry.key}=${entry.displayValue}`),
    "```",
    "",
    "## First Dry-Run Proof",
    "",
    "```bash",
    guide.commands.checkSetup,
    guide.commands.testConnection,
    guide.commands.fixtureQueue,
    guide.commands.repositoryQueue,
    "```",
    "",
    "## Exit Criteria",
    "",
    ...guide.exitCriteria.map((item) => `- ${item}`)
  ];

  if (guide.warnings?.length) {
    lines.push("", "## Warnings", "", ...guide.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}

function buildGitHubAppChecklist({ targetRepository, webhookPayloadUrl }) {
  return {
    registrationUrl: "https://github.com/settings/apps/new",
    installTarget: targetRepository,
    fields: [
      guideField("GitHub App name", `${APP_NAME} - ${targetRepository}`),
      guideField("Homepage URL", "https://github.com/VrtxOmega/premature-contribution-firewall"),
      guideField("Webhook active", "enabled"),
      guideField("Webhook URL", webhookPayloadUrl),
      guideField("Webhook content type", "application/json"),
      guideField("Webhook secret", "same value as PCF_WEBHOOK_SECRET"),
      guideField("Install scope", `only ${targetRepository} for the pilot`)
    ],
    permissions: [
      permission("Metadata", "Read-only", "required by GitHub Apps"),
      permission("Issues", "Read-only", "read public issue queues and duplicate/already-solved context"),
      permission("Pull requests", "Read-only", "read PR titles, bodies, state, and changed files"),
      permission("Contents", "Read-only", "read repository policy files such as CONTRIBUTING and CODEOWNERS when available")
    ],
    optionalWriteUpgrade: [
      permission("Issues", "Read and write", "only if PCF_POST_COMMENTS or PCF_APPLY_LABELS is deliberately enabled"),
      permission("Pull requests", "Read and write", "only if PR comment workflows are deliberately enabled")
    ],
    events: ["issues", "pull_request"]
  };
}

function buildEnvGuide({ config, setup }) {
  const port = String(config.port || 3791);
  const host = config.host || "127.0.0.1";
  return {
    values: [
      envValue("PCF_PORT", port, true),
      envValue("PCF_HOST", host, true),
      envValue("PCF_WEBHOOK_SECRET", setup.github?.webhookSecretConfigured ? "[configured]" : "paste generated webhook secret", setup.github?.webhookSecretConfigured, true),
      envValue("PCF_DRY_RUN", "true", config.dryRun !== false),
      envValue("PCF_POST_COMMENTS", "false", !config.postComments),
      envValue("PCF_APPLY_LABELS", "false", !config.applyLabels),
      envValue("PCF_COLLECT_REPOSITORY_CONTEXT", config.collectRepositoryContext === false ? "false" : "true", config.collectRepositoryContext !== false),
      envValue("PCF_GITHUB_QUEUE_LIMIT", String(config.githubQueueLimit || 25), true),
      envValue("PCF_QUEUE_HISTORY_ENABLED", config.queueHistoryEnabled === false ? "false" : "true", config.queueHistoryEnabled !== false),
      envValue("GITHUB_APP_ID", setup.github?.appIdConfigured ? "[configured]" : "paste numeric GitHub App ID", setup.github?.appIdConfigured),
      envValue("GITHUB_PRIVATE_KEY_PATH", setup.github?.privateKeyConfigured ? "[configured]" : "path/to/github-app-private-key.pem", setup.github?.privateKeyConfigured, true),
      envValue("GITHUB_API_BASE", config.githubApiBase || "https://api.github.com", true)
    ]
  };
}

function buildPilotCommands({ baseUrl, owner, repo, targetRepository }) {
  return {
    localStart: [
      "npm install",
      "npm run ci:gates",
      "cp .env.example .env",
      "openssl rand -hex 32",
      "npm start"
    ],
    checkSetup: `curl -s ${baseUrl}/api/github/setup`,
    testConnection: `curl -s -H 'Content-Type: application/json' --data '{"owner":"${owner}","repo":"${repo}"}' ${baseUrl}/api/github/test-connection`,
    fixtureQueue: `curl -s -H 'Content-Type: application/json' --data-binary @fixtures/queue-sample.json ${baseUrl}/api/github/queue`,
    repositoryQueue: `curl -s '${baseUrl}/api/repositories/${owner}/${repo}/queue?limit=25'`,
    feedbackCalibration: `curl -s ${baseUrl}/api/feedback/calibration`,
    cli: `node src/cli.mjs setup --repository ${targetRepository}`
  };
}

function guideField(label, value) {
  return { label, value };
}

function permission(name, access, why) {
  return { name, access, why };
}

function envValue(key, displayValue, configured = false, secret = false) {
  return {
    key,
    displayValue,
    configured: Boolean(configured),
    secret: Boolean(secret)
  };
}

function normalizeRepository(repository) {
  const trimmed = String(repository || "").trim();
  if (!trimmed || !trimmed.includes("/")) return "";
  const [owner, repo] = trimmed.split("/");
  if (!owner || !repo) return "";
  return `${owner}/${repo}`;
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed;
}
