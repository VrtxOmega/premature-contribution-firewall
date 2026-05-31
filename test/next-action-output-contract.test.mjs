import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMaintainerQueue, NEXT_ACTIONS } from "../src/core/queue.mjs";
import { buildPublicPilotReport } from "../scripts/run-public-pilot.mjs";

const fixtureUrl = new URL("../fixtures/queue-sample.json", import.meta.url);

test("queue nextAction contract exposes actor, maintainer move, and evidence", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const queue = buildMaintainerQueue(fixture, { now: "2026-05-31T14:20:00Z" });

  assert.equal(queue.nextActionGroups.length, Object.keys(NEXT_ACTIONS).length);
  assert.ok(queue.nextActionGroups.some((group) => group.id === "review-now" && group.owner === "maintainer" && group.count === 1));
  assert.ok(queue.nextActionGroups.some((group) => group.id === "ask-reporter-for-evidence" && group.owner === "reporter" && group.count === 1));
  assert.ok(queue.nextActionGroups.some((group) => group.id === "check-duplicate-or-fixed-first" && group.maintainerAction.includes("Check related") && group.count === 1));

  for (const item of queue.items) {
    assert.ok(item.nextAction.id);
    assert.ok(item.nextAction.title);
    assert.ok(item.nextAction.owner);
    assert.ok(item.nextAction.target);
    assert.ok(item.nextAction.maintainerAction);
    assert.ok(item.nextAction.reason);
    assert.ok(Array.isArray(item.nextAction.evidence.labels));
    assert.ok(Array.isArray(item.nextAction.evidence.checks));
    assert.ok(Array.isArray(item.nextAction.evidence.reasons));
    assert.ok(item.nextAction.evidence.reasons.length >= 1);
  }

  const duplicate = queue.items.find((item) => item.nextAction.id === "check-duplicate-or-fixed-first");
  assert.ok(duplicate.nextAction.evidence.labels.includes("possibly-duplicate"));
  assert.match(duplicate.nextAction.reason, /Repository context label/);
});

test("replay capture preserves the public nextAction output contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-next-action-contract-"));
  const capturePath = join(dir, "capture.json");
  try {
    await buildPublicPilotReport({
      fixturePath: new URL("../fixtures/queue-sample.json", import.meta.url).pathname,
      capturePath,
      generatedAt: "2026-05-31T14:20:00Z"
    });
    const replay = await buildPublicPilotReport({
      fixturePath: capturePath,
      generatedAt: "2026-05-31T14:20:00Z"
    });

    assert.equal(replay.ok, true);
    assert.equal(replay.queue.summary.nextActions["review-now"], 1);
    assert.equal(replay.queue.summary.nextActions["ask-reporter-for-evidence"], 1);
    assert.equal(replay.queue.summary.nextActions["check-duplicate-or-fixed-first"], 1);
    const replayContract = Object.fromEntries(replay.queue.items.map((item) => [item.id, item]));
    assert.equal(replayContract["pr-ready-small"].nextAction.owner, "maintainer");
    assert.equal(replayContract["pr-ready-small"].nextAction.maintainerAction, "Start normal review now.");
    assert.deepEqual(replayContract["pr-ready-small"].nextAction.evidence.labels, ["ready-for-maintainer"]);

    assert.equal(replayContract["pr-context-duplicate"].nextAction.id, "check-duplicate-or-fixed-first");
    assert.equal(replayContract["pr-context-duplicate"].nextAction.owner, "maintainer");
    assert.equal(replayContract["pr-context-duplicate"].nextAction.maintainerAction, "Check related, solved, concurrent, or upstream-fixed work before fresh review.");
    assert.ok(replayContract["pr-context-duplicate"].nextAction.evidence.labels.includes("possibly-duplicate"));
    assert.ok(replayContract["pr-context-duplicate"].nextAction.evidence.labels.includes("possibly-upstream-fixed"));

    assert.equal(replayContract["issue-low-evidence"].nextAction.id, "ask-reporter-for-evidence");
    assert.equal(replayContract["issue-low-evidence"].nextAction.owner, "reporter");
    assert.equal(replayContract["issue-low-evidence"].nextAction.maintainerAction, "Send a focused repair request to the submitter.");
    assert.ok(replayContract["issue-low-evidence"].nextAction.evidence.labels.includes("needs-clear-summary"));
    assert.ok(replayContract["issue-low-evidence"].nextAction.evidence.labels.includes("needs-reproducer"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("browser queue surface exposes why-label explanations", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(app, /queue-explainer/);
  assert.match(app, /Why PCF routed this here/);
  assert.match(app, /function renderQueueExplainer/);
  assert.match(app, /Next actor:/);
  assert.match(app, /Route reason:/);
  assert.match(app, /Labels driving route:/);
  assert.match(app, /Repository context:/);
  assert.match(styles, /\.queue-explainer/);
  assert.match(styles, /\.queue-explainer-list/);
});
