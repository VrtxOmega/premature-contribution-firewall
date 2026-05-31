import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicPilotReport } from "../scripts/run-public-pilot.mjs";
import {
  renderLargeBenchMarkdown,
  renderLargeBenchSummary,
  summarizeLargeBenchReports
} from "../scripts/run-large-bench.mjs";

const fixturePath = new URL("../fixtures/queue-sample.json", import.meta.url);

test("large bench summary aggregates nextAction and context counts", async () => {
  const proof = await buildPublicPilotReport({
    fixturePath,
    generatedAt: "2026-05-31T12:00:00Z"
  });
  const result = summarizeLargeBenchReports([
    {
      repository: "owner/repo",
      proof,
      captureHash: "a".repeat(64),
      replayProofHash: "b".repeat(64),
      capturePath: "/tmp/pcf-large/owner__repo.capture.json",
      replayMarkdownPath: "/tmp/pcf-large/replay-markdown/owner__repo.replay.md"
    }
  ], {
    generatedAt: "2026-05-31T12:00:00Z",
    captureDir: "/tmp/pcf-large",
    artifactDir: "/tmp/pcf-large/replay-markdown"
  });

  assert.equal(result.ok, true);
  assert.equal(result.targets, 1);
  assert.equal(result.aggregate.total, 3);
  assert.equal(result.aggregate.actionCounts["review-now"], 1);
  assert.equal(result.aggregate.actionCounts["send-repair-request"], 1);
  assert.equal(result.aggregate.actionCounts["do-not-review-yet"], 1);
  assert.equal(result.aggregate.nextActionCounts["review-now"], 1);
  assert.equal(result.aggregate.nextActionCounts["check-duplicate-or-fixed-first"], 1);
  assert.equal(result.aggregate.nextActionCounts["ask-reporter-for-evidence"], 1);
  assert.equal(result.aggregate.repairSubActionCounts["check-duplicate-or-fixed-first"], 1);
  assert.equal(result.aggregate.repairSubActionCounts["ask-reporter-for-evidence"], 1);
  assert.equal(result.aggregate.context.itemsChecked, 3);
  assert.equal(result.aggregate.context.findings, 3);
  assert.equal(result.repositories[0].captureHash, "a".repeat(64));
});

test("large bench markdown publishes aggregate proof without raw capture payloads", async () => {
  const proof = await buildPublicPilotReport({
    fixturePath,
    generatedAt: "2026-05-31T12:00:00Z"
  });
  const result = summarizeLargeBenchReports([
    {
      repository: "owner/repo",
      proof,
      captureHash: "c".repeat(64),
      replayProofHash: "d".repeat(64)
    }
  ], {
    generatedAt: "2026-05-31T12:00:00Z",
    captureDir: "/tmp/pcf-large"
  });
  const markdown = renderLargeBenchMarkdown(result);
  const summary = renderLargeBenchSummary(result);

  assert.match(markdown, /Next Action Distribution/);
  assert.match(markdown, /Non-Ready Sub-Actions/);
  assert.match(markdown, /Context checked: 3\/3/);
  assert.match(markdown, /Capture SHA-256/);
  assert.match(markdown, /Raw replay captures contain third-party/);
  assert.match(summary, /Next actions: review-now 1, ask-reporter-for-evidence 1, check-duplicate-or-fixed-first 1/);
  assert.equal(markdown.includes("Problem: webhook labels"), false);
  assert.equal(markdown.includes("/home/"), false);
});
