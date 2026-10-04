import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution, normalizeInput } from "../src/core/evaluator.mjs";
import { evaluateSubmission, evaluateBatch } from "../src/core/api.mjs";
import { buildMaintainerQueue, evaluateQueueItem, normalizeQueueInput } from "../src/core/queue.mjs";
import { buildPolicyProfile, normalizeRepositoryFiles } from "../src/core/policy.mjs";
import { parsePatchSubmission } from "../src/core/patch.mjs";
import { analyzeVouchContext } from "../src/core/vouch-context.mjs";
import { callPcfMcpTool } from "../src/mcp/core.mjs";

const ready = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
const dco = { path: "CONTRIBUTING.md", content: "DCO sign-off is required." };
const patch = await readFile(new URL("../fixtures/patch-kernel-ready.patch", import.meta.url), "utf8");
const invalid = [dco, { "CONTRIBUTING.md": dco.content }, "DCO sign-off is required.", false, true, 0, 1, ""];
const errorIsPolicy = error => error instanceof TypeError && error.code === "PCF_INVALID_POLICY_FILES" && /array/i.test(error.message);

test("DCO policy survives valid arrays and remains satisfiable", () => {
  for (const key of ["repositoryFiles", "policyFiles"]) {
    const input = { ...ready, [key]: [dco] };
    const unsigned = evaluateContribution(input);
    assert.equal(unsigned.score, 86);
    assert.equal(unsigned.status, "needs-repair");
    assert.equal(unsigned.policyProfile.requires.dco, true);
    const signed = evaluateContribution({ ...input, body: ready.body + "\n\nSigned-off-by: Example Contributor <contributor@example.com>" });
    assert.equal(signed.score, 100);
    assert.equal(signed.status, "ready-for-maintainer");
  }
});

test("optional null containers, empty-array precedence and file-record aliases remain supported", () => {
  for (const value of [undefined, null, []]) {
    assert.equal(evaluateContribution({ ...ready, repositoryFiles: value }).score, 100);
    assert.deepEqual(normalizeRepositoryFiles(value), []);
  }
  assert.equal(evaluateContribution({ ...ready, repositoryFiles: [], policyFiles: [dco] }).score, 100);
  assert.equal(evaluateContribution({ ...ready, repositoryFiles: null, policyFiles: [dco] }).score, 86);
  for (const file of [{ filename: dco.path, text: dco.content }, { name: dco.path, body: dco.content }]) {
    assert.equal(evaluateContribution({ ...ready, repositoryFiles: [file] }).score, 86);
  }
});

test("core rejects every non-array container and malformed lower-priority aliases", () => {
  for (const value of invalid) {
    assert.throws(() => normalizeRepositoryFiles(value), errorIsPolicy);
    for (const key of ["repositoryFiles", "policyFiles"]) {
      for (const evaluate of [evaluateContribution, normalizeInput, buildPolicyProfile, analyzeVouchContext]) {
        assert.throws(() => evaluate({ ...ready, [key]: value }), errorIsPolicy);
      }
    }
    assert.throws(() => evaluateContribution({ ...ready, repositoryFiles: [], policyFiles: value }), errorIsPolicy);
    assert.throws(() => evaluateContribution({ ...ready, repositoryFiles: value, policyFiles: [dco] }), errorIsPolicy);
  }
});

test("patch parsing rejects malformed containers without changing valid patch defaults", () => {
  for (const value of invalid) assert.throws(() => parsePatchSubmission(patch, { repositoryFiles: value }), errorIsPolicy);
  const parsed = parsePatchSubmission(patch, { repositoryFiles: [dco] });
  assert.equal(parsed.profile, "kernel-grade");
  assert.deepEqual(parsed.repositoryFiles, [dco]);
});

test("API helpers reject malformed policy fields before unwrapping or selecting patch text", () => {
  for (const payload of [
    { ...ready, repositoryFiles: dco },
    { input: { ...ready, policyFiles: dco } },
    { input: ready, repositoryFiles: dco },
    { text: patch, repositoryFiles: false },
    { text: patch, repositoryFiles: [], policyFiles: dco },
    { text: patch, input: { repositoryFiles: dco } }
  ]) assert.throws(() => evaluateSubmission(payload), errorIsPolicy);
  assert.throws(() => evaluateSubmission(ready, { repositoryFiles: dco }), errorIsPolicy);
  assert.equal(evaluateSubmission(ready, { repositoryFiles: [dco] }).score, 100, "options do not introduce policy defaults");
  assert.equal(evaluateSubmission({ input: { ...ready, repositoryFiles: [dco] } }).score, 86);
  assert.equal(evaluateSubmission({ input: ready, repositoryFiles: [dco] }).score, 100, "valid outer policy fields do not become nested defaults");
});

test("batch isolates malformed item containers and rejects malformed envelope candidates", () => {
  const batch = evaluateBatch({ items: [
    { id: "valid", input: { ...ready, repositoryFiles: [dco] } },
    { id: "bad-input", input: { ...ready, repositoryFiles: dco } },
    { id: "bad-envelope", input: ready, policyFiles: false },
    { id: "ready", input: ready }
  ] });
  assert.equal(batch.ok, false);
  assert.equal(batch.summary.evaluated, 2);
  assert.equal(batch.summary.errors, 2);
  assert.deepEqual(batch.results.map(x => x.score), [86, undefined, undefined, 100]);
  for (const result of batch.results.filter(x => !x.ok)) assert.match(result.error, /array/i);
  const malformedDefault = evaluateBatch({ items: [ready], repositoryFiles: dco });
  assert.equal(malformedDefault.ok, false);
  assert.deepEqual(malformedDefault.results, []);
  assert.equal(evaluateBatch({ items: [ready], repositoryFiles: [dco] }).results[0].score, 100, "no new global policy defaults");
});

test("supplied queue validates policy candidates before unwrapping items", () => {
  for (const item of [{ ...ready, repositoryFiles: dco }, { input: ready, policyFiles: false }, { input: { ...ready, repositoryFiles: dco } }]) {
    assert.throws(() => normalizeQueueInput(item), errorIsPolicy);
    assert.throws(() => evaluateQueueItem(item), errorIsPolicy);
    assert.throws(() => buildMaintainerQueue({ items: [item] }), errorIsPolicy);
  }
  assert.throws(() => buildMaintainerQueue({ items: [ready], repositoryFiles: dco }), errorIsPolicy);
  assert.equal(evaluateQueueItem({ input: { ...ready, repositoryFiles: [dco] } }).score, 86);
  assert.equal(evaluateQueueItem({ input: ready, repositoryFiles: [dco] }).score, 100, "no new envelope policy defaults");
});

test("MCP rejects malformed policy containers and preserves valid application boundaries", async () => {
  for (const [name, args] of [
    ["pcf_evaluate", { input: { ...ready, repositoryFiles: dco } }],
    ["pcf_preflight", { input: ready, repositoryFiles: dco }],
    ["pcf_preflight", { patchText: patch, repositoryFiles: false }],
    ["pcf_preflight", { patchText: patch, input: { policyFiles: dco } }],
    ["pcf_policy_profile", { repositoryFiles: false }],
    ["pcf_queue", { queue: { items: [{ input: ready, repositoryFiles: dco }] } }]
  ]) await assert.rejects(() => callPcfMcpTool(name, args), errorIsPolicy);
  assert.equal((await callPcfMcpTool("pcf_policy_profile", { repositoryFiles: [dco] })).requires.dco, true);
  assert.equal((await callPcfMcpTool("pcf_preflight", { input: ready, repositoryFiles: [dco] })).evaluation.score, 100, "top-level policy is patch-only");
});
