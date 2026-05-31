import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildPublicPilotReport,
  runPublicPilotCli
} from "../scripts/run-public-pilot.mjs";
import {
  buildPublicPilotProof,
  renderPublicPilotMarkdown,
  renderPublicPilotSummary
} from "../src/core/pilot-proof.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/run-public-pilot.mjs", import.meta.url));
const fixturePath = fileURLToPath(new URL("../fixtures/queue-sample.json", import.meta.url));
const localHomePrefix = ["/", "home", "/"].join("");

test("public pilot proof emphasizes review priority and context intelligence", async () => {
  const proof = await buildPublicPilotReport({
    fixturePath,
    generatedAt: "2026-05-30T10:00:00Z"
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.dryRun, true);
  assert.equal(proof.breakdown.total, 3);
  assert.equal(proof.breakdown.reviewNow, 1);
  assert.equal(proof.breakdown.sendRepairRequest, 1);
  assert.equal(proof.breakdown.doNotReviewYet, 1);
  assert.equal(proof.context.findings, 3);
  assert.equal(proof.context.itemsChecked, 3);
  assert.equal(proof.context.itemsCleared, 2);
  assert.equal(proof.context.labels["possibly-duplicate"], 1);
  assert.equal(proof.context.labels["possibly-upstream-fixed"], 1);
  assert.equal(proof.context.collectionErrors.length, 0);
  assert.ok(proof.redTestLeads.length >= 1);
  assert.ok(proof.nonClaims.some((claim) => claim.includes("read-only shadow pilot")));
});

test("public pilot markdown is maintainer-readable and path-safe", async () => {
  const proof = await buildPublicPilotReport({
    fixturePath,
    generatedAt: "2026-05-30T10:00:00Z"
  });
  const markdown = renderPublicPilotMarkdown(proof);
  const summary = renderPublicPilotSummary(proof);

  assert.match(markdown, /Review Priority Breakdown/);
  assert.match(markdown, /Context Intelligence/);
  assert.match(markdown, /Items checked with repository context: 3/);
  assert.match(markdown, /Context Summary/);
  assert.match(markdown, /Potential Red-Test Leads/);
  assert.match(markdown, /send-repair-request/);
  assert.match(summary, /Send repair request: 1/);
  assert.match(summary, /Context checked: 3/);
  assert.equal(markdown.includes(localHomePrefix), false);
  assert.equal(markdown.includes("GITHUB_TOKEN="), false);
});

test("public pilot CLI emits JSON from fixture without network", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "--fixture",
    fixturePath,
    "--format",
    "json"
  ], { cwd: repoRoot });
  const proof = JSON.parse(stdout);

  assert.equal(proof.breakdown.total, 3);
  assert.equal(proof.context.findings, 3);
  assert.equal(proof.setup.collectRepositoryContext, true);
});

test("public pilot artifact surfaces per-item repository context failures", () => {
  const proof = buildPublicPilotProof({
    repository: "owner/repo",
    queuePayload: {
      repository: "owner/repo",
      items: [
        {
          kind: "issue",
          number: 1,
          title: "Webhook dry-run response omits labels",
          body: [
            "Steps to reproduce: run the queue.",
            "Expected: labels appear.",
            "Actual: labels are missing.",
            "Environment: current main.",
            "Logs:",
            "```text",
            "labels missing",
            "```"
          ].join("\n"),
          repositoryContext: {
            source: "github-api",
            repository: "owner/repo",
            error: "GitHub API 403 rate limit exceeded"
          }
        }
      ]
    },
    generatedAt: "2026-05-30T10:00:00Z"
  });
  const markdown = renderPublicPilotMarkdown(proof);

  assert.equal(proof.context.itemsUnavailable, 1);
  assert.equal(proof.context.collectionErrors.length, 1);
  assert.match(markdown, /repo-context-unavailable/);
  assert.match(markdown, /issue#1/);
});

test("public pilot CLI writes markdown artifact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-public-pilot-"));
  const outputPath = join(dir, "pilot.md");
  try {
    await runPublicPilotCli([
      "--fixture",
      fixturePath,
      "--format",
      "markdown",
      "--write",
      outputPath
    ]);

    const markdown = await readFile(outputPath, "utf8");
    assert.match(markdown, /Premature Contribution Firewall Public Repo Pilot Proof/);
    assert.match(markdown, /Review now: 1/);
    assert.match(markdown, /No collection errors/);
    assert.equal(markdown.includes(localHomePrefix), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("public pilot CLI captures normalized payloads for offline replay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-public-pilot-replay-"));
  const capturePath = join(dir, "capture.json");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--fixture",
      fixturePath,
      "--format",
      "json",
      "--capture",
      capturePath
    ], { cwd: repoRoot });
    const proof = JSON.parse(stdout);
    const capture = JSON.parse(await readFile(capturePath, "utf8"));

    assert.equal(capture.artifact, "public-repo-pilot-replay-capture");
    assert.equal(capture.repository, "VrtxOmega/premature-contribution-firewall-demo");
    assert.equal(capture.items.length, 3);
    assert.equal(capture.collectionErrors.length, 0);
    assert.equal(capture.dryRun, true);

    const { stdout: replayStdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--fixture",
      capturePath,
      "--format",
      "json"
    ], { cwd: repoRoot });
    const replay = JSON.parse(replayStdout);

    assert.deepEqual(replay.breakdown, proof.breakdown);
    assert.deepEqual(
      replay.queue.items.map((item) => [item.id, item.action, item.status, item.contextFindings]),
      proof.queue.items.map((item) => [item.id, item.action, item.status, item.contextFindings])
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
