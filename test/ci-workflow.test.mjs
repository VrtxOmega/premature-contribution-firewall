import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assertDryRunWorkflow(workflow);
});

function assertDryRunWorkflow(workflow) {
  assert.match(workflow, /permissions:\r?\n\s+contents: read/);
  assert.match(workflow, /PCF_DRY_RUN: "true"/);
  assert.match(workflow, /PCF_POST_COMMENTS: "false"/);
  assert.match(workflow, /PCF_APPLY_LABELS: "false"/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|issues: write/);
  assert.doesNotMatch(workflow, /PCF_POST_COMMENTS: "true"|PCF_APPLY_LABELS: "true"/);
  assert.match(workflow, /npm run repo:verify/);
}

for (const [name, newline] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`CI workflow safety checks retain rejection with ${name} line endings`, async () => {
    const workflow = (await readFile(workflowPath, "utf8")).replace(/\r?\n/g, newline);
    const dir = await mkdtemp(join(tmpdir(), "pcf-workflow-"));
    const copyPath = join(dir, "workflow.yml");
    try {
      assertDryRunWorkflow(workflow);
      await writeFile(copyPath, workflow);
      assert.equal((await verifyCiWorkflow({ workflowPath: copyPath })).ok, true);
      for (const [safe, unsafe] of [
        ["contents: read", "contents: write"],
        ['PCF_POST_COMMENTS: "false"', 'PCF_POST_COMMENTS: "true"']
      ]) {
        const mutated = workflow.replace(safe, unsafe);
        assert.notEqual(mutated, workflow);
        assert.throws(() => assertDryRunWorkflow(mutated), assert.AssertionError);
        await writeFile(copyPath, mutated);
        const rejected = await verifyCiWorkflow({ workflowPath: copyPath });
        assert.equal(rejected.ok, false);
        assert.ok(rejected.failures.includes(`forbidden workflow snippet present: ${unsafe}`));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("CI workflow uploads generated proof artifacts after gates pass", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const gateIndex = workflow.indexOf("npm run demo:maintainer -- --fail-on-regression");
  const artifactIndex = workflow.indexOf("actions/upload-artifact@v7");

  assert.ok(gateIndex > 0);
  assert.ok(artifactIndex > gateIndex);
  assert.match(workflow, /docs\/benchmark-results\.md/);
  assert.match(workflow, /docs\/adversarial-red-team-results\.md/);
  assert.match(workflow, /docs\/maintainer-demo-output\.md/);
  assert.match(workflow, /if-no-files-found: error/);
});
