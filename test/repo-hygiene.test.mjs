import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_PATTERNS,
  REQUIRED_FILES,
  REQUIRED_SNIPPETS,
  verifyRepoHygiene
} from "../scripts/verify-repo-hygiene.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("repository hygiene verifier passes required maintainer files", async () => {
  const result = await verifyRepoHygiene({ root: repoRoot });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.summary.requiredFiles, REQUIRED_FILES.length);
  assert.equal(result.summary.forbiddenPatterns, FORBIDDEN_PATTERNS.length);
  assert.ok(result.summary.snippetsChecked >= Object.keys(REQUIRED_SNIPPETS).length);
  assert.ok(result.summary.issueTemplates >= 4);
});

test("pull request template requires evidence and dry-run guardrails", async () => {
  const template = await readFile(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");

  assert.match(template, /## Problem/);
  assert.match(template, /## Change/);
  assert.match(template, /## Risk/);
  assert.match(template, /npm run repo:verify/);
  assert.match(template, /npm run ci:gates/);
  assert.match(template, /does not claim AI-authorship detection/);
  assert.match(template, /does not enable GitHub comments, labels, or other writes by default/);
});

test("issue templates route maintainer feedback into reproducible cases", async () => {
  const falsePositive = await readFile(new URL("../.github/ISSUE_TEMPLATE/false_positive.yml", import.meta.url), "utf8");
  const falseNegative = await readFile(new URL("../.github/ISSUE_TEMPLATE/false_negative.yml", import.meta.url), "utf8");
  const contextMiss = await readFile(new URL("../.github/ISSUE_TEMPLATE/context_miss.yml", import.meta.url), "utf8");

  assert.match(falsePositive, /Evidence That Should Have Counted/);
  assert.match(falsePositive, /feedback candidate or benchmark case/);
  assert.match(falseNegative, /Breakage Residue/);
  assert.match(falseNegative, /adversarial red-test case/);
  assert.match(contextMiss, /Similar open issue/);
  assert.match(contextMiss, /Concurrent pull request/);
  assert.match(contextMiss, /Upstream fix/);
  assert.match(contextMiss, /repositoryContext/);
});
