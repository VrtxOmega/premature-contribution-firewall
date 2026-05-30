import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSetupStatus, sanitizeSetupForLog } from "../src/core/setup.mjs";

test("setup status reports safe dry-run posture without exposing secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-setup-"));
  const keyPath = join(dir, "app.pem");
  await writeFile(keyPath, "not a real key", "utf8");
  try {
    const setup = buildSetupStatus({
      dryRun: true,
      postComments: false,
      applyLabels: false,
      webhookSecret: "SENSITIVE_WEBHOOK_SECRET_VALUE_12345",
      githubAppId: "123",
      githubPrivateKeyPath: keyPath,
      collectRepositoryContext: true,
      queueHistoryEnabled: true,
      queueHistoryPath: join(dir, "history.json")
    });

    assert.equal(setup.ok, true);
    assert.equal(setup.mode, "dry-run");
    assert.equal(setup.safety.verdict, "safe-dry-run-or-read-only");
    assert.equal(setup.github.appAuthReady, true);
    assert.equal(setup.github.privateKeyFile, "app.pem");
    assert.equal(JSON.stringify(setup).includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
    assert.equal(setup.checklist.some((item) => item.id === "queue-history" && item.ok), true);
    assert.equal(setup.pilot.estimatedMinutes, 10);
    assert.ok(setup.pilot.steps.some((step) => step.id === "queue" && step.command.includes("/api/github/queue")));
    assert.ok(setup.pilot.steps.some((step) => step.id === "feedback" && step.command.includes("/api/feedback/calibration")));
    assert.equal(JSON.stringify(setup.pilot).includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setup status blocks write mode when credentials are incomplete", () => {
  const setup = buildSetupStatus({
    dryRun: false,
    postComments: true,
    applyLabels: true,
    webhookSecret: "",
    githubAppId: "",
    githubPrivateKeyPath: "/missing/app.pem"
  });
  const log = sanitizeSetupForLog(setup);

  assert.equal(setup.mode, "write-armed");
  assert.equal(setup.safety.writesArmed, true);
  assert.equal(setup.safety.writeReady, false);
  assert.equal(setup.safety.verdict, "writes-blocked-by-setup");
  assert.ok(setup.warnings.some((warning) => warning.includes("incomplete")));
  assert.ok(setup.pilot.blockedBy.some((warning) => warning.includes("incomplete")));
  assert.equal(log.writeReady, false);
});
