# Premature Contribution Firewall Maintainer Demo

Generated: 2026-05-31T02:35:58.774Z

Verdict: **PASS**

## Claims This Demo Proves

- 66/66 deterministic benchmark cases pass.
- 8/8 adversarial red-test cases pass.
- Maintainer queue sorts 3 supplied GitHub items with repository and upstream context.
- Feedback calibration attaches 2 matching local candidate signal(s) to future queue output.
- 1/1 promoted feedback fixture candidates replay cleanly.
- Candidate replay comparison is stable with 0 regressions.

## Non-Claims

- This is not an AI-authorship detector.
- This demo does not prove universal precision over private maintainer preference.
- This demo does not perform GitHub writes, post comments, apply labels, or require credentials.
- This demo does not certify public deployment security posture; hosted deployments still need auth, rate limits, webhook secrets, and operational review.
- Feedback candidates remain separate from the permanent benchmark until a maintainer intentionally reviews and promotes them.

## Reproduce It

```bash
npm run check
npm test
npm run benchmark
npm run redtest
npm run demo:maintainer -- --fail-on-regression
```

## Proof Summary

| Surface | Result | Count | Note |
| --- | --- | --- | --- |
| Benchmark | PASS | 66/66 | Deterministic fixture corpus |
| Adversarial red test | PASS | 8/8 | Breakage residue corpus |
| Maintainer queue | PASS | 3 items | 3 context findings |
| Feedback calibration | PASS | 2 match(es) | 1 candidate fixture(s) |
| Feedback candidate replay | PASS | 1/1 | Promoted fixture draft |
| Replay comparison | PASS | stable | 0 regressions |

## Maintainer Queue Snapshot

Repository: VrtxOmega/premature-contribution-firewall-demo

Ready: 1; needs repair: 1; low review value: 1; review budget: 36 minutes.

Feedback calibration matches: 2; review-needed conflicts: 0.

| Status | Kind | Item | Title | Action | Context | Budget |
| --- | --- | --- | --- | --- | ---: | ---: |
| ready-for-maintainer | pull_request | #12 | webhook: reject oversized payload bodies | review-now | 0 | 12 |
| needs-repair | pull_request | #13 | webhook: include labels in dry-run response | send-repair-request | 3 | 16 |
| low-review-value | issue | #14 | Bug | do-not-review-yet | 0 | 8 |

## Feedback Candidate Proof

Candidate fixture: feedback-e5141c574eb829be

Evidence artifact hash: `5a336a8a186911a93cfae18e680d6ec566043f3b99c7e91b8080a455951ccae6`

Replay comparison: 1 unchanged, 0 improved, 0 regressed, risk stable.

## Adversarial Residue

| Case | Category | Status | Residue Preserved |
| --- | --- | --- | --- |
| negated-tests-pr | verification-laundering | PASS | Initial probe passed as ready-for-maintainer because the raw phrase `npm test` counted as verification. |
| path-traversal-docs-pr | path-confusion | PASS | Initial long-form probe passed as ready-for-maintainer because `docs/../src/server.mjs` looked like docs. |
| aws-secret-pr | secret-evasion | PASS | Initial probe passed as ready-for-maintainer because only GitHub/OpenAI/private-key patterns were detected. |
| generated-bundle-pr | review-budget-evasion | PASS | Initial probe passed as ready-for-maintainer because generated artifact churn was not independently checked. |
| all-checks-skipped-pr | ci-laundering | PASS | Initial probe passed as ready-for-maintainer because skipped and neutral conclusions counted as passing. |
| prompt-injection-pr | automation-hijack | PASS | Initial probe passed as ready-for-maintainer because review-bypass language was not quarantined. |
| batch-non-array-items | api-schema | PASS | Initial probe returned ok=true with zero results, which could hide caller integration bugs. |
| empty-patch-text | patch-parser | PASS | Initial probe already held; kept as a canary that empty patch text remains low-review-value. |

## Release Note

This output is safe to paste into a README or release note as reproducible local evidence. It should be paired with the benchmark and red-test result artifacts, API documentation, and the release checklist before a public pilot.
