#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const DEFAULT_WORKFLOW_PATH = join(repoRoot, ".github", "workflows", "pcf-verification.yml");

export const REQUIRED_WORKFLOW_SNIPPETS = [
  "name: PCF Verification",
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "permissions:",
  "contents: read",
  "PCF_DRY_RUN: \"true\"",
  "PCF_POST_COMMENTS: \"false\"",
  "PCF_APPLY_LABELS: \"false\"",
  "PCF_COLLECT_REPOSITORY_CONTEXT: \"true\"",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "node-version: \"22\"",
  "npm run ci:verify",
  "npm run repo:verify",
  "npm run check",
  "npm test",
  "npm run benchmark",
  "npm run redtest",
  "npm run demo:maintainer -- --fail-on-regression",
  "npm run benchmark:write",
  "npm run redtest:write",
  "npm run demo:maintainer:write",
  "actions/upload-artifact@v7"
];

export const FORBIDDEN_WORKFLOW_SNIPPETS = [
  "contents: write",
  "pull-requests: write",
  "issues: write",
  "PCF_DRY_RUN: \"false\"",
  "PCF_POST_COMMENTS: \"true\"",
  "PCF_APPLY_LABELS: \"true\"",
  "npm publish",
  "gh pr merge",
  "gh release create"
];

export async function verifyCiWorkflow({ workflowPath = DEFAULT_WORKFLOW_PATH } = {}) {
  const content = await readFile(workflowPath, "utf8");
  const requiredMissing = REQUIRED_WORKFLOW_SNIPPETS.filter((snippet) => !content.includes(snippet));
  const forbiddenPresent = FORBIDDEN_WORKFLOW_SNIPPETS.filter((snippet) => content.includes(snippet));
  const orderedGateErrors = verifyGateOrder(content, [
    "npm run ci:verify",
    "npm run repo:verify",
    "npm run check",
    "npm test",
    "npm run benchmark",
    "npm run redtest",
    "npm run demo:maintainer -- --fail-on-regression",
    "npm run benchmark:write",
    "npm run redtest:write",
    "npm run demo:maintainer:write",
    "actions/upload-artifact@v7"
  ]);

  const failures = [
    ...requiredMissing.map((snippet) => `missing required workflow snippet: ${snippet}`),
    ...forbiddenPresent.map((snippet) => `forbidden workflow snippet present: ${snippet}`),
    ...orderedGateErrors
  ];

  return {
    ok: failures.length === 0,
    workflowPath,
    summary: {
      requiredChecked: REQUIRED_WORKFLOW_SNIPPETS.length,
      forbiddenChecked: FORBIDDEN_WORKFLOW_SNIPPETS.length,
      missing: requiredMissing.length,
      forbidden: forbiddenPresent.length,
      orderErrors: orderedGateErrors.length
    },
    failures
  };
}

function verifyGateOrder(content, snippets) {
  const errors = [];
  let lastIndex = -1;
  for (const snippet of snippets) {
    const index = content.indexOf(snippet);
    if (index < 0) continue;
    if (index < lastIndex) {
      errors.push(`workflow gate is out of order: ${snippet}`);
    }
    lastIndex = index;
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyCiWorkflow();
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`CI workflow verification passed: ${result.summary.requiredChecked} required snippets, ${result.summary.forbiddenChecked} forbidden snippets checked.\n`);
  }
}
