import test from "node:test";
import assert from "node:assert/strict";
import { createApiSpec, createSetupStatus, evaluateBatch, evaluateMaintainerQueue } from "../src/core/api.mjs";

test("API spec exposes callable maintainer endpoints", () => {
  const spec = createApiSpec({ dryRun: true, postComments: false, applyLabels: false });
  assert.equal(spec.ok, true);
  assert.equal(spec.dryRun, true);
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/evaluate-batch"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/benchmark"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/github/queue"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/github/setup"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/github/test-connection"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/queue/history"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/summary"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/calibration"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/export"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/candidates"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/candidates/apply"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/candidates/replay"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/candidates/export"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/feedback/candidates/compare"));
  assert.ok(spec.endpoints.some((endpoint) => endpoint.path === "/api/repositories/:owner/:repo/queue"));
  assert.ok(spec.schemas.feedback.verdicts.includes("too-harsh"));
  assert.match(spec.schemas.feedback.originalPayload, /runnable fixture/);
  assert.match(spec.schemas.feedbackExport.runnableFixture, /benchmark-compatible/);
  assert.match(spec.schemas.feedbackCalibration.behavior, /does not hide the base heuristic/);
  assert.match(spec.schemas.githubSetup.pilot, /ten-minute/);
  assert.match(spec.schemas.feedbackCandidates.source, /separate from the permanent benchmark/);
  assert.match(spec.schemas.feedbackCandidates.evidenceExport, /README/);
  assert.match(spec.schemas.feedbackCandidates.replayCompare, /no server-side baseline/);
  assert.equal(spec.limits.batchItems, 100);
  assert.equal(spec.limits.queueItems, 100);
});

test("setup API helper returns sanitized write posture", () => {
  const setup = createSetupStatus({
    dryRun: true,
    webhookSecret: "super-secret",
    githubAppId: "",
    githubPrivateKeyPath: "",
    queueHistoryEnabled: true
  });

  assert.equal(setup.ok, true);
  assert.equal(setup.mode, "dry-run");
  assert.equal(setup.safety.verdict, "safe-dry-run-or-read-only");
  assert.equal(JSON.stringify(setup).includes("super-secret"), false);
  assert.ok(setup.pilot.steps.some((step) => step.command.includes("/api/feedback/calibration")));
});

test("batch API evaluates mixed PR and patch inputs", () => {
  const result = evaluateBatch({
    items: [
      {
        id: "ready-pr",
        input: {
          kind: "pull_request",
          title: "webhook: reject oversized payload bodies",
          body: "Fixes #42.\n\nProblem: oversized webhook bodies could keep the server busy.\n\nVerification: npm test passed locally.\n\nRisk: low.",
          changedFiles: 1,
          additions: 20,
          deletions: 2,
          files: [{ filename: "src/server.mjs", additions: 20, deletions: 2 }],
          checks: [{ name: "test", conclusion: "success" }]
        }
      },
      {
        id: "patch",
        text: "From 1111111111111111111111111111111111111111 Mon Sep 17 00:00:00 2001\nFrom: Jane Maintainer <jane@example.org>\nSubject: [PATCH 1/1] sched: guard rq clock update against null rq\n\nProblem: rq clock update can be reached after teardown.\nReachability: reproduce by offlining a CPU.\nEffect: null pointer panic.\nCorrectness: return early when rq is NULL.\nFixes: 123456789abc (\"sched: add delayed rq clock update\")\nCc: linux-kernel@vger.kernel.org\nSigned-off-by: Jane Maintainer <jane@example.org>\n\nVerification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64.\n\ndiff --git a/kernel/sched/core.c b/kernel/sched/core.c\nindex 1111111..2222222 100644\n--- a/kernel/sched/core.c\n+++ b/kernel/sched/core.c\n@@ -1,2 +1,4 @@\n+if (!rq)\n+\treturn;\n rq->clock = sched_clock_cpu(cpu_of(rq));\n"
      }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.requested, 2);
  assert.equal(result.results[0].id, "ready-pr");
  assert.equal(result.results[1].profile, "kernel-grade");
});

test("batch API enforces item limit", () => {
  const result = evaluateBatch({ items: new Array(101).fill({ input: { kind: "issue", title: "bug", body: "" } }) });
  assert.equal(result.ok, false);
  assert.match(result.error, /batch limit exceeded/);
});

test("batch API rejects malformed items containers", () => {
  const result = evaluateBatch({ items: { id: "not-an-array" } });
  assert.equal(result.ok, false);
  assert.match(result.error, /items must be an array/);
  assert.deepEqual(result.results, []);
});

test("queue API helper evaluates supplied dry-run items", () => {
  const result = evaluateMaintainerQueue({
    repository: "owner/repo",
    items: [
      {
        id: "ready-pr",
        kind: "pull_request",
        title: "webhook: reject oversized payload bodies",
        body: "Fixes #42.\n\nProblem: oversized webhook bodies could keep the server busy.\n\nVerification: npm test passed locally. Expected oversized payloads to fail; actual before kept reading.\n\nRisk: low.",
        changedFiles: 1,
        additions: 20,
        deletions: 2,
        files: [{ filename: "src/server.mjs", additions: 20, deletions: 2 }],
        checks: [{ name: "test", conclusion: "success" }]
      }
    ]
  }, { now: "2026-05-30T00:00:00Z" });

  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 1);
  assert.equal(result.items[0].status, "ready-for-maintainer");
  assert.match(result.markdown, /ready-pr|webhook: reject oversized payload bodies/);
});
