# Premature Contribution Firewall Maintainer Demo

Generated: 2026-07-11T04:45:24.639Z

Verdict: **PASS**

## Claims This Demo Proves

- 77/77 deterministic benchmark cases pass.
- 29/29 adversarial red-test cases pass.
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
| Benchmark | PASS | 77/77 | Deterministic fixture corpus |
| Adversarial red test | PASS | 29/29 | Breakage residue corpus |
| Maintainer queue | PASS | 3 items | 3 context findings |
| Feedback calibration | PASS | 2 match(es) | 1 candidate fixture(s) |
| Feedback candidate replay | PASS | 1/1 | Promoted fixture draft |
| Replay comparison | PASS | stable | 0 regressions |

## Maintainer Queue Snapshot

Repository: VrtxOmega/premature-contribution-firewall-demo

Ready: 1; needs repair: 1; low review value: 1; review budget: 36 minutes.

Repair sub-actions: ask-reporter-for-evidence 1, check-duplicate-or-fixed-first 1.

Feedback calibration matches: 2; review-needed conflicts: 0.

| Status | Kind | Item | Title | Action | Next Action | Context | Budget |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| ready-for-maintainer | pull_request | #12 | webhook: reject oversized payload bodies | review-now | review-now | 0 | 12 |
| needs-repair | pull_request | #13 | webhook: include labels in dry-run response | send-repair-request | check-duplicate-or-fixed-first | 3 | 16 |
| low-review-value | issue | #14 | Bug | do-not-review-yet | ask-reporter-for-evidence | 0 | 8 |

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
| zero-width-prompt-injection-pr | unicode-evasion | PASS | Late red-team probe passed as ready-for-maintainer because zero-width characters hid 'ignore previous instructions' from the quarantine regex. |
| batch-non-array-items | api-schema | PASS | Initial probe returned ok=true with zero results, which could hide caller integration bugs. |
| batch-null-item | api-schema | PASS | Initial probe threw while building the catch result because the catch path read `item.id` from null. |
| empty-patch-text | patch-parser | PASS | Initial probe already held; kept as a canary that empty patch text remains low-review-value. |
| next-action-context-reason-priority | queue-explanation | PASS | Large-bench replay residue showed `check-duplicate-or-fixed-first` items whose reason could say `Reporter evidence label: duplicate-search-needed`, forcing maintainers to re-triage the triage. |
| next-action-wait-state-reason-priority | queue-explanation | PASS | Large-bench replay residue showed `not-actionable-yet` items whose reason could cite reporter evidence instead of the maintainer-pending state. |
| next-action-maintainer-owned-reporter-suppression | queue-actor | PASS | Large-bench ask-reporter residue included a maintainer-authored issue that still routed to `ask-reporter-for-evidence`, misidentifying the next actor. |
| duplicate-recurrence-followup-laundering | duplicate-evasion | PASS | Initial probe ignored duplicate recurrence because contextual follow-up references suppressed the open linked issue. |
| merged-pr-replay-laundering | duplicate-evasion | PASS | Initial probe passed as ready-for-maintainer because merged local pull requests were not compared against new submissions. |
| title-copy-open-issue-laundering | duplicate-evasion | PASS | Initial probe passed as ready-for-maintainer because title similarity against open issues was not enforced when no explicit reference was supplied. |
| repo-context-error-masking | context-evasion | PASS | Initial probe omitted `repo-context-unavailable`, letting maintainers assume duplicate and upstream checks had actually run. |
| serious-scout-incomplete-search-promotion | authority-laundering | PASS | Initial probe returned `PROMOTE` because serious-scout discarded GitHub's `incomplete_results` signal. |
| serious-scout-missing-integrity-promotion | authority-laundering | PASS | Independent red-team review found that omitted integrity blocks defaulted to complete and still authorized `PROMOTE`. |
| serious-scout-overlap-error-promotion | ownership-laundering | PASS | Initial probe returned `PROMOTE` and ignored `overlapCollectionError`, allowing unchecked ownership into the worker handoff. |
| serious-scout-agent-negation-false-negative | candidate-suppression | PASS | Initial probe blocked a serious help-wanted crash because `agent` meant generated tracker and `nobody is working on this` meant claimed work. |
| serious-scout-zero-width-claimed-work | unicode-evasion | PASS | Late red-team probe returned PROMOTE because claimed-work matching read 'sub[U+200B]mit' as a different token. |
| lane-gate-order-omission | gate-bypass | PASS | Initial probe returned `ready` with only `scout=pass`, silently omitting overlap, policy, repro, diff, preflight, and PR gates. |
| repro-verdict-only-laundering | evidence-laundering | PASS | Initial probe returned `pass` even though both proof points were unsubstantiated caller-written assertions. |
| repository-context-empty-object-laundering | context-evasion | PASS | Independent red-team review found `{}` normalized as hasContext=true and checkStatus=pass. |
| lane-bare-string-pass-laundering | gate-bypass | PASS | Independent red-team review found bare string statuses classified as passed and could produce a ready lane. |
| lane-structured-pass-object-laundering | gate-bypass | PASS | Independent second-pass review found the first repair blocked bare strings but still accepted `{status: 'pass'}` for every gate as ready. |
| lane-placeholder-evidence-laundering | evidence-laundering | PASS | Post-repair probe still returned ready because placeholder evidence objects were counted without a concrete path. |
| lane-self-verified-laundering | evidence-laundering | PASS | Post-repair probe returned ready because caller-controlled verified and timestamp fields were accepted as a substitute for an artifact. |

## Release Note

This output is safe to paste into a README or release note as reproducible local evidence. It should be paired with the benchmark and red-test result artifacts, API documentation, and the release checklist before a public pilot.
