# Premature Contribution Firewall Benchmark Results

This is a deterministic local benchmark corpus for maintainer-review readiness. It is not an AI-authorship detector and it does not claim real-world precision over private maintainer decisions.

## Summary

- Version: 2026.06.10
- Cases: 77/77 passing
- Runtime: measured by the runner and returned in JSON as `durationMs`; it varies by machine

## Categories

- standard-pr: 9/9 passing
- tool-use: 2/2 passing
- issue: 37/37 passing
- repo-context: 13/13 passing
- repo-policy: 3/3 passing
- kernel-grade: 7/7 passing
- patch-series: 4/4 passing
- review-budget: 2/2 passing

## Cases

| Result | Category | Case | Expected | Actual | Score | Labels |
| --- | --- | --- | --- | --- | ---: | --- |
| PASS | standard-pr | standard-ready-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | standard-pr | standard-secret-broad-pr | low-review-value | low-review-value | 0 | `needs-clear-summary`, `needs-context`, `too-broad`, `needs-tests` |
| PASS | standard-pr | docs-only-ready-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | standard-pr | dependency-unexplained-pr | needs-repair | needs-repair | 92 | `dependency-review`, `needs-repair` |
| PASS | standard-pr | dependency-justified-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | standard-pr | draft-pr | needs-repair | needs-repair | 90 | `draft-pr`, `needs-repair` |
| PASS | standard-pr | ci-failed-pr | needs-repair | needs-repair | 82 | `ci-failed`, `needs-repair` |
| PASS | standard-pr | ci-missing-pr | needs-repair | needs-repair | 93 | `ci-missing`, `needs-repair` |
| PASS | standard-pr | mega-diff-pr | low-review-value | low-review-value | 76 | `too-broad`, `low-review-value` |
| PASS | tool-use | ai-assisted-verified-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | tool-use | ai-tool-only-pr | low-review-value | low-review-value | 27 | `needs-context`, `needs-tests`, `needs-human-verification`, `ci-missing` |
| PASS | issue | ready-issue | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | device-support-issue | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | feature-request-ready | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | feature-request-current-workflow | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | feature-request-security-monitoring | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | bug-template-expected-failure-output | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | concise-protocol-feature-request | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | structured-media-bug-template | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | structured-bug-uncertain-repro | low-review-value | low-review-value | 54 | `needs-clear-summary`, `needs-reproducer`, `needs-logs`, `needs-technical-analysis` |
| PASS | issue | combined-description-repro-steps | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | maintainer-reproduced-issue-label | ready-for-maintainer | ready-for-maintainer | 80 | `maintainer-approved`, `ready-for-maintainer` |
| PASS | issue | project-specific-bug-template-headings | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | repo-context | contextual-follow-up-reference | ready-for-maintainer | ready-for-maintainer | 53 | `maintainer-authored`, `ready-for-maintainer` |
| PASS | issue | project-specific-feature-template-sections | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | project-specific-bug-what-happened-headings | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | package-install-wrong-repository | low-review-value | low-review-value | 65 | `wrong-repository`, `low-review-value` |
| PASS | issue | project-specific-crash-report-headings | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | project-specific-feature-title-sections | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | project-specific-yaml-log-bug-template | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | numeric-version-root-cause-crash | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | placeholder-secret-references-not-leaks | needs-repair | needs-repair | 95 | `needs-technical-analysis`, `needs-repair` |
| PASS | issue | stale-label-prevents-review-now | needs-repair | needs-repair | 95 | `needs-technical-analysis`, `maintainer-pending-clarification`, `needs-repair` |
| PASS | issue | verbose-cli-bug-template | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | question-template-signed-url-token | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | output-format-feature-solution | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | large-maintainer-language-proposal | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | large-maintainer-tracking-issue | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | large-maintainer-rfe-option | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | contextual-known-issues-refs | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | maintainer-approved-issue-label | ready-for-maintainer | ready-for-maintainer | 94 | `maintainer-approved`, `ready-for-maintainer` |
| PASS | issue | maintainer-authored-internal-issue | ready-for-maintainer | ready-for-maintainer | 48 | `maintainer-authored`, `ready-for-maintainer` |
| PASS | issue | maintainer-icebox-feature-request | low-review-value | low-review-value | 77 | `maintainer-backlog`, `low-review-value` |
| PASS | issue | llm-domain-feature-request | ready-for-maintainer | ready-for-maintainer | 100 | `maintainer-approved`, `ready-for-maintainer` |
| PASS | issue | feature-request-thin | low-review-value | low-review-value | 45 | `needs-clear-summary`, `needs-context`, `needs-use-case`, `duplicate-search-needed` |
| PASS | issue | unready-issue | low-review-value | low-review-value | 0 | `needs-clear-summary`, `needs-context`, `needs-reproducer`, `needs-expected-actual` |
| PASS | issue | security-no-reproducer-issue | low-review-value | low-review-value | 8 | `needs-context`, `needs-reproducer`, `needs-expected-actual`, `needs-environment` |
| PASS | issue | security-reproducer-issue | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | issue-missing-duplicate-search | needs-repair | needs-repair | 89 | `duplicate-search-needed`, `needs-technical-analysis`, `needs-repair` |
| PASS | repo-policy | policy-ready-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | repo-policy | policy-unready-pr | low-review-value | low-review-value | 0 | `needs-clear-summary`, `needs-context`, `needs-tests`, `needs-human-verification` |
| PASS | repo-policy | policy-codeowners-route | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | repo-context | repo-context-similar-open-issue | needs-repair | needs-repair | 90 | `possibly-duplicate`, `needs-repair` |
| PASS | repo-context | repo-context-comment-linked-issue | needs-repair | needs-repair | 84 | `duplicate-search-needed`, `possibly-duplicate`, `needs-repair` |
| PASS | repo-context | repo-context-concurrent-pr | needs-repair | needs-repair | 90 | `concurrent-work`, `needs-repair` |
| PASS | repo-context | repo-context-upstream-fixed | needs-repair | needs-repair | 82 | `possibly-upstream-fixed`, `needs-repair` |
| PASS | repo-context | repo-context-linked-closed-explicit-duplicate | needs-repair | needs-repair | 62 | `needs-context`, `needs-logs`, `needs-technical-analysis`, `possibly-solved` |
| PASS | repo-context | repo-context-title-similarity-closed | needs-repair | needs-repair | 77 | `needs-technical-analysis`, `possibly-solved`, `needs-repair` |
| PASS | repo-context | repo-context-upstream-release-fix | needs-repair | needs-repair | 76 | `duplicate-search-needed`, `possibly-upstream-fixed`, `needs-repair` |
| PASS | repo-context | repo-context-merged-local-pr | needs-repair | needs-repair | 82 | `possibly-solved`, `needs-repair` |
| PASS | repo-context | repo-context-draft-concurrent-pr | needs-repair | needs-repair | 90 | `concurrent-work`, `needs-repair` |
| PASS | repo-context | repo-context-collection-failed | needs-repair | needs-repair | 71 | `needs-context`, `duplicate-search-needed`, `needs-technical-analysis`, `repo-context-unavailable` |
| PASS | repo-context | repo-context-duplicate-recurrence-followup | needs-repair | needs-repair | 56 | `needs-context`, `needs-environment`, `needs-logs`, `duplicate-search-needed` |
| PASS | repo-context | repo-context-explicit-duplicate-open | low-review-value | low-review-value | 30 | `needs-context`, `needs-reproducer`, `needs-expected-actual`, `needs-logs` |
| PASS | kernel-grade | kernel-ready-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | kernel-grade | kernel-missing-signoff | low-review-value | low-review-value | 56 | `needs-clear-summary`, `kernel-subject-discipline`, `needs-dco-signoff`, `low-review-value` |
| PASS | kernel-grade | kernel-missing-fixes | needs-repair | needs-repair | 91 | `needs-fixes-tag`, `needs-repair` |
| PASS | kernel-grade | kernel-stable-too-large | low-review-value | low-review-value | 56 | `too-broad`, `stable-discipline-failed`, `needs-series-split`, `review-budget-high` |
| PASS | kernel-grade | kernel-tool-provenance-good | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | kernel-grade | kernel-tool-provenance-bad | low-review-value | low-review-value | 38 | `needs-clear-summary`, `kernel-subject-discipline`, `needs-dco-signoff`, `needs-tool-provenance` |
| PASS | kernel-grade | kernel-policy-maintainer-route | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | patch-series | patch-ready-single | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | patch-series | patch-unready-single | low-review-value | low-review-value | 0 | `needs-context`, `needs-tests`, `needs-human-verification`, `ci-missing` |
| PASS | patch-series | patch-two-part-series | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | patch-series | patch-secret-leak | low-review-value | low-review-value | 60 | `secrets-risk`, `low-review-value` |
| PASS | review-budget | first-timer-drive-by | needs-repair | needs-repair | 84 | `too-broad`, `maintainer-attention-risk`, `needs-repair` |
| PASS | review-budget | review-budget-excessive | low-review-value | low-review-value | 43 | `too-broad`, `maintainer-attention-risk`, `needs-series-split`, `review-budget-high` |
