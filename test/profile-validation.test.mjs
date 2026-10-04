import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { availableProfiles, evaluateContribution, evaluateIssue, evaluatePullRequest, normalizeInput } from "../src/core/evaluator.mjs";
import { evaluateSubmission, evaluateBatch } from "../src/core/api.mjs";
import { parsePatchSubmission } from "../src/core/patch.mjs";
import { buildMaintainerQueue, evaluateQueueItem } from "../src/core/queue.mjs";
import { callPcfMcpTool } from "../src/mcp/core.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
const patch = await readFile(new URL("../fixtures/patch-kernel-ready.patch", import.meta.url), "utf8");
const invalidProfiles = ["kernel-grdae", "constructor", "__proto__", "toString", false, 0, {}, [], ["kernel-grade"]];
const invalidProfile = error => error instanceof TypeError && error.code === "PCF_INVALID_PROFILE" && /profile.*standard.*kernel-grade/i.test(error.message);

for (const profile of invalidProfiles) {
  test(`core and submission helpers reject malformed profile ${JSON.stringify(profile)}`, () => {
    for (const run of [
      () => evaluateContribution({ ...fixture, profile }),
      () => evaluateContribution({ ...fixture, reviewProfile: profile }),
      () => evaluateContribution(fixture, { profile }),
      () => evaluatePullRequest(normalizeInput(fixture), { profile }),
      () => evaluateIssue(normalizeInput({ ...fixture, kind: "issue" }), { profile }),
      () => evaluateSubmission({ ...fixture, profile }),
      () => evaluateSubmission({ input: { ...fixture, profile } }),
      () => evaluateSubmission({ input: fixture, profile }),
      () => evaluateSubmission(fixture, { profile }),
      () => evaluateSubmission({ patchText: patch, profile }),
      () => parsePatchSubmission(patch, { profile })
    ]) assert.throws(run, invalidProfile);
  });
  test(`MCP rejects malformed profile ${JSON.stringify(profile)} at caller and payload boundaries`, async () => {
    for (const name of ["pcf_evaluate", "pcf_preflight"]) {
      await assert.rejects(callPcfMcpTool(name, { input: fixture, profile }), invalidProfile);
      await assert.rejects(callPcfMcpTool(name, { input: { ...fixture, profile } }), invalidProfile);
    }
    await assert.rejects(callPcfMcpTool("pcf_preflight", { patchText: patch, profile }), invalidProfile);
    await assert.rejects(callPcfMcpTool("pcf_queue", { queue: { items: [fixture] }, profile }), invalidProfile);
  });
}

test("valid profiles, optional defaults and trimmed strings retain readiness discrimination", async () => {
  for (const profile of [undefined, null, "", "   ", " standard "]) {
    const output = evaluateContribution({ ...fixture, profile });
    assert.equal(output.profile.id, "standard");
    assert.equal(output.score, 100);
    assert.equal(output.status, "ready-for-maintainer");
  }
  const strict = evaluateContribution({ ...fixture, reviewProfile: " kernel-grade " });
  assert.equal(strict.profile.id, "kernel-grade");
  assert.equal(strict.score, 11);
  assert.equal(strict.status, "low-review-value");
  assert.equal(evaluateContribution({ ...fixture, profile: "standard" }, { profile: "kernel-grade" }).profile.id, "kernel-grade");
  assert.equal(evaluateSubmission({ ...fixture, profile: "standard" }, { profile: "kernel-grade" }).profile.id, "standard");
  assert.equal(evaluateSubmission({ patchText: patch }).profile.id, "kernel-grade");
  assert.equal((await callPcfMcpTool("pcf_preflight", { patchText: patch })).ready, true);
  assert.equal((await callPcfMcpTool("pcf_preflight", { input: fixture, profile: "kernel-grade" })).ready, false);
});

test("invalid lower-priority profiles cannot hide behind a valid override", () => {
  assert.throws(() => evaluateContribution({ ...fixture, profile: "kernel-grdae" }, { profile: "standard" }), invalidProfile);
  assert.throws(() => evaluateSubmission({ ...fixture, profile: "standard" }, { profile: false }), invalidProfile);
  assert.throws(() => evaluateContribution({ ...fixture, profile: "standard", reviewProfile: false }), invalidProfile);
});

test("profile metadata cannot change the evaluator's allowed profile IDs", () => {
  const profile = availableProfiles().find(profile => profile.id === "kernel-grade");
  assert.throws(() => { profile.id = "standard"; }, TypeError);
  assert.equal(evaluateContribution(fixture, { profile: "kernel-grade" }).score, 11);
  assert.throws(() => evaluateContribution(fixture, { profile: "shielded" }), invalidProfile);
  const shielded = evaluateContribution(fixture, { shielded: true });
  assert.equal(shielded.profile.id, "standard");
  assert.equal(shielded.shieldedPosture.shielded, true);
  assert.equal(shielded.shieldedPosture.writesDisabled, true);
});

test("batch rejects malformed defaults and isolates malformed items", () => {
  for (const profile of invalidProfiles) {
    const defaultFailure = evaluateBatch({ profile, items: [fixture] });
    assert.equal(defaultFailure.ok, false);
    assert.deepEqual(defaultFailure.results, []);
    assert.match(defaultFailure.error, /profile/i);
    assert.equal(evaluateBatch({ profile, items: [] }).ok, false);
    const mixed = evaluateBatch({ items: [{ input: fixture }, { input: fixture, profile }, { input: { ...fixture, profile } }] });
    assert.equal(mixed.ok, false);
    assert.equal(mixed.summary.evaluated, 1);
    assert.equal(mixed.summary.errors, 2);
    assert.equal(mixed.results[0].status, "ready-for-maintainer");
    for (const result of mixed.results.slice(1)) {
      assert.equal(result.ok, false);
      assert.equal(result.evaluation, undefined);
      assert.match(result.error, /profile/i);
    }
  }
  const nestedWins = evaluateBatch({ profile: "kernel-grade", items: [{ input: { ...fixture, profile: "standard" } }] });
  assert.equal(nestedWins.results[0].profile, "standard");
});

test("queues reject malformed profiles before producing maintainer routes", () => {
  for (const profile of invalidProfiles) {
    assert.throws(() => buildMaintainerQueue({ profile, items: [] }), invalidProfile);
    assert.throws(() => buildMaintainerQueue({ items: [fixture] }, { profile }), invalidProfile);
    assert.throws(() => buildMaintainerQueue({ items: [{ ...fixture, profile }] }), invalidProfile);
    assert.throws(() => buildMaintainerQueue({ items: [{ input: { ...fixture, profile } }] }), invalidProfile);
    assert.throws(() => evaluateQueueItem({ input: fixture, profile }), invalidProfile);
  }
  assert.equal(buildMaintainerQueue({ profile: "kernel-grade", items: [{ ...fixture, profile: "standard" }] }).items[0].status, "ready-for-maintainer");
  assert.equal(evaluateQueueItem({ input: fixture }, { profile: "kernel-grade" }).evaluation.profile.id, "kernel-grade");
});

test("MCP stdio reports a tool error then serves valid requests in the same process", () => {
  const messages = ["kernel-grdae", "standard", "kernel-grade"].map((profile, index) => ({ jsonrpc: "2.0", id: index + 1, method: "tools/call", params: { name: "pcf_preflight", arguments: { input: fixture, profile } } }));
  const child = spawnSync(process.execPath, ["src/mcp/server.mjs"], { cwd: new URL("..", import.meta.url), encoding: "utf8", input: messages.map(message => JSON.stringify(message)).join("\n") + "\n", timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  const replies = child.stdout.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(replies.length, 3);
  assert.equal(replies[0].result.isError, true);
  const failure = JSON.parse(replies[0].result.content[0].text);
  assert.equal(failure.ok, false);
  assert.equal(failure.evaluation, undefined);
  assert.match(failure.error, /profile.*standard.*kernel-grade/i);
  assert.equal(JSON.parse(replies[1].result.content[0].text).ready, true);
  assert.equal(JSON.parse(replies[2].result.content[0].text).ready, false);
});
