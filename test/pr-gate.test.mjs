import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = new URL("..", import.meta.url);

function readyPullRequestEvent() {
  return {
    action: "opened",
    pull_request: {
      number: 7,
      title: "Fix webhook signature rejection for valid GitHub payloads",
      body: "Fixes #42.\n\n## Problem\nValid GitHub webhook payloads were rejected when the signature header used uppercase hex.\n\n## Changes\nNormalize the digest comparison and keep timing-safe comparison.\n\n## Verification\n- npm test\n- Replayed a signed fixture before and after the fix\n\n## Risk\nLow. The change is isolated to webhook signature parsing.",
      author_association: "CONTRIBUTOR",
      draft: false,
      changed_files: 3,
      additions: 74,
      deletions: 18,
      labels: [],
      html_url: "https://github.com/owner/repo/pull/7"
    },
    repository: {
      name: "repo",
      owner: { login: "owner" }
    },
    checks: [{ name: "test", conclusion: "success" }]
  };
}

function unreadyPullRequestEvent() {
  return {
    action: "opened",
    pull_request: {
      number: 8,
      title: "fix stuff",
      body: "",
      author_association: "NONE",
      draft: false,
      changed_files: 40,
      additions: 5000,
      deletions: 12,
      labels: [],
      html_url: "https://github.com/owner/repo/pull/8"
    },
    repository: {
      name: "repo",
      owner: { login: "owner" }
    }
  };
}

async function writeEvent(dir, name, payload) {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(payload), "utf8");
  return path;
}

test("PR gate evaluates a ready PR, writes summary and outputs, and exits 0", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-pr-gate-"));
  const eventPath = await writeEvent(dir, "event.json", readyPullRequestEvent());
  const summaryPath = join(dir, "summary.md");
  const outputPath = join(dir, "output.txt");
  await writeFile(summaryPath, "", "utf8");
  await writeFile(outputPath, "", "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/run-pr-gate.mjs", "--event", eventPath, "--fail-on", "never"],
    {
      cwd,
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_OUTPUT: outputPath
      }
    }
  );

  assert.match(stdout, /PCF PR gate: owner\/repo#7/);
  assert.match(stdout, /Status: ready-for-maintainer/);

  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /## PCF review-readiness #7/);
  assert.match(summary, /ready-for-maintainer/);
  assert.match(summary, /made no comments, labels, or other GitHub writes/);

  const output = await readFile(outputPath, "utf8");
  assert.match(output, /status=ready-for-maintainer/);
  assert.match(output, /ready=true/);
});

test("PR gate fails an unready PR when --fail-on needs-repair", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-pr-gate-"));
  const eventPath = await writeEvent(dir, "event.json", unreadyPullRequestEvent());

  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["scripts/run-pr-gate.mjs", "--event", eventPath, "--fail-on", "needs-repair"],
      { cwd, env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } }
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /PR gate failed: status (needs-repair|low-review-value) meets fail-on threshold needs-repair/);
      return true;
    }
  );
});

test("PR gate never fails when --fail-on never even for unready PRs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-pr-gate-"));
  const eventPath = await writeEvent(dir, "event.json", unreadyPullRequestEvent());
  const writeTarget = join(dir, "pr-gate.md");

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/run-pr-gate.mjs", "--event", eventPath, "--fail-on", "never", "--write", writeTarget],
    { cwd, env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } }
  );

  assert.match(stdout, /Fail-on policy: never/);
  const markdown = await readFile(writeTarget, "utf8");
  assert.match(markdown, /Fix before requesting review:/);
});

test("PR gate rejects non-pull_request events with usage exit code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-pr-gate-"));
  const eventPath = await writeEvent(dir, "event.json", { action: "opened", issue: { number: 1 } });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["scripts/run-pr-gate.mjs", "--event", eventPath],
      { cwd, env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } }
    ),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /does not contain a pull_request object/);
      return true;
    }
  );
});

test("PR gate rejects invalid fail-on values", async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["scripts/run-pr-gate.mjs", "--fail-on", "sometimes"],
      { cwd, env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" } }
    ),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Invalid --fail-on value/);
      return true;
    }
  );
});
