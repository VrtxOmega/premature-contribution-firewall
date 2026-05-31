import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI evaluates a fixture in pretty mode", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "evaluate", "fixtures/pr-ready.json"], {
    cwd: new URL("..", import.meta.url)
  });
  assert.match(stdout, /Premature Contribution Firewall pull_request: ready-for-maintainer/);
  assert.match(stdout, /Profile: Standard Maintainer/);
  assert.match(stdout, /Review budget:/);
  assert.match(stdout, /Repair checklist:/);
});

test("CLI emits JSON when requested", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "evaluate", "fixtures/issue-unready.json", "--format", "json"], {
    cwd: new URL("..", import.meta.url)
  });
  const data = JSON.parse(stdout);
  assert.equal(data.kind, "issue");
  assert.equal(data.status, "low-review-value");
});

test("CLI can force the kernel-grade profile", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "evaluate", "fixtures/pr-ready.json", "--profile", "kernel-grade", "--format", "json"], {
    cwd: new URL("..", import.meta.url)
  });
  const data = JSON.parse(stdout);
  assert.equal(data.profile.id, "kernel-grade");
  assert.ok(data.labels.includes("needs-dco-signoff"));
});

test("CLI evaluates a plain-text patch in kernel-grade mode", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "evaluate-patch", "fixtures/patch-kernel-ready.patch", "--format", "json"], {
    cwd: new URL("..", import.meta.url)
  });
  const data = JSON.parse(stdout);
  assert.equal(data.submissionFormat, "patch_series");
  assert.equal(data.status, "ready-for-maintainer");
  assert.equal(data.profile.id, "kernel-grade");
  assert.equal(data.patchSeries.patchCount, 1);
});

test("CLI prints guided setup for a target repository", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "setup", "--repository", "owner/repo"], {
    cwd: new URL("..", import.meta.url)
  });

  assert.match(stdout, /Premature Contribution Firewall guided pilot setup/);
  assert.match(stdout, /GitHub App registration checklist/);
  assert.match(stdout, /api\/repositories\/owner\/repo\/queue\?limit=25/);
});

test("CLI prints maintainer queue next-action lanes", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "queue", "fixtures/queue-sample.json"], {
    cwd: new URL("..", import.meta.url)
  });

  assert.match(stdout, /Premature Contribution Firewall queue: 3 item\(s\)/);
  assert.match(stdout, /Next action lanes:/);
  assert.match(stdout, /Review now: 1 item\(s\), owner maintainer/);
  assert.match(stdout, /Check duplicate or fixed first: 1 item\(s\), owner maintainer/);
  assert.match(stdout, /Ask reporter: 1 item\(s\), owner reporter/);
  assert.match(stdout, /next: Send a focused repair request to the submitter/);
  assert.match(stdout, /response draft: Reporter repair request \(reporter, dry-run\)/);
  assert.match(stdout, /No comments, labels, closures, merges, or other GitHub writes were made automatically/);
});

test("CLI emits queue JSON with enriched nextAction contract", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "queue", "fixtures/queue-sample.json", "--format", "json"], {
    cwd: new URL("..", import.meta.url)
  });
  const data = JSON.parse(stdout);

  assert.equal(data.summary.total, 3);
  assert.ok(data.nextActionGroups.some((group) => group.id === "ask-reporter-for-evidence" && group.owner === "reporter"));
  assert.equal(data.items[0].nextAction.owner, "maintainer");
  assert.ok(Array.isArray(data.items[1].nextAction.evidence.labels));
  assert.ok(data.items[1].nextAction.maintainerAction.includes("Check related"));
  assert.equal(data.items[1].responseTemplate.dryRun, true);
  assert.equal(data.items[1].responseTemplate.shouldPost, false);
  assert.match(data.items[1].responseTemplate.body, /check related or already-fixed work/);
});

test("CLI emits guided setup JSON without secret values", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "setup", "--repository", "owner/repo", "--format", "json"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PCF_WEBHOOK_SECRET: "SENSITIVE_WEBHOOK_SECRET_VALUE_12345"
    }
  });
  const data = JSON.parse(stdout);

  assert.equal(data.ok, true);
  assert.equal(data.target.repository, "owner/repo");
  assert.equal(stdout.includes("SENSITIVE_WEBHOOK_SECRET_VALUE_12345"), false);
});
