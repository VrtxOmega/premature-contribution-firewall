import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedbackCalibration } from "../src/core/calibration.mjs";
import { evaluateContribution } from "../src/core/evaluator.mjs";

test("feedback calibration summarizes maintainer corrections and candidate fixtures", () => {
  const calibration = buildFeedbackCalibration({
    repository: "owner/repo",
    feedbackEntries: [
      {
        id: "feedback-1",
        repository: "owner/repo",
        item: { kind: "pull_request", title: "webhook: include labels", status: "needs-repair" },
        pcf: { status: "needs-repair" },
        maintainer: { verdict: "too-harsh", expectedStatus: "ready-for-maintainer" }
      },
      {
        id: "feedback-other",
        repository: "other/repo",
        item: { kind: "issue", title: "unrelated", status: "low-review-value" },
        pcf: { status: "low-review-value" },
        maintainer: { verdict: "too-lenient", expectedStatus: "low-review-value" }
      }
    ],
    candidates: [candidateFixture()]
  });

  assert.equal(calibration.active, true);
  assert.equal(calibration.summary.feedbackEntries, 1);
  assert.equal(calibration.summary.corrections, 1);
  assert.equal(calibration.summary.candidateFixtures, 1);
  assert.equal(calibration.summary.replayPassing, 1);
  assert.deepEqual(calibration.summary.statusCorrections, {
    "needs-repair->ready-for-maintainer": 1
  });
});

test("feedback calibration attaches matched maintainer evidence without hiding base status", () => {
  const calibration = buildFeedbackCalibration({
    repository: "owner/repo",
    candidates: [candidateFixture()]
  });
  const result = evaluateContribution(needsRepairPullRequest(), { feedbackCalibration: calibration });

  assert.equal(result.status, "needs-repair");
  assert.equal(result.calibration.status, "review-needed");
  assert.equal(result.calibration.matches.length, 1);
  assert.equal(result.calibration.matches[0].expectedStatus, "ready-for-maintainer");
  assert.ok(result.labels.includes("feedback-calibration-needed"));
  assert.ok(result.repairSteps[0].includes("Review local feedback calibration"));
  assert.match(result.comment, /Feedback Calibration/);
  assert.match(result.comment, /expects ready-for-maintainer/);
});

test("empty calibration leaves existing evaluation output unchanged", () => {
  const result = evaluateContribution(needsRepairPullRequest(), {
    feedbackCalibration: buildFeedbackCalibration()
  });

  assert.equal(result.calibration, undefined);
  assert.equal(result.labels.includes("feedback-calibration-needed"), false);
});

function candidateFixture() {
  return {
    id: "feedback-webhook-ready",
    repository: "owner/repo",
    kind: "pull_request",
    title: "webhook: include labels in dry-run response",
    expectedStatus: "ready-for-maintainer",
    maintainerVerdict: "too-harsh",
    regressionReason: "Maintainer accepted the dry-run label change after checking local evidence.",
    fixture: {
      input: {
        kind: "pull_request",
        repository: "owner/repo",
        profile: "standard",
        title: "webhook: include labels in dry-run response",
        files: [{ filename: "src/github/templates.mjs" }]
      },
      expect: { status: "ready-for-maintainer" }
    },
    replay: {
      passed: true,
      actualStatus: "ready-for-maintainer",
      actualScore: 100,
      profile: "standard",
      labels: ["ready-for-maintainer"]
    }
  };
}

function needsRepairPullRequest() {
  return {
    kind: "pull_request",
    repository: "owner/repo",
    profile: "standard",
    title: "webhook: include labels in dry-run response",
    body: [
      "Fixes #42.",
      "",
      "Problem: dry-run webhook responses do not show labels, so maintainers cannot compare proposed routing with repository policy.",
      "Change: include the labels in the dry-run response payload while keeping writes disabled.",
      "Risk: low because this only changes a local read-only response shape.",
      "Expected before: maintainers saw only status. Actual after: maintainers can inspect labels before enabling writes."
    ].join("\n"),
    changedFiles: 1,
    additions: 16,
    deletions: 3,
    files: [{ filename: "src/github/templates.mjs", additions: 16, deletions: 3 }],
    checks: []
  };
}
