# Premature Contribution Firewall Benchmark Results

This is a deterministic local benchmark corpus for maintainer-review readiness. It is not an AI-authorship detector and it does not claim real-world precision over private maintainer decisions.

## Summary

- Version: 2026.05.30
- Cases: 35/35 passing
- Runtime: measured by the runner and returned in JSON as `durationMs`; it varies by machine

## Categories

- standard-pr: 9/9 passing
- tool-use: 2/2 passing
- issue: 5/5 passing
- repo-policy: 3/3 passing
- repo-context: 3/3 passing
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
| PASS | issue | unready-issue | low-review-value | low-review-value | 0 | `needs-clear-summary`, `needs-context`, `needs-reproducer`, `needs-expected-actual` |
| PASS | issue | security-no-reproducer-issue | low-review-value | low-review-value | 8 | `needs-context`, `needs-reproducer`, `needs-expected-actual`, `needs-environment` |
| PASS | issue | security-reproducer-issue | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | issue | issue-missing-duplicate-search | needs-repair | needs-repair | 89 | `duplicate-search-needed`, `needs-technical-analysis`, `needs-repair` |
| PASS | repo-policy | policy-ready-pr | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | repo-policy | policy-unready-pr | low-review-value | low-review-value | 0 | `needs-clear-summary`, `needs-context`, `needs-tests`, `needs-human-verification` |
| PASS | repo-policy | policy-codeowners-route | ready-for-maintainer | ready-for-maintainer | 100 | `ready-for-maintainer` |
| PASS | repo-context | repo-context-similar-open-issue | needs-repair | needs-repair | 90 | `possibly-duplicate`, `needs-repair` |
| PASS | repo-context | repo-context-concurrent-pr | needs-repair | needs-repair | 90 | `concurrent-work`, `needs-repair` |
| PASS | repo-context | repo-context-upstream-fixed | needs-repair | needs-repair | 82 | `possibly-upstream-fixed`, `needs-repair` |
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
