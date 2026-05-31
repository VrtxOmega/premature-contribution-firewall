# Large Maintainer Bench

Generated from read-only GitHub pilots on May 31, 2026.

This bench stress-tests PCF against large public maintainer queues. It is not an outreach list, endorsement list, or claim that these projects want PCF. The point is to find where PCF is wrong under large-project intake pressure, fix only the proven misses, and preserve the result in reproducible tests.

## Boundary

- No comments, labels, reactions, closures, or writes were made to target repositories.
- Raw private pilot artifacts remain under `/tmp` and are not committed.
- `torvalds/linux` was inspected as a GitHub surface and has 0 GitHub issues and 0 GitHub pull requests. Linux-kernel-style work belongs to PCF's `kernel-grade` patch path, not a fake GitHub issue pilot.
- `systemd/systemd` was used as the Linux-adjacent GitHub queue for this bench.

## Targets

| Repository | Snapshot pressure | Template surface inspected |
| --- | --- | --- |
| `python/cpython` | 7,194 open issues, 2,115 open PRs | bug, crash, documentation, feature |
| `rust-lang/rust` | 11,303 open issues, 1,152 open PRs | bug, ICE, regression, diagnostics, tracking |
| `golang/go` | 9,662 open issues, 473 open PRs | bug, gopls, pkgsite, proposal, language change, vuln |
| `nodejs/node` | 1,566 open issues, 909 open PRs | bug, feature, docs, flaky test |
| `kubernetes/kubernetes` | 1,793 open issues, 928 open PRs | bug, enhancement, failing test, flaking test |
| `microsoft/vscode` | 16,139 open issues, 2,091 open PRs | bug, Copilot bug, feature |
| `pytorch/pytorch` | 15,559 open issues, 2,799 open PRs | bug, CI, docs, feature, PT2, release feature |
| `tensorflow/tensorflow` | 1,030 open issues, 1,953 open PRs | TensorFlow issue, TFLite converter, TFLite op, Play Services |
| `home-assistant/core` | 3,241 open issues, 833 open PRs | bug, task |
| `systemd/systemd` | 2,800 open issues, 490 open PRs | bug, feature request |

The snapshot counts came from the GitHub API during the May 31, 2026 bench run. They are expected to drift.

## Result

Each target was sampled with `--limit 12 --no-pulls`, repository context collection enabled, and paced GitHub search. The final run checked context for all 120 sampled issues and produced zero collection errors.

Aggregate split:

| Queue bucket | Initial | Final | Movement |
| --- | ---: | ---: | ---: |
| Review now | 17 | 22 | +5 |
| Send repair request | 61 | 60 | -1 |
| Do not review yet | 42 | 38 | -4 |
| Repository context findings | 129 | 133 | +4 |
| Context checked | 120/120 | 120/120 | stable |
| Context unavailable | 0 | 0 | stable |
| Collection errors | 0 | 0 | stable |

Because these are live queues, exact item order can change between runs. Item-level movement below is reported only for issue numbers present in both the initial and final sample for a repository.

When replay captures are available, large benches should report `nextAction` distribution alongside the coarse review/repair/defer split. The coarse split shows review priority; `nextAction` shows whether the remaining work should go to the reporter, a duplicate/fixed check, subsystem/process routing, a maintainer decision, or a blocked/not-actionable wait state.

Future large benches should use replay capture before evaluator changes:

```bash
GH_TOKEN="<public-read token>" \
PCF_COLLECT_REPOSITORY_CONTEXT=true \
PCF_GITHUB_SEARCH_DELAY_MS=2500 \
npm run pilot:public -- --repository rust-lang/rust --limit 12 --no-pulls --capture /tmp/pcf-rust-large-capture.json

npm run pilot:public:markdown -- --fixture /tmp/pcf-rust-large-capture.json --write /tmp/pcf-rust-large-replay.md
```

The capture file is the private normalized input set. It should not be committed or shared without maintainer consent.

## Pilot Table

| Repository | Initial split | Final split | Context findings | Context checked | Final errors | Final JSON hash |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `python/cpython` | 0 review / 2 repair / 10 defer | 0 review / 3 repair / 9 defer | 10 -> 10 | 12/12 | 0 | `dfee5cfb7d3d97f74ad129f5a3c3771107069d1c1854db9397d664344ce37a5a` |
| `rust-lang/rust` | 2 review / 5 repair / 5 defer | 4 review / 5 repair / 3 defer | 40 -> 38 | 12/12 | 0 | `380f46a41f2995f64a16b0a4409286f3aaffbb79606029e5ba98c61ed95aa17a` |
| `golang/go` | 1 review / 3 repair / 8 defer | 2 review / 3 repair / 7 defer | 21 -> 20 | 12/12 | 0 | `3751568a64a49294ef089b6f035f6751f66fbb7b6494a247929b3dee947a03a5` |
| `nodejs/node` | 0 review / 8 repair / 4 defer | 0 review / 8 repair / 4 defer | 6 -> 6 | 12/12 | 0 | `f55c5091cdeccfcd52d37af77e9467d80ab011b0a1bfe010ff43ab9d0c8e88a6` |
| `kubernetes/kubernetes` | 0 review / 7 repair / 5 defer | 1 review / 7 repair / 4 defer | 12 -> 12 | 12/12 | 0 | `f63095397db898b9d36795c77fc97ecf4fce7a85fcca1b024b4e4fd6bdf77906` |
| `microsoft/vscode` | 2 review / 5 repair / 5 defer | 2 review / 5 repair / 5 defer | 15 -> 15 | 12/12 | 0 | `23283f277f25d7f7c6ca903edcc0c0f1a7fa2ba78a9428dbae146db20fdc43ba` |
| `pytorch/pytorch` | 2 review / 10 repair / 0 defer | 2 review / 10 repair / 0 defer | 7 -> 7 | 12/12 | 0 | `6f4dfc3f5e16e9e29e2bb96ed2da771ce06895cda0e4cfafbfb47bef897bf889` |
| `tensorflow/tensorflow` | 2 review / 8 repair / 2 defer | 2 review / 8 repair / 2 defer | 6 -> 6 | 12/12 | 0 | `bc4e3b9f8b8e64dc41a00b1213258c7e3f8844aadc36a3cd52585b9483cc2c86` |
| `home-assistant/core` | 3 review / 6 repair / 3 defer | 3 review / 5 repair / 4 defer | 6 -> 13 | 12/12 | 0 | `02b35a0227d39fa961255682be29c778888a731edd4d909b134e1333e29df9b1` |
| `systemd/systemd` | 5 review / 7 repair / 0 defer | 6 review / 6 repair / 0 defer | 6 -> 6 | 12/12 | 0 | `e80f78f1a4e19004b8cd14d092b26a522ec16ed4dfac2f2fa0674f898d083599` |

## What Broke

Large language and platform repos exposed a real evaluator miss: PCF was still too bug-shaped for formal maintainer process issues.

The initial run treated several proposals, tracking issues, and RFEs as if they needed minimal reproducer, environment, logs, or classic expected/actual bug evidence. That is wrong for large projects where `Proposal`, `LanguageChange`, `C-tracking-issue`, `RFE`, and feature-gate threads are explicit process artifacts.

Concrete examples:

| Repository | Issue | Initial routing | Final routing | What changed |
| --- | --- | --- | --- | --- |
| `rust-lang/rust` | `#152080` Tracking Issue for `uint_carryless_mul` | repair | review-now | API, feature-gate, steps/history, FCP, stabilization, and unresolved questions now count as process evidence. |
| `golang/go` | `#57644` proposal: spec: sum types based on general interfaces | repair | review-now | Proposal language, examples, benefits/costs, and implementation notes now count as proposal evidence. |
| `systemd/systemd` | `#42395` sysinstall: Add option to keep home partition | repair | review-now | RFE wording such as "would be great if" and "provided an option" now counts as requested behavior. |
| `python/cpython` | `#150646` Decide on fate of missing C23 math.h functions | defer | repair | Feature/proposal shape is recognized, but repository context still keeps it out of review-now until related work is checked. |
| `golang/go` | `#47487` proposal: spec: allow explicit conversion from function to 1-method interface | defer | repair | Proposal shape is recognized, but context still asks for related-work review before maintainer attention. |
| `rust-lang/rust` | `#157180` Tracking issue for MCP 976 | defer | repair | Tracking shape is recognized, but context still shows active related pressure. |

## Fix Locked In

Code changes:

- Added formal proposal, RFE, language-change, tracking-issue, feature-gate, FCP, and stabilization intent recognition in `src/core/evaluator.mjs`.
- Added proposal/tracking evidence checks for use case, proposed behavior, public API, implementation notes, history, unresolved questions, and stabilization process.
- Added requested-behavior recognition for "would be great if", "provided an option", and "option to" RFE wording.
- Added contextual repository-reference handling for proposal ancestry phrases such as "version of", "updated for", and "variants such as" in `src/core/repository-context.mjs`.

Regression lock-in:

- `test/evaluator.test.mjs` now covers large-maintainer language proposals, Rust-style tracking issues, RFE option wording, and a thin proposal that must still fail.
- `test/repository-context.test.mjs` now covers proposal ancestry references that should not become duplicate blockers.
- `src/core/benchmark.mjs` now has 69 benchmark cases, including three large-maintainer process cases.

## Reproduce

Run a large pilot:

```bash
GH_TOKEN="<public-read token>" \
PCF_COLLECT_REPOSITORY_CONTEXT=true \
PCF_GITHUB_SEARCH_DELAY_MS=2500 \
npm run pilot:public -- --repository rust-lang/rust --limit 12 --no-pulls --format markdown --write /tmp/pcf-rust-large-pilot.md
```

Run the proof gate:

```bash
npm run ci:gates
```

## Non-Claims

- This bench does not claim target maintainer endorsement.
- This bench does not claim PCF is correct on every sampled item.
- This bench does not claim Linux kernel maintainers use GitHub issues.
- This bench does not enable GitHub writes.
- The artifact hashes verify private local outputs, not published target-maintainer briefs.
