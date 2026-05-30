import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution, renderMarkdownReport } from "../src/core/evaluator.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}

test("unready pull request is blocked before maintainer review", async () => {
  const result = evaluateContribution(await fixture("pr-unready"));
  assert.equal(result.kind, "pull_request");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.score < 50);
  assert.ok(result.labels.includes("too-broad"));
  assert.ok(result.labels.includes("needs-tests"));
  assert.ok(result.labels.includes("secrets-risk"));
  assert.ok(result.repairSteps.some((step) => step.includes("Split unrelated work")));
});

test("ready pull request passes as reviewable", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.blockers.length, 0);
  assert.ok(result.strengths.some((item) => item.includes("test")));
  assert.equal(result.profile.id, "standard");
  assert.ok(result.reviewBudget.minutes > 0);
});

test("unready issue requires reproducer and real evidence", async () => {
  const result = evaluateContribution(await fixture("issue-unready"));
  assert.equal(result.kind, "issue");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-reproducer"));
  assert.ok(result.labels.includes("needs-real-evidence"));
  assert.ok(result.blockers.some((check) => check.id === "reproducer"));
});

test("ready issue has enough evidence for maintainer attention", async () => {
  const result = evaluateContribution(await fixture("issue-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
});

test("markdown report includes status, labels, repairs, and marker", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  const markdown = renderMarkdownReport(result);
  assert.match(markdown, /Premature Contribution Firewall Review Readiness/);
  assert.match(markdown, /Profile:/);
  assert.match(markdown, /Review budget:/);
  assert.match(markdown, /ready-for-maintainer/);
  assert.match(markdown, /Repair Checklist/);
  assert.match(markdown, /<!-- premature-contribution-firewall-review -->/);
});

test("kernel-grade ready patch passes strict maintainer profile", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-ready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.provenance.signedOff, true);
  assert.ok(result.checks.some((check) => check.id === "dco-signoff" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "kernel-build-evidence" && check.status === "pass"));
});

test("kernel-grade unready patch blocks before maintainer attention", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-unready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-dco-signoff"));
  assert.ok(result.labels.includes("needs-tool-provenance"));
  assert.ok(result.labels.includes("review-budget-high"));
  assert.ok(result.blockers.some((check) => check.id === "dco-signoff"));
});

test("repository policy files make ready submissions easier to route", async () => {
  const result = evaluateContribution(await fixture("pr-policy-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.policyProfile.hasPolicy, true);
  assert.ok(result.policyProfile.sources.some((source) => source.type === "codeowners"));
  assert.ok(result.policyProfile.testCommands.includes("npm test"));
  assert.ok(result.policyProfile.ownerMatches.some((match) => match.owners.includes("@maintainers/core")));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "pass"));
});

test("repository policy files block submissions that ignore local rules", async () => {
  const result = evaluateContribution(await fixture("pr-policy-unready"));
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("policy-failed"));
  assert.ok(result.labels.includes("needs-project-test-command"));
  assert.ok(result.checks.some((check) => check.id === "policy" && check.status === "fail"));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "fail"));
});
