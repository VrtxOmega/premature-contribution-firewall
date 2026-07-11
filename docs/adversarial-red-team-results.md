# Premature Contribution Firewall Adversarial Red-Test Results

This red-test corpus captures hostile or malformed submissions that previously exposed weak spots. The point is not to prove perfect security; it is to keep concrete breakage residue reproducible.

## Summary

- Version: 2026.07.10
- Cases: 29/29 passing
- Runtime: measured by the runner and returned in JSON as `durationMs`; it varies by machine

## Categories

- verification-laundering: 1/1 passing
- path-confusion: 1/1 passing
- secret-evasion: 1/1 passing
- review-budget-evasion: 1/1 passing
- ci-laundering: 1/1 passing
- automation-hijack: 1/1 passing
- unicode-evasion: 2/2 passing
- api-schema: 2/2 passing
- patch-parser: 1/1 passing
- queue-explanation: 2/2 passing
- queue-actor: 1/1 passing
- duplicate-evasion: 3/3 passing
- context-evasion: 2/2 passing
- authority-laundering: 2/2 passing
- ownership-laundering: 1/1 passing
- candidate-suppression: 1/1 passing
- gate-bypass: 3/3 passing
- evidence-laundering: 3/3 passing

## Cases

| Result | Category | Case | Expected | Actual | Score | Labels / Error | Residue |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| PASS | verification-laundering | negated-tests-pr | needs-repair | needs-repair | 78 | `needs-human-verification`, `needs-repair` | Initial probe passed as ready-for-maintainer because the raw phrase `npm test` counted as verification. |
| PASS | path-confusion | path-traversal-docs-pr | low-review-value | low-review-value | 70 | `suspicious-path`, `low-review-value` | Initial long-form probe passed as ready-for-maintainer because `docs/../src/server.mjs` looked like docs. |
| PASS | secret-evasion | aws-secret-pr | low-review-value | low-review-value | 60 | `secrets-risk`, `low-review-value` | Initial probe passed as ready-for-maintainer because only GitHub/OpenAI/private-key patterns were detected. |
| PASS | review-budget-evasion | generated-bundle-pr | needs-repair | needs-repair | 90 | `generated-artifact-review`, `needs-repair` | Initial probe passed as ready-for-maintainer because generated artifact churn was not independently checked. |
| PASS | ci-laundering | all-checks-skipped-pr | needs-repair | needs-repair | 93 | `ci-missing`, `needs-repair` | Initial probe passed as ready-for-maintainer because skipped and neutral conclusions counted as passing. |
| PASS | automation-hijack | prompt-injection-pr | low-review-value | low-review-value | 80 | `prompt-injection-risk`, `low-review-value` | Initial probe passed as ready-for-maintainer because review-bypass language was not quarantined. |
| PASS | unicode-evasion | zero-width-prompt-injection-pr | low-review-value | low-review-value | 80 | `prompt-injection-risk`, `low-review-value` | Late red-team probe passed as ready-for-maintainer because zero-width characters hid 'ignore previous instructions' from the quarantine regex. |
| PASS | api-schema | batch-non-array-items | false | not-ok | n/a | items must be an array | Initial probe returned ok=true with zero results, which could hide caller integration bugs. |
| PASS | api-schema | batch-null-item | false | not-ok | n/a | none | Initial probe threw while building the catch result because the catch path read `item.id` from null. |
| PASS | patch-parser | empty-patch-text | low-review-value | low-review-value | 0 | `needs-context`, `needs-tests`, `needs-human-verification`, `ci-missing` | Initial probe already held; kept as a canary that empty patch text remains low-review-value. |
| PASS | queue-explanation | next-action-context-reason-priority | check-duplicate-or-fixed-first | check-duplicate-or-fixed-first | n/a | Repository context label: possibly-solved. | Large-bench replay residue showed `check-duplicate-or-fixed-first` items whose reason could say `Reporter evidence label: duplicate-search-needed`, forcing maintainers to re-triage the triage. |
| PASS | queue-explanation | next-action-wait-state-reason-priority | not-actionable-yet | not-actionable-yet | n/a | Blocked or parked label: maintainer-pending-clarification. | Large-bench replay residue showed `not-actionable-yet` items whose reason could cite reporter evidence instead of the maintainer-pending state. |
| PASS | queue-actor | next-action-maintainer-owned-reporter-suppression | needs-maintainer-decision | needs-maintainer-decision | n/a | Maintainer-owned label: maintainer-authored. | Large-bench ask-reporter residue included a maintainer-authored issue that still routed to `ask-reporter-for-evidence`, misidentifying the next actor. |
| PASS | duplicate-evasion | duplicate-recurrence-followup-laundering | needs-repair | needs-repair | 56 | `needs-context`, `needs-environment`, `needs-logs`, `duplicate-search-needed` | Initial probe ignored duplicate recurrence because contextual follow-up references suppressed the open linked issue. |
| PASS | duplicate-evasion | merged-pr-replay-laundering | needs-repair | needs-repair | 82 | `possibly-solved`, `needs-repair` | Initial probe passed as ready-for-maintainer because merged local pull requests were not compared against new submissions. |
| PASS | duplicate-evasion | title-copy-open-issue-laundering | needs-repair | needs-repair | 71 | `needs-context`, `duplicate-search-needed`, `needs-technical-analysis`, `possibly-duplicate` | Initial probe passed as ready-for-maintainer because title similarity against open issues was not enforced when no explicit reference was supplied. |
| PASS | context-evasion | repo-context-error-masking | needs-repair | needs-repair | 71 | `needs-context`, `duplicate-search-needed`, `needs-technical-analysis`, `repo-context-unavailable` | Initial probe omitted `repo-context-unavailable`, letting maintainers assume duplicate and upstream checks had actually run. |
| PASS | authority-laundering | serious-scout-incomplete-search-promotion | NO_ACTION | NO_ACTION | 100 | Issue collection was incomplete or failed; partial search results cannot authorize promotion. | Initial probe returned `PROMOTE` because serious-scout discarded GitHub's `incomplete_results` signal. |
| PASS | authority-laundering | serious-scout-missing-integrity-promotion | NO_ACTION | NO_ACTION | 100 | Issue collection was incomplete or failed; partial search results cannot authorize promotion. | Independent red-team review found that omitted integrity blocks defaulted to complete and still authorized `PROMOTE`. |
| PASS | ownership-laundering | serious-scout-overlap-error-promotion | NO_ACTION | NO_ACTION | 100 | `overlap-unverified` | Initial probe returned `PROMOTE` and ignored `overlapCollectionError`, allowing unchecked ownership into the worker handoff. |
| PASS | candidate-suppression | serious-scout-agent-negation-false-negative | PROMOTE | PROMOTE | 100 | Serious candidate rows cleared the impact, evidence, and scope bar. | Initial probe blocked a serious help-wanted crash because `agent` meant generated tracker and `nobody is working on this` meant claimed work. |
| PASS | unicode-evasion | serious-scout-zero-width-claimed-work | NO_ACTION | NO_ACTION | 97 | `claimed-work` | Late red-team probe returned PROMOTE because claimed-work matching read 'sub[U+200B]mit' as a different token. |
| PASS | gate-bypass | lane-gate-order-omission | not-ready | not-ready | n/a | Not ready; 9 gate(s) still need evidence. | Initial probe returned `ready` with only `scout=pass`, silently omitting overlap, policy, repro, diff, preflight, and PR gates. |
| PASS | evidence-laundering | repro-verdict-only-laundering | blocked | blocked | n/a | `before-verdict-unsubstantiated`, `after-verdict-unsubstantiated` | Initial probe returned `pass` even though both proof points were unsubstantiated caller-written assertions. |
| PASS | context-evasion | repository-context-empty-object-laundering | unchecked | unchecked | n/a | No repository issue/PR context supplied; duplicate and upstream checks were not run. | Independent red-team review found `{}` normalized as hasContext=true and checkStatus=pass. |
| PASS | gate-bypass | lane-bare-string-pass-laundering | review | review | n/a | Needs review on 10 gate(s); next useful gate is scout. | Independent red-team review found bare string statuses classified as passed and could produce a ready lane. |
| PASS | gate-bypass | lane-structured-pass-object-laundering | review | review | n/a | Needs review on 10 gate(s); next useful gate is scout. | Independent second-pass review found the first repair blocked bare strings but still accepted `{status: 'pass'}` for every gate as ready. |
| PASS | evidence-laundering | lane-placeholder-evidence-laundering | review | review | n/a | Needs review on 10 gate(s); next useful gate is scout. | Post-repair probe still returned ready because placeholder evidence objects were counted without a concrete path. |
| PASS | evidence-laundering | lane-self-verified-laundering | review | review | n/a | Needs review on 10 gate(s); next useful gate is scout. | Post-repair probe returned ready because caller-controlled verified and timestamp fields were accepted as a substitute for an artifact. |
