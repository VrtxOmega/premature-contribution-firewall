import test from "node:test";
import assert from "node:assert/strict";
import { buildSetupGuide, renderSetupGuideMarkdown, renderSetupGuideText } from "../src/core/setup-guide.mjs";

test("guided setup prints the GitHub App path from zero to dry-run queue", () => {
  const guide = buildSetupGuide({
    host: "127.0.0.1",
    port: 3791,
    dryRun: true,
    postComments: false,
    applyLabels: false,
    webhookSecret: "SENSITIVE_WEBHOOK_SECRET_VALUE_12345",
    githubAppId: "12345",
    githubPrivateKeyPath: "",
    collectRepositoryContext: true,
    githubQueueLimit: 25,
    queueHistoryEnabled: true
  }, {
    repository: "kernel/linux",
    baseUrl: "http://127.0.0.1:3791",
    publicBaseUrl: "https://pcf.example.test"
  });

  assert.equal(guide.ok, true);
  assert.equal(guide.target.repository, "kernel/linux");
  assert.equal(guide.target.webhookPayloadUrl, "https://pcf.example.test/webhook/github");
  assert.equal(guide.safety.verdict, "safe-dry-run-or-read-only");
  assert.ok(guide.githubApp.permissions.every((permission) => permission.access === "Read-only"));
  assert.deepEqual(guide.githubApp.events, ["issues", "pull_request"]);
  assert.match(guide.commands.testConnection, /"owner":"kernel"/);
  assert.match(guide.commands.repositoryQueue, /\/api\/repositories\/kernel\/linux\/queue\?limit=25/);
  assert.equal(JSON.stringify(guide).includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
});

test("guided setup renderers are README-ready and secret-redacted", () => {
  const guide = buildSetupGuide({
    host: "127.0.0.1",
    port: 3791,
    dryRun: true,
    webhookSecret: "SENSITIVE_WEBHOOK_SECRET_VALUE_12345",
    githubAppId: "",
    githubPrivateKeyPath: ""
  }, {
    repository: "owner/repo"
  });

  const text = renderSetupGuideText(guide);
  const markdown = renderSetupGuideMarkdown(guide);

  assert.match(text, /GitHub App registration checklist/);
  assert.match(text, /First dry-run proof/);
  assert.match(markdown, /## GitHub App Registration/);
  assert.match(markdown, /curl -s http:\/\/127\.0\.0\.1:3791\/api\/github\/setup/);
  assert.equal(text.includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
  assert.equal(markdown.includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
});
