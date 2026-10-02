import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution } from "../src/core/evaluator.mjs";

const context = "Fixes #2817. Before: tall screenshot previews were clipped. After: the preview container allows vertical scrolling without changing other modes.";
const command = "TZ=UTC pnpm --filter @karakeep/web run test -- --run";
function evaluate(text, overrides = {}) {
  return evaluateContribution({ kind: "pull_request", title: "Fix screenshot preview scrolling", body: `${context}\n\n${text}`, authorAssociation: "CONTRIBUTOR", files: [{ filename: "src/preview.tsx", additions: 1, deletions: 1 }], checks: [{ name: "ci", conclusion: "success" }], ...overrides });
}
const check = (result, id) => result.checks.find(c => c.id === id);

test("captured Karakeep pnpm command repairs extraction but does not invent CI", async () => {
  const input = JSON.parse(await readFile(new URL("../fixtures/pr-pnpm-filtered.json", import.meta.url), "utf8"));
  const result = evaluateContribution(input);
  assert.equal(check(result, "tests").status, "pass");
  assert.match(check(result, "tests").reason, /reported|mentions/i);
  assert.equal(check(result, "verification").status, "pass");
  assert.equal(check(result, "ci").status, "warn");
  assert.equal(result.status, "needs-repair");
  assert.equal(result.score, 93);
  assert.deepEqual(result.labels, ["ci-missing", "needs-repair"]);
});

for (const invocation of [
  "pnpm test", "pnpm run test", command,
  'pnpm --filter "@scope/web..." run test:unit -- --run',
  "pnpm --filter=@scope/web test", "pnpm -F @scope/web -r test",
  "pnpm --dir packages/web run test", "pnpm --filter @scope/web --filter @scope/ui run test",
  "CI=true TZ=UTC pnpm --filter @scope/web run test"
]) {
  test(`recognizes a reported pnpm invocation: ${invocation}`, () => {
    const result = evaluate(`## Validation\n\n- \`${invocation}\``);
    assert.equal(check(result, "tests").status, "pass");
    assert.equal(check(result, "verification").status, "pass");
    assert.ok(result.strengths.includes("Includes a test or verification signal."));
  });
}

for (const text of [
  `Verification: I did not run \`${command}\`.`,
  `Verification: I have not yet run \`${command}\`.`,
  `Verification: I haven't run \`${command}\`.`,
  `## Validation\n\n- \`${command}\` (not executed)`,
  `I have not executed \`${command}\`.`,
  `I have not tested with \`${command}\`.`,
  `I have not verified with \`${command}\`.`,
  `I have not checked with \`${command}\`.`,
  `Verification: \`${command}\` was not run.`,
  `Verification: \`${command}\`; tests were not yet executed.`,
  `Verification: I plan to run \`${command}\` tomorrow.`,
  `Verification: I will run \`${command}\` tomorrow.`,
  `Verification: I will run ${command} tomorrow.`,
  `## Verification plan\n\n\`\`\`sh\n${command}\n\`\`\``,
  `## Verification\n\nPlanned commands:\n\n- \`${command}\``,
  `## Verification\n\nPlan:\n\n- \`${command}\``,
  `## Validation\n\nI plan to run the following tomorrow.\n\n\`\`\`sh\n${command}\n\`\`\``,
  `## Validation\n\n\`\`\`sh\n${command}\n\`\`\`\n\nI will run these tomorrow.`,
  `## Validation\n\n- \`${command}\`\n\nThese are planned only.`,
  `## Verification\n\n- [ ] \`${command}\``,
  `## Verification\n\nExample: \`${command}\``,
  `## Usage examples\n\n\`\`\`sh\n${command}\n\`\`\``,
  `The documentation describes \`${command}\`; it is an example, not an execution record.`
]) {
  test(`does not reward unexecuted pnpm evidence: ${text.split("\n")[0]}`, () => {
    const result = evaluate(text);
    assert.equal(check(result, "tests").status, "fail");
    assert.notEqual(check(result, "verification").status, "pass");
    assert.notEqual(result.status, "ready-for-maintainer");
    assert.equal(result.strengths.includes("Includes a test or verification signal."), false);
  });
}

for (const invocation of [
  "pnpm install", "pnpm add test", "pnpm --filter test run lint",
  "pnpm run lint -- test", "pnpm exec echo test", "pnpm run contest",
  "pnpm run test-report", "mypnpm test", 'echo "pnpm test"',
  'pnpm --filter "@scope/web run test', "pnpm --filter '@scope/web run test",
  "pnpm test --help", "pnpm run test -- --help"
]) {
  test(`does not interpret an unrelated command as testing: ${invocation}`, () => {
    const result = evaluate(`## Validation\n\n- \`${invocation}\``);
    assert.equal(check(result, "tests").status, "fail");
    assert.notEqual(check(result, "verification").status, "pass");
  });
}

test("a pnpm command alone does not supply behavioral context", () => {
  const result = evaluate("", { body: `\`${command}\`` });
  assert.equal(check(result, "tests").status, "pass");
  assert.equal(check(result, "verification").status, "warn");
  assert.ok(result.labels.includes("needs-human-verification"));
});

test("a checked test-plan item is an execution claim, while a bare heading is not", () => {
  const result = evaluate(`## Test plan\n\n- [x] \`${command}\``);
  assert.equal(check(result, "tests").status, "pass");
  assert.match(check(result, "tests").reason, /execution is not verified/);
  const unrelated = evaluate("## Verification\n\n- `pnpm install`");
  assert.equal(check(unrelated, "tests").status, "fail");
  const headingVariant = evaluate("## Verification results\n\n- `pnpm install`");
  assert.equal(check(headingVariant, "tests").status, "fail");
});

test("pnpm recognition respects the discovered project command", () => {
  const result = evaluate(`Ran \`${command}\`.`, { repositoryFiles: [{ path: "CONTRIBUTING.md", content: "Run `npm test` before submission." }] });
  assert.equal(check(result, "tests").status, "pass");
  assert.equal(check(result, "project-test-command").status, "warn");
});

test("exact policy command is not satisfied by an explicitly unexecuted mention", () => {
  for (const text of [`I have not yet run \`${command}\`.`, `I plan to run \`${command}\` tomorrow.`, `I have not executed \`${command}\`.`, `\`${command}\` (not executed)`]) {
    const result = evaluate(`Verification: ${text}`, { repositoryFiles: [{ path: "CONTRIBUTING.md", content: `Pull requests must include tests. Run \`${command.replace(/^TZ=UTC /, "")}\` before submission.` }] });
    assert.equal(check(result, "project-test-command").status, "fail");
    assert.equal(check(result, "policy").status, "fail");
  }
});

test("plain-text patches cannot substitute planned pnpm work for CI", () => {
  const result = evaluate(`Verification: I will run \`${command}\` later.`, { submissionFormat: "patch_series", checks: [] });
  assert.equal(check(result, "ci").status, "warn");
});

for (const report of [
  "I ran `pnpm test`; all 12 examples passed.",
  "I ran `pnpm test` to verify the query plan.",
  "I ran `pnpm test`; no pending tests remain."
]) {
  test(`completion reports are not negated by incidental context words: ${report}`, () => {
    const result = evaluate(`## Verification\n\n${report}`);
    assert.equal(check(result, "tests").status, "pass");
    assert.equal(check(result, "verification").status, "pass");
    assert.equal(check(result, "negated-verification").status, "pass");
    assert.equal(result.status, "ready-for-maintainer");
  });
}

for (const heading of ["Test plan", "Examples"]) {
  test(`nested command sections retain the ${heading} ancestor in every consumer`, () => {
    const text = `## ${heading}\n\n### Commands\n\n\`pnpm test\``;
    const result = evaluate(text, { repositoryFiles: [{ path: "CONTRIBUTING.md", content: "Pull requests must include tests. Run `pnpm test`." }] });
    assert.equal(check(result, "tests").status, "fail");
    assert.notEqual(check(result, "verification").status, "pass");
    assert.equal(check(result, "project-test-command").status, "fail");
    assert.equal(check(result, "policy").status, "fail");
    assert.equal(result.strengths.includes("Includes a test or verification signal."), false);
    assert.notEqual(result.status, "ready-for-maintainer");
    const patch = evaluate(text, { submissionFormat: "patch_series", checks: [] });
    assert.equal(check(patch, "ci").status, "warn");
  });
}

test("nested plan permits a completed item, while examples never certify completion", () => {
  const result = evaluate("## Test plan\n\n### Commands\n\n- [x] `pnpm test`");
  assert.equal(check(result, "tests").status, "pass");
  const example = evaluate("## Examples\n\n### Commands\n\n- [x] I ran `pnpm test`");
  assert.equal(check(example, "tests").status, "fail");
});

for (const heading of ["Test plan", "Examples"]) {
  test(`a sibling heading ends ${heading} ancestry`, () => {
    const result = evaluate(`## ${heading}\n\n### Notes\n\nSee the project guide.\n\n## Verification\n\nI ran \`pnpm test\`; all assertions passed.`);
    assert.equal(check(result, "tests").status, "pass");
    assert.equal(result.status, "ready-for-maintainer");
  });
}

for (const invocation of ['pnpm test "--help"', "pnpm test '--help'", "pnpm run test -- '--help'", 'pnpm test --he"lp"', 'pnpm test "--version"', "pnpm test '-h'"]) {
  test(`quoted help/version tokens retain their meaning: ${invocation}`, () => {
    const result = evaluate(`## Verification\n\n\`${invocation}\``);
    assert.equal(check(result, "tests").status, "fail");
    assert.notEqual(result.status, "ready-for-maintainer");
  });
}

for (const invocation of ['pnpm "test"', 'corepack pnpm --filter "@scope/*" run "test:unit"']) {
  test(`normalizes supported quoted command tokens: ${invocation}`, () => {
    assert.equal(check(evaluate(`## Verification\n\n\`${invocation}\``), "tests").status, "pass");
  });
}

for (const label of ["**Verification:**", "**Verification**:", "__Verification:__", "_Verification_:", "- **Verification:**"]) {
  test(`formatted section labels cannot supply test evidence: ${label}`, () => {
    for (const invocation of ["pnpm install", "pnpm test --help"]) {
      const result = evaluate(`${label} \`${invocation}\``);
      assert.equal(check(result, "tests").status, "fail");
      assert.notEqual(check(result, "verification").status, "pass");
      assert.notEqual(result.status, "ready-for-maintainer");
    }
    assert.equal(check(evaluate(`${label} \`pnpm test\``), "tests").status, "pass");
  });
}
