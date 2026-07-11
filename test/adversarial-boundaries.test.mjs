import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBatch, evaluateSubmission } from "../src/core/api.mjs";
import { buildLaneStatus } from "../src/core/lane-status.mjs";
import { analyzeRepositoryContext } from "../src/core/repository-context.mjs";
import { evaluateReproGate } from "../src/core/repro-gate.mjs";
import { buildSeriousCandidateScout } from "../src/core/serious-scout.mjs";

test("public core boundaries fail closed on null and primitive JSON shapes", () => {
  const malformed = [null, true, false, 0, 1, "", "text", [], [null]];

  for (const value of malformed) {
    assert.doesNotThrow(() => evaluateSubmission(value));
    assert.doesNotThrow(() => buildLaneStatus(value));
    assert.doesNotThrow(() => analyzeRepositoryContext(value));
    assert.doesNotThrow(() => evaluateReproGate(value));
    assert.doesNotThrow(() => buildSeriousCandidateScout(value));
  }
});

test("batch evaluation records malformed members without throwing", () => {
  const result = evaluateBatch({ items: [null, true, "text", [], {}] });

  assert.equal(result.ok, false);
  assert.equal(result.summary.requested, 5);
  assert.equal(result.summary.errors, 4);
  assert.match(result.results[0].error, /batch item must be an object/);
  assert.equal(result.results[4].ok, true);
});

test("serious scout ignores malformed members and refuses empty promotion", () => {
  const report = buildSeriousCandidateScout({ issues: [null, true, [], "issue"] });

  assert.equal(report.summary.total, 0);
  assert.equal(report.automation.status, "NO_ACTION");
  assert.match(report.automation.reason, /No issues were inspected/);
});

test("empty repository context is unchecked rather than a duplicate-search pass", () => {
  const context = analyzeRepositoryContext({ repositoryContext: {} });

  assert.equal(context.hasContext, false);
  assert.equal(context.checkStatus, "unchecked");
});
