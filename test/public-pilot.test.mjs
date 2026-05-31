import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildPublicPilotReport,
  runPublicPilotCli
} from "../scripts/run-public-pilot.mjs";
import {
  buildMaintainerExportBundle,
  buildPublicPilotProof,
  renderMaintainerExportMarkdown,
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
  assert.equal(proof.breakdown.repairSubActionCounts["check-duplicate-or-fixed-first"], 1);
  assert.equal(proof.breakdown.repairSubActionCounts["ask-reporter-for-evidence"], 1);
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
  assert.match(markdown, /Repair Sub-Action/);
  assert.match(markdown, /check-duplicate-or-fixed-first/);
  assert.match(summary, /Send repair request: 1/);
  assert.match(summary, /Repair sub-actions: ask-reporter-for-evidence 1, check-duplicate-or-fixed-first 1/);
  assert.match(summary, /Context checked: 3/);
  assert.equal(markdown.includes(localHomePrefix), false);
  assert.equal(markdown.includes("GITHUB_TOKEN="), false);
});

test("maintainer export bundle packages queue markdown, response drafts, hashes, and before-after proof", async () => {
  const proof = await buildPublicPilotReport({
    fixturePath,
    generatedAt: "2026-05-30T10:00:00Z"
  });
  const replayPayload = JSON.parse(await readFile(fixturePath, "utf8"));
  const baselineProof = {
    ...proof,
    generatedAt: "2026-05-30T09:00:00Z",
    breakdown: {
      ...proof.breakdown,
      reviewNow: 0,
      sendRepairRequest: 2,
      nextActionCounts: {
        ...proof.breakdown.nextActionCounts,
        "review-now": 0,
        "ask-reporter-for-evidence": 2
      }
    }
  };
  const bundle = buildMaintainerExportBundle({
    proof,
    baselineProof,
    replayPayload,
    replayPayloadLabel: "fixtures/queue-sample.json",
    commands: {
      rerun: "npm run pilot:public -- --fixture fixtures/queue-sample.json --format json",
      replay: "npm run pilot:public:markdown -- --fixture fixtures/queue-sample.json --bundle /tmp/pcf-bundle.md"
    },
    generatedAt: "2026-05-30T10:01:00Z"
  });
  const markdown = renderMaintainerExportMarkdown(bundle);

  assert.equal(bundle.artifact, "maintainer-export-bundle");
  assert.equal(bundle.dryRun, true);
  assert.equal(bundle.responseDrafts.length, 3);
  assert.equal(bundle.beforeAfter.supplied, true);
  assert.equal(bundle.beforeAfter.metrics.reviewNow.delta, 1);
  assert.equal(bundle.beforeAfter.metrics.sendRepairRequest.delta, -1);
  assert.match(bundle.hashes.proofSha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.hashes.queueMarkdownSha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.hashes.responseDraftsSha256, /^[a-f0-9]{64}$/);
  assert.match(bundle.hashes.replayPayloadSha256, /^[a-f0-9]{64}$/);
  assert.match(markdown, /Maintainer Export Bundle/);
  assert.match(markdown, /Before \/ After Proof/);
  assert.match(markdown, /Response Drafts/);
  assert.match(markdown, /Queue Markdown/);
  assert.match(markdown, /should post: `false`/);
  assert.match(markdown, /No comments, labels, closures, merges, or other GitHub writes were made automatically/);
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

test("public pilot contributor preflight is explicit and unchecked for fixture-only runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-public-pilot-preflight-"));
  const preflightFixture = join(dir, "queue.json");
  try {
    await writeFile(preflightFixture, JSON.stringify({
      repository: "owner/repo",
      items: [
        {
          id: "issue-ready",
          kind: "issue",
          number: 101,
          title: "Webhook returns 401 when signature header hex is uppercase",
          body: [
            "## Version",
            "commit 7ab12cd on main",
            "",
            "## Steps to reproduce",
            "1. Start the server with PCF_WEBHOOK_SECRET set.",
            "2. Send a payload signed with uppercase SHA-256 hex.",
            "3. Observe the webhook response.",
            "",
            "## Expected",
            "The signature verifies.",
            "",
            "## Actual",
            "The server returns 401.",
            "",
            "## Logs",
            "```text",
            "invalid webhook signature",
            "```",
            "",
            "## Duplicate search",
            "I searched existing issues for uppercase signature and webhook digest.",
            "",
            "## Technical analysis",
            "The likely root cause is strict digest normalization before timing-safe comparison."
          ].join("\n"),
          labels: ["bug"],
          repositoryContext: {
            source: "github-api",
            repository: "owner/repo",
            issues: [],
            pullRequests: [],
            upstream: {
              repository: "",
              issues: [],
              pullRequests: [],
              commits: [],
              releases: []
            }
          }
        }
      ]
    }), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--fixture",
      preflightFixture,
      "--format",
      "json",
      "--contributor-preflight"
    ], { cwd: repoRoot });
    const proof = JSON.parse(stdout);

    assert.equal(proof.contributorPreflight.enabled, true);
    assert.equal(proof.contributorPreflight.summary.total, 1);
    assert.equal(proof.contributorPreflight.summary.unchecked, 1);
    assert.equal(proof.contributorPreflight.candidates[0].status, "unchecked");
    assert.match(proof.nonClaims.join("\n"), /does not replace contribution policy checks/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

test("public pilot CLI writes maintainer export bundle artifact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-maintainer-export-"));
  const outputPath = join(dir, "pilot.md");
  const bundlePath = join(dir, "bundle.md");
  try {
    await runPublicPilotCli([
      "--fixture",
      fixturePath,
      "--format",
      "markdown",
      "--write",
      outputPath,
      "--bundle",
      bundlePath
    ]);

    const bundle = await readFile(bundlePath, "utf8");
    assert.match(bundle, /Premature Contribution Firewall Maintainer Export Bundle/);
    assert.match(bundle, /Artifact Hashes/);
    assert.match(bundle, /Replay payload \(fixtures\/queue-sample\.json\)/);
    assert.match(bundle, /Response Drafts/);
    assert.match(bundle, /Queue Markdown/);
    assert.match(bundle, /npm run pilot:public -- --fixture fixtures\/queue-sample\.json --format json/);
    assert.equal(bundle.includes(localHomePrefix), false);
    assert.equal(bundle.includes("GITHUB_TOKEN="), false);
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
      replay.queue.items.map((item) => [item.id, item.action, item.nextAction.id, item.status, item.contextFindings]),
      proof.queue.items.map((item) => [item.id, item.action, item.nextAction.id, item.status, item.contextFindings])
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
