# PCF 36-Hour Build Arc

This is a proof-of-work archive for the initial Premature Contribution Firewall build arc. It records how the project moved from a late-night maintainer-pain idea into a public v0.1.0 pilot surface.

Project notes put the build window at roughly 36 hours. The committed arc visible in git runs from `2026-05-30T07:46:21-05:00` through `2026-05-31T10:43:09-05:00`. This document treats that as evidence of the first public build window, not an independently audited time claim.

## Core Shape

The product got narrower and safer as it grew:

1. Review readiness, not AI-authorship detection.
2. A deterministic benchmark and adversarial residue corpus.
3. Real-world shadow pilots that produced evaluator fixes.
4. Replay capture so before/after claims do not depend on live queue churn.
5. Next-action lanes that say who acts next.
6. A read-only GitHub Action that writes one markdown artifact.
7. Dry-run response drafts and a maintainer export bundle.
8. A canonical dogfood sample and maintainer-facing release post.

That matters because the project did not become a write-enabled bot. It became a safer artifact generator:

Run it manually. Get one markdown queue. Inspect it. No comments, labels, closures, merges, or other GitHub writes.

## Timeline

| Time | Commit / Event | What changed |
| --- | --- | --- |
| 2026-05-30 07:46 -05:00 | `23e295d` | Initial maintainer firewall proof surface. |
| 2026-05-30 08:53 -05:00 | `5c2b52a` | Feedback calibration and pilot proof. |
| 2026-05-30 09:11 -05:00 | `e760840` | Guided GitHub App pilot setup. |
| 2026-05-30 09:43 -05:00 | `338f9fd` | Public repo pilot proof runner. |
| 2026-05-30 10:52 -05:00 | `3624590` | Feature-request issue shape learned from live queue behavior. |
| 2026-05-30 evening | `390339c` through `87132ec` | Private and public pilot calibrations across listmonk, beszel, karakeep, KeyMapper, Findroid, FreeTube, PhotoPrism, Audiobookshelf, Termux App, ESPHome, and yt-dlp. |
| 2026-05-31 06:09 -05:00 | `499f269` | Public pilot proof report. |
| 2026-05-31 06:55 -05:00 | `f1cdf33` | Large maintainer calibration bench. |
| 2026-05-31 07:07 -05:00 | `d36dd6d` | Stable replay capture for live pilots. |
| 2026-05-31 07:23 -05:00 | `eb422b7` | Repair queue split into next-action lanes. |
| 2026-05-31 07:50 -05:00 | `1a704ee` | Replay-captured large bench. |
| 2026-05-31 08:10 -05:00 | `dd35cd8` | Large-bench red-test residue. |
| 2026-05-31 08:53 -05:00 | `c5cf541` | Maintainer-owned items no longer routed back to generic reporter repair. |
| 2026-05-31 09:05 -05:00 | `0c2829d` | Next-actor model documented. |
| 2026-05-31 09:29 -05:00 | `c66a812` | Next-action lanes surfaced in working output. |
| 2026-05-31 09:53 -05:00 | `2cc011b` / `v0.1.0` | Read-only GitHub Action pilot and v0.1.0 tag. |
| 2026-05-31 10:10 -05:00 | `6ececf6` | Dry-run response templates. |
| 2026-05-31 10:23 -05:00 | `f308365` | Maintainer export bundle. |
| 2026-05-31 10:37 -05:00 | `6b19ea0` | Canonical maintainer export sample. |
| 2026-05-31 10:43 -05:00 | `0eeb24b` | Maintainer-facing release post. |

Public release: [v0.1.0 - Read-only maintainer queue pilot](https://github.com/VrtxOmega/premature-contribution-firewall/releases/tag/v0.1.0)

## Real-World Inputs

PCF was calibrated against live public GitHub queues, but the target projects were not treated as endorsements. Public outreach stayed in the PCF repository. Private pilot captures stayed private unless there was a public brief.

Public briefs:

- `make-all/tuya-local`: [PCF issue #1](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1)
- `floccusaddon/floccus`: [PCF issue #2](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2)

Private calibration pilots recorded in [PILOT_LEDGER.md](PILOT_LEDGER.md):

- `knadh/listmonk`
- `henrygd/beszel`
- `karakeep-app/karakeep`
- `keymapperorg/KeyMapper`
- `jarnedemeulemeester/findroid`
- `FreeTubeApp/FreeTube`
- `photoprism/photoprism`
- `advplyr/audiobookshelf`
- `termux/termux-app`
- `esphome/esphome`
- `yt-dlp/yt-dlp`

Large maintainer stress bench in [LARGE_MAINTAINER_BENCH.md](LARGE_MAINTAINER_BENCH.md):

- 10 public large queues
- 120 sampled issues
- 120/120 repository-context checks
- 149 context findings
- 0 collection errors
- Replay-captured split: 20 review-now, 61 repair, 39 defer
- Next-action split: 20 review-now, 39 ask-reporter-for-evidence, 52 check-duplicate-or-fixed-first, 1 needs-maintainer-decision, 8 not-actionable-yet

## Fixes From Breakage

The useful part of the build arc was not that every first guess was right. It was that wrong guesses became tests, benchmark cases, docs, or replayable evidence.

Examples:

- Device-support issues needed product identity, logs, DPS, and configuration evidence instead of only classic expected/actual bug anatomy.
- Feature requests needed use-case and requested-behavior recognition instead of bug-only logs/reproducer checks.
- Current-workflow phrasing and issue-comment references needed to count in repository context.
- Security-monitoring feature requests should not be treated as vulnerability reports.
- Maintainer-authored internal issues should not get generic contributor repair prompts.
- Complete Android/media templates should not need logs or root-cause analysis for first triage.
- `U: reproduced`, `accepted`, and similar maintainer labels can be evidence, while stale/wait labels still keep items out of review-now.
- Signed media URL query parameters should not be treated as leaked secrets.
- Context and wait-state actions must explain themselves with the right label family.

## Proof Surfaces

The public v0.1.0 adoption path now has five proof surfaces:

| Surface | Link | Purpose |
| --- | --- | --- |
| Release post | [RELEASE_POST_V0_1_0.md](RELEASE_POST_V0_1_0.md) | Shareable maintainer explanation. |
| Read-only Action | [GITHUB_ACTION.md](GITHUB_ACTION.md) | Manual no-write trial path. |
| Canonical sample | [MAINTAINER_EXPORT_SAMPLE.md](MAINTAINER_EXPORT_SAMPLE.md) | Concrete output before installing anything. |
| Pilot report | [PILOT_REPORT.md](PILOT_REPORT.md) | Real-world calibration summary. |
| Large bench | [LARGE_MAINTAINER_BENCH.md](LARGE_MAINTAINER_BENCH.md) | Replay-captured stress proof. |

Current proof gates at the end of this arc:

- `npm run ci:gates`: 147/147 tests, 69/69 benchmark, 11/11 adversarial red test, maintainer demo PASS.
- GitHub Actions `PCF Verification` run `26717018511`: success on `0eeb24b11d3fd5bf2549031650f883221ba8483f`.
- GitHub Actions `PCF Verification` run `26716892269`: success on `6b19ea0a0a95351230f5e242472c02d88c1e08de` for the canonical sample.
- GitHub release `v0.1.0`: public, not draft, not prerelease.

## Non-Claims Preserved

PCF deliberately refused to claim:

- AI-authorship detection.
- Replacement of maintainer judgment.
- Patch correctness, security, or mergeability.
- Endorsement from any target maintainer, the Linux kernel project, Linus Torvalds, or any other project.
- Hosted production security readiness.
- GitHub comments, labels, closures, merges, or other writes by default.
- Publication of raw third-party replay captures.
- Universal maintainer-preference accuracy.

## Current Adoption Path

The recommended maintainer path is:

1. Read the [v0.1.0 release post](RELEASE_POST_V0_1_0.md).
2. Inspect the [canonical export sample](MAINTAINER_EXPORT_SAMPLE.md).
3. Add the [read-only GitHub Action](GITHUB_ACTION.md) as a manual workflow.
4. Run it with `workflow_dispatch`.
5. Download `pcf-queue.md`.
6. Judge the artifact before enabling anything else.

## Feedback Question

The next useful input from maintainers is intentionally narrow:

Would this queue artifact save you time, annoy you, or need a different shape?

That answer is more valuable than another feature until the artifact has been read by maintainers outside the build loop.
