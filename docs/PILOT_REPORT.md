# Real-World Pilot Report

Generated from the current PCF pilot ledger on May 31, 2026.

This report summarizes the evidence PCF earned from read-only pilots against public GitHub queues. It is a maintainer proof report, not a marketing claim and not an endorsement list.

## Executive Result

PCF has been tested against 23 public repository queues:

- 2 public outreach briefs posted from the PCF repository.
- 21 private read-only shadow pilots.
- 272 sampled public issues total.
- 0 writes to target repositories.
- 0 claims of target maintainer endorsement.

Across the 12 pilots with comparable before/after baselines, PCF changed the sampled queue from:

| Queue bucket | Before | After | Movement |
| --- | ---: | ---: | ---: |
| Review now | 28 | 63 | +35 |
| Send repair request | 75 | 57 | -18 |
| Do not review yet | 41 | 24 | -17 |

The after-only `make-all/tuya-local` pilot added another 8 sampled issues with a final split of 5 review / 2 repair / 1 defer.

The large-maintainer bench added 10 private read-only pilots and 120 final sampled issues. Its initial-to-final aggregate moved from 17 review / 61 repair / 42 defer to 22 review / 60 repair / 38 defer, with repository context checked on all 120 final items and 0 collection errors.

The queue now preserves that top-level split while adding `nextAction` buckets for non-ready work. This prevents `send-repair-request` from hiding different maintainer moves such as reporter evidence requests, duplicate/fixed checks, subsystem or process routing, maintainer judgment calls, and externally blocked items.

The useful signal is not that every final queue is "right." The useful signal is that live queues exposed wrong assumptions, the assumptions were fixed narrowly, and the fixes were locked into reproducible tests and benchmark cases.

## Current Proof State

| Surface | Current result | What it proves |
| --- | ---: | --- |
| Unit and integration tests | 132/132 | Core evaluator, GitHub queue, API, feedback, setup, and context behavior stay green together. |
| Maintainer benchmark | 69/69 | The permanent corpus captures the real breakage classes discovered so far. |
| Adversarial red test | 8/8 | Known bad inputs still fail closed. |
| Maintainer demo | PASS | The repo can produce the public proof bundle in one repeatable command. |
| GitHub Actions | PASS | The same gates run remotely on pushes and pull requests. |

Run the proof gate locally:

```bash
npm run ci:gates
```

## What Broke And Got Better

| Live queue pressure | Repository evidence | PCF correction |
| --- | --- | --- |
| Device-support reports did not look like classic bug reports. | `make-all/tuya-local` | Added product, log, and DPS evidence checks. |
| Feature requests were treated as broken bug reports. | `floccusaddon/floccus`, `knadh/listmonk`, `advplyr/audiobookshelf` | Added use-case, current-workflow, requested-behavior, and enhancement-template recognition. |
| Comment-linked duplicates were invisible. | `knadh/listmonk` | Added issue-comment reference collection for repository context. |
| Security-monitoring features were mistaken for vulnerability reports. | `henrygd/beszel` | Split monitoring/SSL feature requests from unsupported security escalation. |
| Maintainer labels and maintainer-authored issues were over-prompted. | `karakeep-app/karakeep`, `keymapperorg/KeyMapper` | Added accepted/reproduced/backlog/pending/maintainer-authored triage handling. |
| Structured app bug templates were under-credited. | `jarnedemeulemeester/findroid`, `FreeTubeApp/FreeTube`, `photoprism/photoprism` | Added project-specific section recognition for media and app issue templates. |
| App-only repos received package/dependency reports. | `termux/termux-app` | Added wrong-repository routing for package/dependency reports. |
| Firmware reports used YAML/log evidence instead of classic expected/actual fields. | `esphome/esphome` | Added config/log bug evidence, numeric version recognition, root-cause crash evidence, placeholder-secret tolerance, and stale-label handling. |
| High-volume CLI reports used strict verbose-output templates and known-issues links. | `yt-dlp/yt-dlp` | Added checked known-issues search recognition, complete verbose CLI evidence, question-template routing, contextual issue-link handling, output-format feature recognition, and signed media URL token tolerance. |
| Large maintainer process issues were treated like ordinary bug reports. | `rust-lang/rust`, `golang/go`, `systemd/systemd`, `python/cpython` | Added proposal, tracking issue, RFE, feature-gate, FCP, stabilization, and proposal-ancestry reference handling. |

## Pilot Table

| Repository | Public status | Before | After | Main lesson |
| --- | --- | ---: | ---: | --- |
| `make-all/tuya-local` | Public brief | n/a | 5 review / 2 repair / 1 defer | Device support needs product/log/DPS evidence checks. |
| `floccusaddon/floccus` | Public brief | 0 review / 9 repair / 3 defer | 4 review / 8 repair / 0 defer | Feature requests need use-case and requested-behavior checks. |
| `knadh/listmonk` | Private | 6 review / 4 repair / 2 defer | 5 review / 6 repair / 1 defer | Current-workflow requests and comment-linked duplicate context matter. |
| `henrygd/beszel` | Private | 5 review / 6 repair / 1 defer | 6 review / 6 repair / 0 defer | Security-monitoring features are not vulnerability reports. |
| `karakeep-app/karakeep` | Private | 2 review / 8 repair / 2 defer | 6 review / 3 repair / 3 defer | Maintainer labels, template failure output, and AI/LLM domain language need separate handling. |
| `keymapperorg/KeyMapper` | Private | 0 review / 5 repair / 7 defer | 5 review / 3 repair / 4 defer | Maintainer-authored issues should not get contributor repair prompts without a real conflict. |
| `jarnedemeulemeester/findroid` | Private | 2 review / 6 repair / 4 defer | 7 review / 0 repair / 5 defer | Complete Android/media templates should not require root-cause logs for first triage. |
| `FreeTubeApp/FreeTube` | Private | 1 review / 10 repair / 1 defer | 3 review / 8 repair / 1 defer | Repro steps can live inside description sections; reproduced labels matter. |
| `photoprism/photoprism` | Private | 6 review / 3 repair / 3 defer | 9 review / 1 repair / 2 defer | Project-specific headings and contextual follow-ups matter. |
| `advplyr/audiobookshelf` | Private | 3 review / 7 repair / 2 defer | 6 review / 6 repair / 0 defer | Enhancement and "What happened?" sections need template-aware evidence. |
| `termux/termux-app` | Private | 2 review / 7 repair / 3 defer | 4 review / 3 repair / 5 defer | Wrong-repository routing must coexist with valid crash and feature evidence. |
| `esphome/esphome` | Private | 1 review / 4 repair / 7 defer | 4 review / 6 repair / 2 defer | YAML/log firmware reports need template-aware evidence. |
| `yt-dlp/yt-dlp` | Private | 0 review / 6 repair / 6 defer | 4 review / 7 repair / 1 defer | Verbose CLI output, question templates, known-issues links, and signed URL tokens need special handling. |
| Large maintainer bench | Private | 17 review / 61 repair / 42 defer | 22 review / 60 repair / 38 defer | Proposal, tracking issue, RFE, and process artifacts need non-bug evidence rules. See `docs/LARGE_MAINTAINER_BENCH.md`. |

## Reproducible Commands

Run the permanent proof surface:

```bash
npm run ci:gates
```

Run a dry-run public queue pilot against a repository:

```bash
npm run setup:pilot -- --repository owner/repo
GH_TOKEN="<public-read token>" PCF_COLLECT_REPOSITORY_CONTEXT=true npm run pilot:public -- --repository owner/repo --limit 12 --no-pulls
GH_TOKEN="<public-read token>" PCF_COLLECT_REPOSITORY_CONTEXT=true npm run pilot:public -- --repository owner/repo --limit 12 --no-pulls --capture /tmp/pcf-owner-repo-capture.json
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --write /tmp/pcf-owner-repo-replay.md
```

Use the capture/replay pair before evaluator changes when a pilot exposes a suspected miss. The capture is the normalized queue payload PCF evaluated; replaying it with `--fixture` keeps before/after comparisons stable even if the live GitHub queue changes. Captures contain third-party issue/PR bodies and repository-context results, so they are private artifacts.

Generate the public proof artifacts:

```bash
npm run benchmark:write
npm run redtest:write
npm run demo:maintainer:write
```

## Boundaries

PCF does not claim:

- AI-authorship detection.
- Universal maintainer preference.
- Target maintainer endorsement.
- Correctness, mergeability, security approval, or release readiness.
- Safe GitHub writes without an explicit project opt-in and a reviewed dry-run period.

The private pilot artifacts stay private unless a target maintainer opts in. Public documentation records queue splits, fixes, hashes, and lessons, not raw third-party issue bodies.

## Reading The Result

The report should be read as evidence that PCF can learn from maintainer-shaped queues:

1. A real queue exposes a wrong assumption.
2. The wrong assumption is inspected against original public issue context.
3. The evaluator is changed narrowly.
4. The fix is locked into tests and benchmark cases.
5. The pilot ledger records the before/after split and non-claims.

That loop is the product. The queue score is only useful because the loop keeps it honest.
