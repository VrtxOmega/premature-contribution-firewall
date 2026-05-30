import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMaintainerQueue,
  evaluateQueueItem,
  formatMaintainerQueueMarkdown
} from "../src/core/queue.mjs";

test("maintainer queue summarizes ready, repair, and low-value work", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const queue = buildMaintainerQueue(fixture, { now: "2026-05-30T00:00:00Z" });

  assert.equal(queue.ok, true);
  assert.equal(queue.dryRun, true);
  assert.equal(queue.repository, "VrtxOmega/premature-contribution-firewall-demo");
  assert.equal(queue.summary.total, 3);
  assert.equal(queue.summary.statuses["ready-for-maintainer"], 1);
  assert.equal(queue.summary.statuses["needs-repair"], 1);
  assert.equal(queue.summary.statuses["low-review-value"], 1);
  assert.equal(queue.summary.contextFindings, 3);
  assert.equal(queue.items[0].status, "ready-for-maintainer");
  assert.equal(queue.items[1].action, "send-repair-request");
  assert.ok(queue.items[1].labels.includes("possibly-duplicate"));
  assert.ok(queue.markdown.includes("Maintainer Queue"));
});

test("queue items preserve maintainer reasons and evaluation details", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const item = evaluateQueueItem(fixture.items[2]);

  assert.equal(item.kind, "issue");
  assert.equal(item.status, "low-review-value");
  assert.equal(item.action, "do-not-review-yet");
  assert.ok(item.topReasons.some((reason) => reason.id === "reproducer"));
  assert.equal(item.evaluation.kind, "issue");
  assert.equal(item.fixtureInput.kind, "issue");
  assert.equal(item.fixtureInput.title, "Bug");
  assert.equal(item.fixtureInput.body.includes("vulnerability"), true);
});

test("queue markdown is README-ready", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const queue = buildMaintainerQueue(fixture, { now: "2026-05-30T00:00:00Z" });
  const markdown = formatMaintainerQueueMarkdown(queue);

  assert.match(markdown, /Ready: 1/);
  assert.match(markdown, /Needs repair: 1/);
  assert.match(markdown, /Low review value: 1/);
  assert.match(markdown, /webhook: include labels in dry-run response/);
});
