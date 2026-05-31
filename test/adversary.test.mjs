import test from "node:test";
import assert from "node:assert/strict";
import { ADVERSARIAL_CASES, renderAdversaryMarkdown, runAdversary } from "../src/core/adversary.mjs";

test("adversarial corpus preserves concrete red-team residue", () => {
  assert.ok(ADVERSARIAL_CASES.length >= 8);
  const ids = new Set(ADVERSARIAL_CASES.map((item) => item.id));
  for (const id of [
    "negated-tests-pr",
    "path-traversal-docs-pr",
    "aws-secret-pr",
    "generated-bundle-pr",
    "all-checks-skipped-pr",
    "prompt-injection-pr",
    "batch-non-array-items",
    "empty-patch-text",
    "next-action-context-reason-priority",
    "next-action-wait-state-reason-priority"
  ]) {
    assert.ok(ids.has(id), `missing adversarial case ${id}`);
  }
});

test("adversarial expectations pass after hardening", () => {
  const result = runAdversary();
  assert.equal(result.ok, true, JSON.stringify(result.cases.filter((item) => !item.passed), null, 2));
  assert.equal(result.adversary.failed, 0);
  assert.equal(result.adversary.passed, result.adversary.total);
});

test("adversarial cases expose the hardening labels maintainers need", () => {
  const result = runAdversary();
  const byId = new Map(result.cases.map((item) => [item.id, item]));
  assert.ok(byId.get("negated-tests-pr").labels.includes("needs-human-verification"));
  assert.ok(byId.get("path-traversal-docs-pr").labels.includes("suspicious-path"));
  assert.ok(byId.get("aws-secret-pr").labels.includes("secrets-risk"));
  assert.ok(byId.get("generated-bundle-pr").labels.includes("generated-artifact-review"));
  assert.ok(byId.get("all-checks-skipped-pr").labels.includes("ci-missing"));
  assert.ok(byId.get("prompt-injection-pr").labels.includes("prompt-injection-risk"));
  assert.equal(byId.get("batch-non-array-items").ok, false);
  assert.equal(byId.get("next-action-context-reason-priority").actualStatus, "check-duplicate-or-fixed-first");
  assert.equal(byId.get("next-action-wait-state-reason-priority").actualStatus, "not-actionable-yet");
});

test("adversarial markdown is README-ready and includes residue", () => {
  const markdown = renderAdversaryMarkdown(runAdversary());
  assert.match(markdown, /Adversarial Red-Test Results/);
  assert.match(markdown, /Initial probe passed as ready-for-maintainer/);
  assert.match(markdown, /\| Result \| Category \| Case \| Expected \| Actual \| Score \| Labels \/ Error \| Residue \|/);
});
