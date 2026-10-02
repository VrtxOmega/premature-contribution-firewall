# Reported pnpm test commands

The public [Karakeep PR #2864](https://github.com/karakeep-app/karakeep/pull/2864) describes a screenshot scrolling fix and reports `TZ=UTC pnpm --filter @karakeep/web run test -- --run` under **Validation**. PCF source at `95aaa4edc1fd260a302f1a00cee59ac12d03ce29` missed that command: its legacy test keywords did not include pnpm. The frozen input scored 67, with `needs-tests`, `needs-human-verification` and `ci-missing`.

The correction recognizes the reported command and the supplied behavioral context. The same input scores 93 and retains `ci-missing` and `needs-repair`. No CI result was supplied; recognizing prose does not create one. A maintainer can stop asking for a command already in the description while still requesting execution evidence and CI results.

## Provenance and evidence class

- [Public input](../fixtures/pr-pnpm-filtered.json): description and one-file patch captured for source head `d48b27de68c63944bc6db777bfe717b2b36edb0a`.
- [Frozen source metadata](https://github.com/VrtxOmega/premature-contribution-firewall/blob/a7b74a0ae91f039c9b78e824f5ac04ff2eb6e535/docs/examples/public-contributions/sources.json) and [original evaluation](https://github.com/VrtxOmega/premature-contribution-firewall/blob/a7b74a0ae91f039c9b78e824f5ac04ff2eb6e535/docs/examples/public-contributions/README.md) remain unchanged.
- [Feedback candidate](pnpm-feedback-candidate.json) was generated before the fix. Its stored `replay.passed: false` and score 67 intentionally record the baseline failure. Its expectation is an author judgment about extraction, not upstream maintainer feedback.
- This is a retrospective, author-run evaluation of a public contribution. It is not outside PCF adoption, independent validation, proof that the reported command ran, or a recommendation to change the upstream PR.
- The benchmark case and all adversarial variants are synthetic controls. They do not describe actions by the upstream contributor.

## Reproduce from this source checkout

```sh
node src/cli.mjs evaluate fixtures/pr-pnpm-filtered.json --format json
node src/cli.mjs preflight fixtures/pr-pnpm-filtered.json --format json
node --test test/pnpm-test-evidence.test.mjs
npm run benchmark
npm run redtest
```

`evaluate` reports score 93 and exits 0 because evaluation completed. `preflight` exits 1 because the input still needs repair. These are source-checkout commands; the published npm 0.2.0 artifact does not contain this unreleased correction.

To replay the saved candidate against the current evaluator without replacing its baseline record:

```sh
node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {replayCandidateCorpus} from "./src/core/candidates.mjs"; const candidate=JSON.parse(await readFile("docs/pnpm-feedback-candidate.json","utf8")); const result=replayCandidateCorpus([candidate]); console.log(JSON.stringify(result,null,2)); process.exit(result.ok ? 0 : 1);'
```

## Supported scope and controls

Recognition covers `pnpm test`, `pnpm run test`, and `test:*` script names; common filter, directory and recursive flags; optional shell environment assignments, `env` and `corepack` prefixes. Option values and other scripts' arguments cannot substitute for the test script token. Quotes must balance. Supported literal quoted segments are normalized before token comparison: `"--help"` and `'--help'` retain the meaning of `--help`, while quoted filter values remain usable. Help/version flags do not count as running tests. Nothing in the supplied text is executed.

Covered English negations, explicit future-work claims, unchecked items and example-only instructions do not count as completed verification. Planning prose before or after a fenced command applies across its Markdown section. Structural **Test plan** or **Examples** headings retain their scope through nested subheadings; a sibling heading ends that ancestry. A checked item under a **Test plan** heading can still report completed work; a checked example remains an example. Incidental prose such as "all 12 examples passed", "query plan" or "no pending tests remain" does not negate a completed report. Common bold/italic **Verification** labels are treated like their plain-text equivalents and cannot supply test evidence themselves.

Explicit example labels retain their meaning in ordinary Markdown lists, including ``- Example: `pnpm test` ``. Postfix annotations such as `` `pnpm test` (planned) ``, `(pending)` and `(example only)` qualify the command as unexecuted. These checks do not treat parenthesized text inside quoted command arguments as an execution qualifier.

The same negative signal reaches discovered repository-command checks and patch-local CI substitution. A filtered pnpm command does not automatically satisfy a repository policy that asks for `npm test`.

The focused tests exercise the captured input, supported forms, malformed/unrelated commands, positive and negative planning context, exact policy-command contradictions, missing behavioral context and missing CI. A passing unit test for a negative input means PCF rejected the misleading evidence.

This is a bounded heuristic, not a complete Markdown/shell parser or an execution verifier. Unknown options, shell escapes or substitutions, arbitrary wrappers and untested natural-language forms remain outside the claim. Mixed completed/planned reports are treated conservatively and may need clarification. Existing generic non-pnpm verification heuristics remain in place. Report a missed or over-rejected form with a public minimal input; do not infer universal detection from these controls.
