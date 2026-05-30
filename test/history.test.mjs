import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendQueueHistory,
  buildQueueHistoryEntry,
  compareQueueRuns,
  readQueueHistory
} from "../src/core/history.mjs";

test("queue history records runs and summarizes latest queue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-history-"));
  const filePath = join(dir, "queue-history.json");
  try {
    const first = await appendQueueHistory({
      filePath,
      queue: queueRun({
        generatedAt: "2026-05-30T00:00:00Z",
        items: [
          item({ number: 1, status: "needs-repair", score: 82 }),
          item({ number: 2, status: "low-review-value", score: 20 })
        ]
      }),
      request: { repository: "owner/repo", source: "fixture", limit: 25 },
      now: "2026-05-30T00:01:00Z"
    });
    const second = await appendQueueHistory({
      filePath,
      queue: queueRun({
        generatedAt: "2026-05-30T00:02:00Z",
        items: [
          item({ number: 1, status: "ready-for-maintainer", score: 100 }),
          item({ number: 2, status: "low-review-value", score: 20 }),
          item({ number: 3, status: "needs-repair", score: 84 })
        ]
      }),
      request: { repository: "owner/repo", source: "fixture", limit: 25 },
      now: "2026-05-30T00:03:00Z"
    });
    const history = await readQueueHistory(filePath);

    assert.equal(first.summary.totalRuns, 1);
    assert.equal(second.summary.totalRuns, 2);
    assert.equal(history.entries.length, 2);
    assert.equal(history.summary.latestReady, 1);
    assert.equal(history.summary.improved, 1);
    assert.equal(history.summary.newItems, 1);
    assert.equal(history.entries[0].transitions.unchanged, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("queue history compares item status transitions", () => {
  const transitions = compareQueueRuns(
    [
      item({ number: 1, status: "ready-for-maintainer" }),
      item({ number: 2, status: "low-review-value" }),
      item({ number: 3, status: "needs-repair" })
    ],
    [
      item({ number: 1, status: "needs-repair" }),
      item({ number: 2, status: "ready-for-maintainer" })
    ]
  );

  assert.equal(transitions.improved, 1);
  assert.equal(transitions.regressed, 1);
  assert.equal(transitions.newItems, 1);
  assert.equal(transitions.items.length, 3);
});

test("queue history entry keeps compact item records", () => {
  const entry = buildQueueHistoryEntry({
    queue: queueRun({
      items: [item({ number: 7, status: "ready-for-maintainer", labels: ["ready-for-maintainer"] })]
    }),
    request: { repository: "owner/repo", includeIssues: false },
    now: "2026-05-30T00:00:00Z"
  });

  assert.equal(entry.items.length, 1);
  assert.equal(entry.items[0].evaluation, undefined);
  assert.equal(entry.request.includeIssues, false);
  assert.equal(entry.id.length, 16);
});

function queueRun(overrides = {}) {
  const items = overrides.items || [];
  const statuses = {};
  for (const queueItem of items) {
    statuses[queueItem.status] = (statuses[queueItem.status] || 0) + 1;
  }
  return {
    repository: "owner/repo",
    upstreamRepository: "",
    source: "fixture",
    dryRun: true,
    generatedAt: overrides.generatedAt || "2026-05-30T00:00:00Z",
    summary: {
      total: items.length,
      statuses,
      reviewBudgetMinutes: items.reduce((sum, queueItem) => sum + queueItem.reviewBudget.minutes, 0),
      contextFindings: 0
    },
    items
  };
}

function item(overrides = {}) {
  const number = overrides.number || 1;
  return {
    id: `pull_request-${number}`,
    kind: "pull_request",
    number,
    title: `PR ${number}`,
    repository: "owner/repo",
    htmlUrl: `https://github.example/pull/${number}`,
    status: overrides.status || "needs-repair",
    action: "send-repair-request",
    score: overrides.score || 80,
    labels: overrides.labels || [],
    contextFindings: 0,
    reviewBudget: { minutes: 10 },
    failureCount: 0,
    warningCount: 0,
    updatedAt: "2026-05-30T00:00:00Z"
  };
}
