import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_WORKFLOW_SNIPPETS,
  REQUIRED_WORKFLOW_SNIPPETS,
  verifyCiWorkflow
} from "../scripts/verify-ci-workflow.mjs";

const workflowPath = fileURLToPath(new URL("../.github/workflows/pcf-verification.yml", import.meta.url));

test("CI workflow preserves all maintainer proof gates", async () => {
  const result = await verifyCiWorkflow({ workflowPath });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.summary.requiredChecked, REQUIRED_WORKFLOW_SNIPPETS.length);
  assert.equal(result.summary.forbiddenChecked, FORBIDDEN_WORKFLOW_SNIPPETS.length);
  assert.ok(REQUIRED_WORKFLOW_SNIPPETS.includes("npm run repo:verify"));
});

test("CI workflow stays dry-run and least-privilege", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /PCF_DRY_RUN: "true"/);
  assert.match(workflow, /PCF_POST_COMMENTS: "false"/);
  assert.match(workflow, /PCF_APPLY_LABELS: "false"/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|issues: write/);
  assert.doesNotMatch(workflow, /PCF_POST_COMMENTS: "true"|PCF_APPLY_LABELS: "true"/);
  assert.match(workflow, /npm run repo:verify/);
});

test("CI workflow uploads generated proof artifacts after gates pass", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gateIndex = workflow.indexOf("npm run demo:maintainer -- --fail-on-regression");
  const artifactIndex = workflow.indexOf("actions/upload-artifact@v4");

  assert.ok(gateIndex > 0);
  assert.ok(artifactIndex > gateIndex);
  assert.match(workflow, /docs\/benchmark-results\.md/);
  assert.match(workflow, /docs\/adversarial-red-team-results\.md/);
  assert.match(workflow, /docs\/maintainer-demo-output\.md/);
  assert.match(workflow, /if-no-files-found: error/);
});
