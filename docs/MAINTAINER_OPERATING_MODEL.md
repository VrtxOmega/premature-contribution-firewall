# Maintainer Operating Model

Premature Contribution Firewall is designed for maintainers who are already carrying a public queue, not for contributors who want a softer landing page. The core question is whether an inbound issue, pull request, patch, or patch series is ready to consume scarce human review time.

## Audience

PCF is aimed at projects with one or more of these conditions:

- public issue and pull request queues that outpace maintainer review time
- repeated low-evidence reports, drive-by patches, or broad refactors
- policy requirements that contributors routinely skip
- duplicate issues and concurrent PRs that are expensive to discover manually
- maintainers who need dry-run confidence before labels, comments, or workflow automation write to GitHub

## Review Budget Model

The firewall treats maintainer attention as the scarce resource. It does not reward length, politeness, or tool-generated polish by itself. It rewards signals that reduce review cost:

- a specific problem statement
- reproducible steps or failure evidence
- narrow scope and a clear touched surface
- tests, logs, screenshots, or benchmark proof
- linked issues, fixes, or upstream context
- repository-policy compliance
- maintainer routing and ownership evidence
- transparent tool provenance when generated content or automation shaped the change

## Default Maintainer Flow

1. Run PCF in dry-run mode against open issues and pull requests.
2. Review the sorted queue by status, `nextAction`, labels, context findings, and review-budget cost.
3. Use `nextAction` to distinguish reporter evidence requests from duplicate/fixed checks, subsystem or process routing, maintainer decisions, and blocked/not-actionable waits.
4. Send repair checklists back to contributors only when the next action is reporter-directed.
5. Promote good feedback into candidate fixtures when PCF is too harsh, too lenient, or misses repository context.
6. Use the feedback calibration profile to see when new queue items resemble prior maintainer corrections.
7. Replay the candidate corpus before changing benchmark expectations.
8. Enable write actions only after dry-run output matches project policy and maintainer judgment.

## What PCF Should Block

- broad patches without a bounded problem
- issues without reproduction or concrete failure evidence
- PRs that claim tests while only skipping or negating verification
- patches that churn generated or vendored files without source changes or rationale
- contributions that ignore required templates, DCO/sign-off, ownership, or routing
- duplicates, linked-issue-closed work, concurrent work, and upstream-fixed reports that would waste reviewer time
- prompt-injection or review-bypass language aimed at automation

## What PCF Should Not Claim

- It is not an AI-authorship detector.
- It is not a substitute for maintainer judgment.
- It does not certify correctness, safety, mergeability, or project endorsement.
- It does not claim Linux kernel endorsement or any maintainer's personal approval.
- It should not write labels or comments until a project has verified dry-run behavior.

## Kernel-Grade Profile

The `kernel-grade` profile is for projects that want stricter email-patch discipline: concise subsystem subjects, human DCO sign-off, `Fixes:` and stable-tree care, maintainer/list routing, build and runtime test evidence, patch-series hygiene, and transparent tool provenance.

That profile is inspired by public Linux kernel contribution documentation. It is a discipline target, not an endorsement claim.

## Publication Standard

A serious maintainer should be able to clone the repo and answer four questions quickly:

- What does this tool refuse to claim?
- What evidence does it require before spending maintainer time?
- Can I reproduce the benchmark and adversarial gates locally?
- Will it stay read-only until I deliberately enable writes?

The README, CI workflow, benchmark corpus, adversarial corpus, replay capture rules, `nextAction` queue output, feedback calibration, feedback replay, and release checklist exist to make those answers inspectable.
