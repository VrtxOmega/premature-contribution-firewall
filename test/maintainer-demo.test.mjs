import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildMaintainerDemoReport,
  renderMaintainerDemoMarkdown,
  renderMaintainerDemoSummary
} from "../scripts/run-maintainer-demo.mjs";
import { ADVERSARIAL_CASES } from "../src/core/adversary.mjs";
import { BENCHMARK_CASES } from "../src/core/benchmark.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("../scripts/run-maintainer-demo.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const localHomePrefix = ["/", "home", "/"].join("");
const expectedBenchmarkCases = BENCHMARK_CASES.length;
const expectedAdversarialCases = ADVERSARIAL_CASES.length;

test("maintainer demo report covers all proof surfaces", async () => {
  const report = await buildMaintainerDemoReport({
    generatedAt: "2026-05-30T09:00:00Z"
  });

  assert.equal(report.ok, true);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.proof.benchmark.passed, expectedBenchmarkCases);
  assert.equal(report.proof.benchmark.failed, 0);
  assert.equal(report.proof.adversarialRedTest.passed, expectedAdversarialCases);
  assert.equal(report.proof.adversarialRedTest.failed, 0);
  assert.equal(report.proof.adversarialRedTest.residue.length, expectedAdversarialCases);
  assert.equal(report.proof.maintainerQueue.total, 3);
  assert.equal(report.proof.maintainerQueue.ready, 1);
  assert.equal(report.proof.maintainerQueue.needsRepair, 1);
  assert.equal(report.proof.maintainerQueue.lowReviewValue, 1);
  assert.equal(report.proof.maintainerQueue.contextFindings, 3);
  assert.equal(report.proof.feedbackCalibration.matches, 2);
  assert.equal(report.proof.feedbackCalibration.reviewNeeded, 0);
  assert.equal(report.proof.feedbackCandidate.total, 1);
  assert.equal(report.proof.feedbackCandidate.runnableFixtures, 1);
  assert.equal(report.proof.feedbackCandidate.replayPassed, 1);
  assert.equal(report.proof.feedbackCandidate.replayFailed, 0);
  assert.equal(report.proof.replayComparison.risk, "stable");
  assert.equal(report.proof.replayComparison.regressed, 0);
  assert.ok(report.nonClaims.some((claim) => claim.includes("not an AI-authorship detector")));
});

test("maintainer demo markdown is shareable and explicit about non-claims", async () => {
  const report = await buildMaintainerDemoReport({
    generatedAt: "2026-05-30T09:00:00Z"
  });
  const markdown = renderMaintainerDemoMarkdown(report);
  const summary = renderMaintainerDemoSummary(report);

  assert.match(markdown, /Claims This Demo Proves/);
  assert.match(markdown, /Non-Claims/);
  assert.match(markdown, /not an AI-authorship detector/);
  assert.match(markdown, /Adversarial Residue/);
  assert.match(markdown, /Feedback calibration matches: 2/);
  assert.match(markdown, /Replay comparison: 1 unchanged/);
  assert.match(summary, /Result: PASS/);
  assert.equal(markdown.includes(localHomePrefix), false);
  assert.equal(markdown.includes("data/feedback-candidates.json"), false);
});

test("maintainer demo CLI emits JSON and honors fail-on-regression", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "--format",
    "json",
    "--fail-on-regression"
  ], { cwd: repoRoot });
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.proof.benchmark.total, expectedBenchmarkCases);
  assert.equal(report.proof.adversarialRedTest.total, expectedAdversarialCases);
  assert.equal(report.proof.feedbackCalibration.matches, 2);
  assert.equal(report.proof.feedbackCandidate.replayFailed, 0);
});

test("maintainer demo CLI writes markdown artifact without local runtime paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-maintainer-demo-"));
  const outputPath = join(dir, "demo.md");
  try {
    await execFileAsync(process.execPath, [
      scriptPath,
      "--format",
      "markdown",
      "--write",
      outputPath,
      "--fail-on-regression"
    ], { cwd: repoRoot });

    const markdown = await readFile(outputPath, "utf8");
    assert.match(markdown, /Premature Contribution Firewall Maintainer Demo/);
    assert.match(markdown, /Verdict: \*\*PASS\*\*/);
    assert.equal(markdown.includes(localHomePrefix), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
