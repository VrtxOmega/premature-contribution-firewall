import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("GitHub Action is a read-only composite dry-run queue runner", async () => {
  const action = await readFile(new URL("../action.yml", import.meta.url), "utf8");

  assert.match(action, /using: composite/);
  assert.match(action, /actions\/setup-node@v6/);
  assert.match(action, /node-version: "22"/);
  assert.match(action, /scripts\/run-public-pilot\.mjs/);
  assert.match(action, /--format markdown/);
  assert.match(action, /--write "\$output_path"/);
  assert.match(action, /PCF_DRY_RUN: "true"/);
  assert.match(action, /PCF_POST_COMMENTS: "false"/);
  assert.match(action, /PCF_APPLY_LABELS: "false"/);
  assert.match(action, /PCF_COLLECT_REPOSITORY_CONTEXT: "true"/);
  assert.match(action, /shielded:/);
  assert.match(action, /assurance-level:/);
  assert.match(action, /PCF_SHIELDED: \$\{\{ inputs\.shielded \}\}/);
  assert.match(action, /PCF_ASSURANCE_LEVEL: \$\{\{ inputs\.assurance-level \}\}/);
  assert.match(action, /GITHUB_TOKEN: \$\{\{ inputs\.github-token \|\| github\.token \}\}/);
  assert.match(action, /artifact-path=\$output_path/);
  assert.doesNotMatch(action, /PCF_POST_COMMENTS: "true"|PCF_APPLY_LABELS: "true"/);
  assert.doesNotMatch(action, /issues: write|pull-requests: write|contents: write|gh issue comment|gh pr review/);
});

test("GitHub Action documentation shows least-privilege dry-run usage", async () => {
  const docs = await readFile(new URL("../docs/GITHUB_ACTION.md", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  for (const content of [docs, readme]) {
    assert.match(content, /VrtxOmega\/premature-contribution-firewall@v0\.1\.0/);
    assert.match(content, /contents: read/);
    assert.match(content, /issues: read/);
    assert.match(content, /pull-requests: read/);
    assert.match(content, /github-token: \$\{\{ github\.token \}\}/);
    assert.doesNotMatch(content, /contents: write|issues: write|pull-requests: write/);
  }
});
