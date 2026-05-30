import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyFeedbackFixtureCandidates,
  buildCandidateEvidenceArtifact,
  buildCandidateReplayComparison,
  readCandidateCorpus,
  replayCandidateCorpus
} from "../src/core/candidates.mjs";
import { buildFeedbackEntry, buildRegressionExport } from "../src/core/feedback.mjs";

test("candidate corpus applies selected runnable feedback drafts and skips manual cases", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-candidates-"));
  const filePath = join(dir, "feedback-candidates.json");
  try {
    const entries = [
      buildFeedbackEntry({
        repository: "owner/repo",
        item: queueItem({ number: 31, status: "needs-repair" }),
        originalPayload: readyOriginalPayload({ number: 31 }),
        verdict: "too-harsh",
        expectedStatus: "ready-for-maintainer"
      }, { now: "2026-05-30T06:00:00Z" }),
      buildFeedbackEntry({
        repository: "owner/repo",
        item: queueItem({ number: 32, status: "low-review-value" }),
        verdict: "false-positive",
        expectedStatus: "ready-for-maintainer"
      }, { now: "2026-05-30T06:01:00Z" })
    ];
    const exported = buildRegressionExport(entries);

    const result = await applyFeedbackFixtureCandidates({
      filePath,
      feedbackEntries: entries,
      caseIds: [exported.cases[0].id, exported.cases[1].id, "missing-case"],
      now: "2026-05-30T06:02:00Z"
    });

    assert.equal(result.ok, true);
    assert.equal(result.applied.length, 1);
    assert.equal(result.skipped.length, 2);
    assert.equal(result.corpus.summary.total, 1);
    assert.deepEqual(result.corpus.summary.expectedStatuses, { "ready-for-maintainer": 1 });
    assert.equal(result.replay.summary.passed, 1);
    assert.equal(result.corpus.candidates[0].sourceCaseId, exported.cases[0].id);

    const duplicate = await applyFeedbackFixtureCandidates({
      filePath,
      feedbackEntries: entries,
      caseIds: [exported.cases[0].id],
      now: "2026-05-30T06:03:00Z"
    });

    assert.equal(duplicate.applied.length, 0);
    assert.equal(duplicate.skipped[0].reason, "already applied");
    assert.equal((await readCandidateCorpus(filePath)).summary.total, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("candidate corpus keeps newest applied entries when retention limit is reached", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-candidates-"));
  const filePath = join(dir, "feedback-candidates.json");
  try {
    const entries = [3, 2, 1].map((number) => buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number, status: "needs-repair" }),
      originalPayload: readyOriginalPayload({ number }),
      verdict: "too-harsh",
      expectedStatus: "ready-for-maintainer"
    }, { now: `2026-05-30T06:0${number}:00Z` }));

    const result = await applyFeedbackFixtureCandidates({
      filePath,
      feedbackEntries: entries,
      applyAllRunnable: true,
      maxEntries: 2,
      now: "2026-05-30T06:10:00Z"
    });

    assert.equal(result.corpus.candidates.length, 2);
    assert.equal(result.corpus.candidates[0].number, 3);
    assert.equal(result.corpus.candidates[1].number, 2);
    assert.equal((await readCandidateCorpus(filePath)).summary.total, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("candidate corpus replay reports failing feedback fixtures without hiding residue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-candidates-"));
  const filePath = join(dir, "feedback-candidates.json");
  try {
    const entry = buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number: 41, status: "ready-for-maintainer" }),
      originalPayload: readyOriginalPayload({ number: 41 }),
      verdict: "too-lenient",
      expectedStatus: "low-review-value"
    }, { now: "2026-05-30T06:11:00Z" });
    await applyFeedbackFixtureCandidates({
      filePath,
      feedbackEntries: [entry],
      applyAllRunnable: true,
      now: "2026-05-30T06:12:00Z"
    });

    const corpus = await readCandidateCorpus(filePath);
    const replay = replayCandidateCorpus(corpus.candidates);

    assert.equal(replay.ok, false);
    assert.equal(replay.summary.failed, 1);
    assert.match(replay.results[0].failures.join("\n"), /status expected low-review-value/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("candidate evidence artifact is shareable and keeps newest-first order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-candidates-"));
  const filePath = join(dir, "feedback-candidates.json");
  try {
    const entries = [52, 51].map((number) => buildFeedbackEntry({
      repository: "owner/repo",
      item: queueItem({ number, status: "needs-repair" }),
      originalPayload: readyOriginalPayload({ number }),
      verdict: "too-harsh",
      expectedStatus: "ready-for-maintainer"
    }, { now: `2026-05-30T07:${number - 50}0:00Z` }));
    await applyFeedbackFixtureCandidates({
      filePath,
      feedbackEntries: entries,
      applyAllRunnable: true,
      now: "2026-05-30T07:30:00Z"
    });

    const corpus = await readCandidateCorpus(filePath);
    const artifact = buildCandidateEvidenceArtifact(corpus.candidates, {
      generatedAt: "2026-05-30T07:31:00Z"
    });
    const serialized = JSON.stringify(artifact);

    assert.equal(artifact.ok, true);
    assert.equal(artifact.summary.total, 2);
    assert.equal(artifact.summary.replayPassed, 2);
    assert.equal(artifact.fixtureBundle.fixtures.length, 2);
    assert.equal(artifact.fixtureBundle.fixtures[0].number, 52);
    assert.equal(artifact.fixtureBundle.fixtures[1].number, 51);
    assert.match(artifact.markdown, /Candidate Evidence/);
    assert.match(artifact.markdown, /52/);
    assert.equal(serialized.includes(filePath), false);
    assert.equal(serialized.includes("/home/"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("candidate replay comparison classifies policy-change impact", () => {
  const baselineReplay = replay({
    results: [
      replayResult({ candidateId: "a", passed: false, actualStatus: "needs-repair", actualScore: 72, failures: ["missing label ready-for-maintainer"] }),
      replayResult({ candidateId: "b", passed: true, actualStatus: "ready-for-maintainer", actualScore: 100 }),
      replayResult({ candidateId: "c", passed: true, actualStatus: "ready-for-maintainer", actualScore: 95 }),
      replayResult({ candidateId: "gone", passed: true, actualStatus: "ready-for-maintainer", actualScore: 90 })
    ]
  });
  const currentReplay = replay({
    results: [
      replayResult({ candidateId: "a", passed: true, actualStatus: "ready-for-maintainer", actualScore: 100 }),
      replayResult({ candidateId: "b", passed: false, actualStatus: "needs-repair", actualScore: 70, failures: ["status expected ready-for-maintainer"] }),
      replayResult({ candidateId: "c", passed: true, actualStatus: "ready-for-maintainer", actualScore: 96 }),
      replayResult({ candidateId: "new", passed: true, actualStatus: "ready-for-maintainer", actualScore: 88 })
    ]
  });

  const comparison = buildCandidateReplayComparison({
    baselineReplay,
    currentReplay,
    generatedAt: "2026-05-30T08:00:00Z"
  });
  const transitions = Object.fromEntries(comparison.changes.map((item) => [item.candidateId, item.transition]));

  assert.equal(comparison.ok, true);
  assert.equal(comparison.summary.improved, 1);
  assert.equal(comparison.summary.regressed, 1);
  assert.equal(comparison.summary.changed, 1);
  assert.equal(comparison.summary.newItems, 1);
  assert.equal(comparison.summary.goneItems, 1);
  assert.equal(comparison.summary.risk, "needs-review");
  assert.equal(transitions.a, "improved");
  assert.equal(transitions.b, "regressed");
  assert.equal(transitions.c, "changed");
  assert.equal(transitions.new, "new");
  assert.equal(transitions.gone, "gone");
  assert.match(comparison.markdown, /Candidate Replay Compare/);
  assert.match(comparison.markdown, /PASS-TO-FAIL|REGRESSED/);
});

test("candidate replay comparison requires a baseline", () => {
  const comparison = buildCandidateReplayComparison({
    currentReplay: replay({ results: [replayResult({ candidateId: "a" })] })
  });

  assert.equal(comparison.ok, false);
  assert.match(comparison.error, /baselineReplay/);
  assert.equal(comparison.summary.risk, "needs-baseline");
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
    updatedAt: "2026-05-30T06:00:00Z"
  };
}

function replay({ results }) {
  const passed = results.filter((item) => item.passed).length;
  return {
    ok: results.every((item) => item.passed),
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length ? passed / results.length : 0,
      repositories: ["owner/repo"]
    },
    results
  };
}

function replayResult(overrides = {}) {
  return {
    candidateId: overrides.candidateId || "candidate",
    sourceCaseId: overrides.sourceCaseId || "feedback-case",
    repository: overrides.repository || "owner/repo",
    itemKey: overrides.itemKey || `owner/repo:pull_request:${overrides.candidateId || "candidate"}`,
    title: overrides.title || `Candidate ${overrides.candidateId || "candidate"}`,
    expectedStatus: overrides.expectedStatus || "ready-for-maintainer",
    passed: overrides.passed ?? true,
    failures: overrides.failures || [],
    actualStatus: overrides.actualStatus || "ready-for-maintainer",
    actualScore: overrides.actualScore ?? 100,
    profile: overrides.profile || "standard",
    labels: overrides.labels || ["ready-for-maintainer"]
  };
}

function readyOriginalPayload(overrides = {}) {
  const number = overrides.number || 31;
  return {
    kind: "pull_request",
    number,
    title: `webhook: reject oversized payload bodies ${number}`,
    body: [
      "Fixes #42.",
      "",
      "Problem: oversized webhook bodies could keep the local review server busy before signature handling completed.",
      "Change: reject payloads above the documented limit and return a clear error to the caller.",
      "Risk: low, because the limit already exists and this change only makes the failure path explicit.",
      "Verification: npm test passed locally and covered the oversized-payload path."
    ].join("\n"),
    changedFiles: 2,
    additions: 48,
    deletions: 12,
    files: [
      { filename: "src/server.mjs", additions: 30, deletions: 8 },
      { filename: "test/webhook.test.mjs", additions: 18, deletions: 4 }
    ],
    checks: [{ name: "test", conclusion: "success" }]
  };
}
