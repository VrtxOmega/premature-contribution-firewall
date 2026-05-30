import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendFeedback,
  buildFeedbackEntry,
  buildRegressionExport,
  readFeedbackLedger,
  summarizeFeedback
} from "../src/core/feedback.mjs";

test("feedback ledger records maintainer corrections as case files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-feedback-"));
  const filePath = join(dir, "feedback.json");
  try {
    const first = await appendFeedback({
      filePath,
      feedback: {
        repository: "owner/repo",
        item: queueItem({ number: 12, status: "needs-repair" }),
        verdict: "too-harsh",
        expectedStatus: "ready-for-maintainer",
        note: "Maintainer had enough evidence to review this now."
      },
      now: "2026-05-30T04:00:00Z"
    });
    const second = await appendFeedback({
      filePath,
      feedback: {
        repository: "owner/repo",
        item: queueItem({ number: 13, status: "ready-for-maintainer" }),
        verdict: "correct",
        expectedStatus: "ready-for-maintainer",
        shouldBecomeFixture: false
      },
      now: "2026-05-30T04:01:00Z"
    });
    const ledger = await readFeedbackLedger(filePath);

    assert.equal(first.entry.caseFile.regressionCandidate, true);
    assert.equal(first.ledger.summary.corrections, 1);
    assert.equal(second.ledger.summary.total, 2);
    assert.equal(ledger.entries.length, 2);
    assert.equal(ledger.summary.agreementRate, 0.5);
    assert.equal(ledger.summary.falsePositivePressure, 1);
    assert.equal(ledger.entries[1].caseFile.recommendedNextAction.includes("over-blocked"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("feedback ledger filters repository and keeps newest entries within limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-feedback-"));
  const filePath = join(dir, "feedback.json");
  try {
    await appendFeedback({
      filePath,
      feedback: { repository: "owner/repo", item: queueItem({ number: 1 }), verdict: "too-lenient", expectedStatus: "needs-repair" },
      maxEntries: 2,
      now: "2026-05-30T04:00:00Z"
    });
    await appendFeedback({
      filePath,
      feedback: { repository: "owner/other", item: queueItem({ number: 2, repository: "owner/other" }), verdict: "correct" },
      maxEntries: 2,
      now: "2026-05-30T04:01:00Z"
    });
    await appendFeedback({
      filePath,
      feedback: { repository: "owner/repo", item: queueItem({ number: 3 }), verdict: "missed-duplicate", expectedStatus: "needs-repair" },
      maxEntries: 2,
      now: "2026-05-30T04:02:00Z"
    });

    const all = await readFeedbackLedger(filePath);
    const filtered = await readFeedbackLedger(filePath, { repository: "owner/repo" });

    assert.equal(all.entries.length, 2);
    assert.equal(all.entries[0].item.number, 3);
    assert.equal(filtered.entries.length, 1);
    assert.equal(filtered.summary.contextMisses, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("feedback export is honest about manual regression fixture work", () => {
  const entries = [
    buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number: 9, status: "low-review-value" }),
      verdict: "false-positive",
      expectedStatus: "ready-for-maintainer",
      labels: ["overblocked"]
    }, { now: "2026-05-30T04:00:00Z" }),
    buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number: 10, status: "ready-for-maintainer" }),
      verdict: "correct",
      shouldBecomeFixture: false
    }, { now: "2026-05-30T04:01:00Z" })
  ];

  const exported = buildRegressionExport(entries, { generatedAt: "2026-05-30T04:02:00Z" });

  assert.equal(exported.ok, true);
  assert.equal(exported.summary.exportedCases, 1);
  assert.equal(exported.summary.runnableFixtures, 0);
  assert.equal(exported.summary.needsManualFixtureInput, 1);
  assert.equal(exported.cases[0].expectedStatus, "ready-for-maintainer");
  assert.equal(exported.cases[0].needsManualFixtureInput, true);
  assert.equal(exported.cases[0].runnableFixture, false);
});

test("feedback export builds runnable benchmark fixture drafts when original payload exists", () => {
  const entries = [
    buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number: 21, status: "needs-repair" }),
      originalPayload: readyOriginalPayload({ number: 21 }),
      verdict: "too-harsh",
      expectedStatus: "ready-for-maintainer",
      labels: ["ready-for-maintainer"]
    }, { now: "2026-05-30T04:05:00Z" })
  ];

  const exported = buildRegressionExport(entries, { generatedAt: "2026-05-30T04:06:00Z" });
  const fixture = exported.cases[0].fixture;

  assert.equal(exported.summary.exportedCases, 1);
  assert.equal(exported.summary.runnableFixtures, 1);
  assert.equal(exported.summary.needsManualFixtureInput, 0);
  assert.equal(exported.summary.currentlyPassing, 1);
  assert.equal(exported.cases[0].needsManualFixtureInput, false);
  assert.equal(exported.cases[0].runnableFixture, true);
  assert.equal(fixture.category, "maintainer-feedback");
  assert.equal(fixture.input.kind, "pull_request");
  assert.equal(fixture.expect.status, "ready-for-maintainer");
  assert.equal(exported.cases[0].replay.evaluated, true);
  assert.equal(exported.cases[0].replay.passedAgainstExpected, true);
});

test("feedback original payload redacts obvious secret-like strings before export", () => {
  const token = "ghp_" + "abcdefghijklmnopqrstuvwxyz12345";
  const entry = buildFeedbackEntry({
    repository: "owner/repo",
    item: queueItem({ number: 22, status: "low-review-value" }),
    originalPayload: {
      ...readyOriginalPayload({ number: 22 }),
      body: `Verification: npm test passed.\nToken: ${token}`,
      files: [{ filename: "src/server.mjs", additions: 1, deletions: 0, patch: `+const token = '${token}';` }]
    },
    verdict: "false-positive",
    expectedStatus: "ready-for-maintainer"
  }, { now: "2026-05-30T04:07:00Z" });

  const exported = buildRegressionExport([entry]);
  const serialized = JSON.stringify(exported);

  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("[REDACTED_GITHUB_TOKEN]"), true);
  assert.equal(exported.cases[0].runnableFixture, true);
});

test("feedback summary separates overblocking, underblocking, and context misses", () => {
  const summary = summarizeFeedback([
    buildFeedbackEntry({ item: queueItem(), verdict: "too-harsh", expectedStatus: "ready-for-maintainer" }),
    buildFeedbackEntry({ item: queueItem(), verdict: "too-lenient", expectedStatus: "needs-repair" }),
    buildFeedbackEntry({ item: queueItem(), verdict: "missed-upstream-fix", expectedStatus: "needs-repair" }),
    buildFeedbackEntry({ item: queueItem(), verdict: "correct", shouldBecomeFixture: false })
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.corrections, 3);
  assert.equal(summary.falsePositivePressure, 1);
  assert.equal(summary.falseNegativePressure, 1);
  assert.equal(summary.contextMisses, 1);
  assert.equal(summary.regressionCandidates, 3);
});

function queueItem(overrides = {}) {
  const number = overrides.number || 1;
  return {
    id: `pull_request-${number}`,
    kind: "pull_request",
    number,
    title: `PR ${number}`,
    repository: overrides.repository || "owner/repo",
    htmlUrl: `https://github.example/pull/${number}`,
    status: overrides.status || "needs-repair",
    action: overrides.action || "send-repair-request",
    score: overrides.score || 82,
    labels: overrides.labels || ["needs-repair"],
    contextSummary: overrides.contextSummary || "No repository context supplied.",
    contextFindings: overrides.contextFindings || 0,
    reviewBudget: { minutes: overrides.minutes || 12 },
    failureCount: overrides.failureCount || 1,
    warningCount: overrides.warningCount || 0,
    topReasons: [
      {
        id: "tests",
        title: "Tests or test rationale",
        status: "fail",
        label: "needs-tests",
        reason: "No test evidence supplied."
      }
    ],
    updatedAt: "2026-05-30T04:00:00Z"
  };
}

function readyOriginalPayload(overrides = {}) {
  const number = overrides.number || 21;
  return {
    kind: "pull_request",
    number,
    title: "webhook: reject oversized payload bodies",
    body: [
      "Fixes #42.",
      "",
      "Problem: oversized webhook bodies could keep the local review server busy.",
      "Change: reject payloads above the documented limit and return a clear error.",
      "Risk: low because this only makes the failure path explicit.",
      "Verification: npm test passed locally and covered the oversized-payload path."
    ].join("\n"),
    authorAssociation: "CONTRIBUTOR",
    changedFiles: 2,
    additions: 48,
    deletions: 12,
    files: [
      { filename: "src/server.mjs", additions: 30, deletions: 8 },
      { filename: "test/webhook.test.mjs", additions: 18, deletions: 4 }
    ],
    checks: [{ name: "maintainer-check", conclusion: "success" }]
  };
}
