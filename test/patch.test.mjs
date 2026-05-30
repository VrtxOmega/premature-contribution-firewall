import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution } from "../src/core/evaluator.mjs";
import { parsePatchSubmission } from "../src/core/patch.mjs";

async function patchFixture(name) {
  return readFile(new URL(`../fixtures/${name}.patch`, import.meta.url), "utf8");
}

test("plain-text kernel patch parses into a reviewable patch-series payload", async () => {
  const parsed = parsePatchSubmission(await patchFixture("patch-kernel-ready"));
  assert.equal(parsed.submissionFormat, "patch_series");
  assert.equal(parsed.profile, "kernel-grade");
  assert.equal(parsed.changedFiles, 1);
  assert.equal(parsed.additions, 3);
  assert.equal(parsed.patchSeries.patchCount, 1);
  assert.ok(parsed.patchSeries.subjects[0].includes("sched:"));
});

test("ready plain-text patch passes kernel-grade review", async () => {
  const parsed = parsePatchSubmission(await patchFixture("patch-kernel-ready"));
  const result = evaluateContribution(parsed);
  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.patchSeries.patchCount, 1);
  assert.ok(result.checks.some((check) => check.id === "kernel-subject" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "ci" && check.status === "pass"));
});

test("unready plain-text patch blocks missing sign-off and provenance", async () => {
  const parsed = parsePatchSubmission(await patchFixture("patch-kernel-unready"));
  const result = evaluateContribution(parsed);
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-dco-signoff"));
  assert.ok(result.labels.includes("needs-tool-provenance"));
  assert.ok(result.blockers.some((check) => check.id === "dco-signoff"));
});
