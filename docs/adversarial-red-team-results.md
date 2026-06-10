# Premature Contribution Firewall Adversarial Red-Test Results

This red-test corpus captures hostile or malformed submissions that previously exposed weak spots. The point is not to prove perfect security; it is to keep concrete breakage residue reproducible.

## Summary

- Version: 2026.06.10
- Cases: 15/15 passing
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
- queue-explanation: 2/2 passing
- queue-actor: 1/1 passing
- duplicate-evasion: 3/3 passing
- context-evasion: 1/1 passing

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
| PASS | queue-explanation | next-action-context-reason-priority | check-duplicate-or-fixed-first | check-duplicate-or-fixed-first | n/a | Repository context label: possibly-solved. | Large-bench replay residue showed `check-duplicate-or-fixed-first` items whose reason could say `Reporter evidence label: duplicate-search-needed`, forcing maintainers to re-triage the triage. |
| PASS | queue-explanation | next-action-wait-state-reason-priority | not-actionable-yet | not-actionable-yet | n/a | Blocked or parked label: maintainer-pending-clarification. | Large-bench replay residue showed `not-actionable-yet` items whose reason could cite reporter evidence instead of the maintainer-pending state. |
| PASS | queue-actor | next-action-maintainer-owned-reporter-suppression | needs-maintainer-decision | needs-maintainer-decision | n/a | Maintainer-owned label: maintainer-authored. | Large-bench ask-reporter residue included a maintainer-authored issue that still routed to `ask-reporter-for-evidence`, misidentifying the next actor. |
| PASS | duplicate-evasion | duplicate-recurrence-followup-laundering | needs-repair | needs-repair | 56 | `needs-context`, `needs-environment`, `needs-logs`, `duplicate-search-needed` | Initial probe ignored duplicate recurrence because contextual follow-up references suppressed the open linked issue. |
| PASS | duplicate-evasion | merged-pr-replay-laundering | needs-repair | needs-repair | 82 | `possibly-solved`, `needs-repair` | Initial probe passed as ready-for-maintainer because merged local pull requests were not compared against new submissions. |
| PASS | duplicate-evasion | title-copy-open-issue-laundering | needs-repair | needs-repair | 71 | `needs-context`, `duplicate-search-needed`, `needs-technical-analysis`, `possibly-duplicate` | Initial probe passed as ready-for-maintainer because title similarity against open issues was not enforced when no explicit reference was supplied. |
| PASS | context-evasion | repo-context-error-masking | needs-repair | needs-repair | 71 | `needs-context`, `duplicate-search-needed`, `needs-technical-analysis`, `repo-context-unavailable` | Initial probe omitted `repo-context-unavailable`, letting maintainers assume duplicate and upstream checks had actually run. |
