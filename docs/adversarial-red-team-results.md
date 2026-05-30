# Premature Contribution Firewall Adversarial Red-Test Results

This red-test corpus captures hostile or malformed submissions that previously exposed weak spots. The point is not to prove perfect security; it is to keep concrete breakage residue reproducible.

## Summary

- Version: 2026.05.30
- Cases: 8/8 passing
- Runtime: measured by the runner and returned in JSON as `durationMs`; it varies by machine

## Categories

- verification-laundering: 1/1 passing
- path-confusion: 1/1 passing
- secret-evasion: 1/1 passing
- review-budget-evasion: 1/1 passing
- ci-laundering: 1/1 passing
- automation-hijack: 1/1 passing
- api-schema: 1/1 passing
- patch-parser: 1/1 passing

## Cases

| Result | Category | Case | Expected | Actual | Score | Labels / Error | Residue |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| PASS | verification-laundering | negated-tests-pr | needs-repair | needs-repair | 78 | `needs-human-verification`, `needs-repair` | Initial probe passed as ready-for-maintainer because the raw phrase `npm test` counted as verification. |
| PASS | path-confusion | path-traversal-docs-pr | low-review-value | low-review-value | 70 | `suspicious-path`, `low-review-value` | Initial long-form probe passed as ready-for-maintainer because `docs/../src/server.mjs` looked like docs. |
| PASS | secret-evasion | aws-secret-pr | low-review-value | low-review-value | 60 | `secrets-risk`, `low-review-value` | Initial probe passed as ready-for-maintainer because only GitHub/OpenAI/private-key patterns were detected. |
| PASS | review-budget-evasion | generated-bundle-pr | needs-repair | needs-repair | 90 | `generated-artifact-review`, `needs-repair` | Initial probe passed as ready-for-maintainer because generated artifact churn was not independently checked. |
| PASS | ci-laundering | all-checks-skipped-pr | needs-repair | needs-repair | 93 | `ci-missing`, `needs-repair` | Initial probe passed as ready-for-maintainer because skipped and neutral conclusions counted as passing. |
| PASS | automation-hijack | prompt-injection-pr | low-review-value | low-review-value | 80 | `prompt-injection-risk`, `low-review-value` | Initial probe passed as ready-for-maintainer because review-bypass language was not quarantined. |
| PASS | api-schema | batch-non-array-items | false | not-ok | n/a | items must be an array | Initial probe returned ok=true with zero results, which could hide caller integration bugs. |
| PASS | patch-parser | empty-patch-text | low-review-value | low-review-value | 0 | `needs-context`, `needs-tests`, `needs-human-verification`, `ci-missing` | Initial probe already held; kept as a canary that empty patch text remains low-review-value. |
