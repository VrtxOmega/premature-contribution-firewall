# Large Maintainer Bench

Generated from read-only GitHub pilots on 2026-05-31.

This bench stress-tests PCF against large public maintainer queues. It is not an outreach list, endorsement list, or claim that these projects want PCF. The point is to find where PCF is wrong under large-project intake pressure, replay the same captured input offline, and publish only aggregate maintainer-action evidence.

## Boundary

- No comments, labels, reactions, closures, or writes were made to target repositories.
- Raw replay captures contain third-party issue or PR payloads and are not committed.
- Published hashes identify private local captures without disclosing their contents.
- `torvalds/linux` remains a poor GitHub issue pilot target because Linux-kernel-style work belongs to PCF's `kernel-grade` patch path, not a fake GitHub issue queue.
- `systemd/systemd` remains the Linux-adjacent GitHub queue for this bench.

## Capture And Replay Method

Each target was sampled with `--limit 12`, issues only (`--no-pulls`), repository context collection enabled, and GitHub search pacing from `PCF_GITHUB_SEARCH_DELAY_MS`.

The live pass wrote normalized replay payloads under a private capture directory. The published numbers below come from replaying those captures offline, which keeps the comparison stable even if the live GitHub queues change later.

```bash
export GH_TOKEN="<public-read token>"
export PCF_COLLECT_REPOSITORY_CONTEXT=true
export PCF_GITHUB_SEARCH_DELAY_MS=2500
npm run pilot:large -- --capture-dir /tmp/pcf-large-bench --write docs/LARGE_MAINTAINER_BENCH.md --format markdown
npm run pilot:large -- --from-captures --capture-dir /tmp/pcf-large-bench --format markdown --write /tmp/pcf-large-bench-replay.md
```

Private capture directory used for this run:

```text
/tmp/pcf-large-bench-2026-05-31-nextactions
```

## Replay-Captured Result

Targets: 10
Total sampled items: 120
Estimated review budget: 960 minutes

| Queue bucket | Count |
| --- | ---: |
| `review-now` | 20 |
| `send-repair-request` | 61 |
| `do-not-review-yet` | 39 |

## Next Action Distribution

This is the maintainer-useful split inside and beyond the old repair bucket.

| Next action | Count | Maintainer meaning |
| --- | ---: | --- |
| `review-now` | 20 | Ready for maintainer attention. |
| `ask-reporter-for-evidence` | 39 | Send back to the reporter for missing evidence. |
| `check-duplicate-or-fixed-first` | 52 | Check duplicate, solved, concurrent, linked, or upstream-fixed context first. |
| `needs-maintainer-decision` | 1 | Maintainer judgment is required; PCF cannot reduce the next move further. |
| `not-actionable-yet` | 8 | Blocked, parked, stale, draft, or otherwise not actionable now. |

## Non-Ready Sub-Actions

This excludes `review-now` and shows where maintainer work goes when an item is not immediately reviewable.

| Sub-action | Count | Maintainer meaning |
| --- | ---: | --- |
| `ask-reporter-for-evidence` | 39 | Send back to the reporter for missing evidence. |
| `check-duplicate-or-fixed-first` | 52 | Check duplicate, solved, concurrent, linked, or upstream-fixed context first. |
| `needs-maintainer-decision` | 1 | Maintainer judgment is required; PCF cannot reduce the next move further. |
| `not-actionable-yet` | 8 | Blocked, parked, stale, draft, or otherwise not actionable now. |

## Context Intelligence

Repository context findings: 149
Items with context findings: 52
Context checked: 120/120
Context cleared: 68
Context unavailable: 0
Collection errors: 0

| Context label | Count |
| --- | ---: |
| `concurrent-work` | 10 |
| `linked-issue-closed` | 28 |
| `possibly-duplicate` | 21 |
| `possibly-solved` | 34 |

## Repository Replay Table

| Repository | Items | Coarse split | Next actions | Context findings | Context checked | Unavailable | Errors | Capture hash | Replay proof hash |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `python/cpython` | 12 | 0 review / 4 repair / 8 defer | `ask-reporter-for-evidence` 4<br>`check-duplicate-or-fixed-first` 7<br>`needs-maintainer-decision` 1 | 12 | 12/12 | 0 | 0 | `40c8221ee09e843c` | `3ac3814d8b4640e6` |
| `rust-lang/rust` | 12 | 3 review / 6 repair / 3 defer | `review-now` 3<br>`check-duplicate-or-fixed-first` 9 | 42 | 12/12 | 0 | 0 | `80437dbf33dfe3fe` | `4321e40eb5a179c3` |
| `golang/go` | 12 | 2 review / 3 repair / 7 defer | `review-now` 2<br>`ask-reporter-for-evidence` 4<br>`check-duplicate-or-fixed-first` 6 | 31 | 12/12 | 0 | 0 | `c66f25d30d48f627` | `6e3f5de72178c942` |
| `nodejs/node` | 12 | 0 review / 8 repair / 4 defer | `ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 4<br>`not-actionable-yet` 6 | 6 | 12/12 | 0 | 0 | `74d1ec27644d472e` | `3801e3db64be57b5` |
| `kubernetes/kubernetes` | 12 | 1 review / 7 repair / 4 defer | `review-now` 1<br>`ask-reporter-for-evidence` 5<br>`check-duplicate-or-fixed-first` 5<br>`not-actionable-yet` 1 | 12 | 12/12 | 0 | 0 | `6b0904b0ffd14b31` | `0fc77b1f48438263` |
| `microsoft/vscode` | 12 | 2 review / 5 repair / 5 defer | `review-now` 2<br>`ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 8 | 22 | 12/12 | 0 | 0 | `d40d40511cb92bf6` | `e3aefa8a470690e8` |
| `pytorch/pytorch` | 12 | 2 review / 10 repair / 0 defer | `review-now` 2<br>`ask-reporter-for-evidence` 7<br>`check-duplicate-or-fixed-first` 3 | 7 | 12/12 | 0 | 0 | `41f697e360240ab4` | `c7a012e88047036c` |
| `tensorflow/tensorflow` | 12 | 2 review / 8 repair / 2 defer | `review-now` 2<br>`ask-reporter-for-evidence` 6<br>`check-duplicate-or-fixed-first` 3<br>`not-actionable-yet` 1 | 6 | 12/12 | 0 | 0 | `2908b0d40f3d5d7c` | `52dd011560fbcff6` |
| `home-assistant/core` | 12 | 2 review / 4 repair / 6 defer | `review-now` 2<br>`ask-reporter-for-evidence` 7<br>`check-duplicate-or-fixed-first` 3 | 5 | 12/12 | 0 | 0 | `7631e3c01508dc1c` | `b22bb651d4337e71` |
| `systemd/systemd` | 12 | 6 review / 6 repair / 0 defer | `review-now` 6<br>`ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 4 | 6 | 12/12 | 0 | 0 | `c86f8bb6684086a1` | `8615a14ea443ed22` |

## Capture Integrity

| Repository | Capture SHA-256 | Replay proof SHA-256 |
| --- | --- | --- |
| `python/cpython` | `40c8221ee09e843c062aa7590cd692f427af504211d13e45adede61f9036bc06` | `3ac3814d8b4640e6b096da1cfeb40f763c20889479b1f7fb3c2d9ae36d9c7883` |
| `rust-lang/rust` | `80437dbf33dfe3fe71899bd5177128c1e157cf017ad48035f539f8cb3cb32d8a` | `4321e40eb5a179c3a55877841d743520e466ddc9a18ac3939b0a7f64fa8e45e8` |
| `golang/go` | `c66f25d30d48f627dad544f56390447a3873523029d969e8d10a61019ab65ac6` | `6e3f5de72178c942995402ea40f4d8ba9211c79c50d30a19941906b39d03a507` |
| `nodejs/node` | `74d1ec27644d472e7b462784512adadbdafbe1ca7257fc76ead6e8a5e070dc09` | `3801e3db64be57b5a9297c86c071b787fe990a4c133f9780162369673e77e02b` |
| `kubernetes/kubernetes` | `6b0904b0ffd14b3154e333e28df351398e0386381d38199ee62262fd9f8c56d8` | `0fc77b1f48438263ef669c8f896f38b8ce5d494f5b986621b62be917d850759c` |
| `microsoft/vscode` | `d40d40511cb92bf69a3a1f9f74db545799424a971a5efc3690fac67d43febf79` | `e3aefa8a470690e86640539577111fe59a534ae492441f76597e1c8e451ac889` |
| `pytorch/pytorch` | `41f697e360240ab4be2ce4d24644b8d7cb200e6fd29d1a4b43b3cd5a835c8ff8` | `c7a012e88047036cbc0372f5d5636c40f8ca03db13c332bb8519ed99bcaf9c37` |
| `tensorflow/tensorflow` | `2908b0d40f3d5d7cd75a11e50c7a08f7767d530651f8052e5634b39ea762cae5` | `52dd011560fbcff6fdd844dea5cedd4c395dd42c16e715c3aa1fccbc87707f2a` |
| `home-assistant/core` | `7631e3c01508dc1c1f0742912b41e5f527851fb99065fad1e3c9343846348112` | `b22bb651d4337e718f44b6e68fb894ecd2a47d7d29fbed79afa95375c4a96edd` |
| `systemd/systemd` | `c86f8bb6684086a154de75675a8b9a863f5a480db204afd6c04ae3ae17c1652a` | `8615a14ea443ed228c8113801c87a2767548adc57d4f2f29889c1bfc48f762e0` |

## Calibration History Locked In

The earlier large-maintainer pass exposed that PCF was too bug-shaped for formal process issues. The permanent benchmark now includes large-maintainer cases for language proposals, Rust-style tracking issues, and RFE option wording, while repository context still keeps duplicate-adjacent or solved-adjacent items out of `review-now`.

Regression lock-in:

- `test/evaluator.test.mjs` covers large-maintainer language proposals, tracking issues, RFE option wording, and thin proposals that must still fail.
- `test/repository-context.test.mjs` covers proposal ancestry references that should not become duplicate blockers.
- `src/core/benchmark.mjs` includes large-maintainer process cases in the deterministic 69-case benchmark.

## Replay Residue Mined

This replay contained 39 reporter-evidence requests, 52 duplicate/fixed/context checks, 1 maintainer-decision item, and 8 not-actionable wait-state items. Those buckets were mined for red-test leads without committing raw issue bodies.

The first useful residue was a queue-explanation failure mode: mixed labels could select the right `nextAction` while explaining it with the wrong label family. The ask-reporter bucket then exposed queue-actor confusion: maintainer-owned items must not be routed back to a generic reporter. Those now have synthetic adversarial coverage:

- `next-action-context-reason-priority`: context actions must explain themselves with repository-context labels, not reporter-evidence labels.
- `next-action-wait-state-reason-priority`: wait-state actions must explain themselves with blocked/parked labels, not reporter-evidence labels.
- `next-action-maintainer-owned-reporter-suppression`: maintainer-owned items must not be sent back to a generic reporter when maintainer judgment is the next action.

## Non-Claims

- This bench is a read-only stress test, not target maintainer endorsement.
- Raw capture files contain third-party issue/PR payloads and must remain private unless a maintainer consents.
- Hashes verify private local artifacts; they do not publish the captured payloads.
- The bench does not enable comments, labels, closures, or any other GitHub write action.
