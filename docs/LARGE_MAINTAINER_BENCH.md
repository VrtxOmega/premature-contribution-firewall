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
| `ask-reporter-for-evidence` | 40 | Send back to the reporter for missing evidence. |
| `check-duplicate-or-fixed-first` | 52 | Check duplicate, solved, concurrent, linked, or upstream-fixed context first. |
| `not-actionable-yet` | 8 | Blocked, parked, stale, draft, or otherwise not actionable now. |

## Non-Ready Sub-Actions

This excludes `review-now` and shows where maintainer work goes when an item is not immediately reviewable.

| Sub-action | Count | Maintainer meaning |
| --- | ---: | --- |
| `ask-reporter-for-evidence` | 40 | Send back to the reporter for missing evidence. |
| `check-duplicate-or-fixed-first` | 52 | Check duplicate, solved, concurrent, linked, or upstream-fixed context first. |
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
| `python/cpython` | 12 | 0 review / 4 repair / 8 defer | `ask-reporter-for-evidence` 5<br>`check-duplicate-or-fixed-first` 7 | 12 | 12/12 | 0 | 0 | `40c8221ee09e843c` | `ab4be486ff93185b` |
| `rust-lang/rust` | 12 | 3 review / 6 repair / 3 defer | `review-now` 3<br>`check-duplicate-or-fixed-first` 9 | 42 | 12/12 | 0 | 0 | `80437dbf33dfe3fe` | `7927f5047330f297` |
| `golang/go` | 12 | 2 review / 3 repair / 7 defer | `review-now` 2<br>`ask-reporter-for-evidence` 4<br>`check-duplicate-or-fixed-first` 6 | 31 | 12/12 | 0 | 0 | `c66f25d30d48f627` | `b1977dab8057e9af` |
| `nodejs/node` | 12 | 0 review / 8 repair / 4 defer | `ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 4<br>`not-actionable-yet` 6 | 6 | 12/12 | 0 | 0 | `74d1ec27644d472e` | `0f87ff4699c78c12` |
| `kubernetes/kubernetes` | 12 | 1 review / 7 repair / 4 defer | `review-now` 1<br>`ask-reporter-for-evidence` 5<br>`check-duplicate-or-fixed-first` 5<br>`not-actionable-yet` 1 | 12 | 12/12 | 0 | 0 | `6b0904b0ffd14b31` | `62c2dbfe1f814756` |
| `microsoft/vscode` | 12 | 2 review / 5 repair / 5 defer | `review-now` 2<br>`ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 8 | 22 | 12/12 | 0 | 0 | `d40d40511cb92bf6` | `1b5e9f4a3b9aa1af` |
| `pytorch/pytorch` | 12 | 2 review / 10 repair / 0 defer | `review-now` 2<br>`ask-reporter-for-evidence` 7<br>`check-duplicate-or-fixed-first` 3 | 7 | 12/12 | 0 | 0 | `41f697e360240ab4` | `a2d75f01600fe1a9` |
| `tensorflow/tensorflow` | 12 | 2 review / 8 repair / 2 defer | `review-now` 2<br>`ask-reporter-for-evidence` 6<br>`check-duplicate-or-fixed-first` 3<br>`not-actionable-yet` 1 | 6 | 12/12 | 0 | 0 | `2908b0d40f3d5d7c` | `1b450a3b743b24d7` |
| `home-assistant/core` | 12 | 2 review / 4 repair / 6 defer | `review-now` 2<br>`ask-reporter-for-evidence` 7<br>`check-duplicate-or-fixed-first` 3 | 5 | 12/12 | 0 | 0 | `7631e3c01508dc1c` | `1d2b7baec0e2ac1e` |
| `systemd/systemd` | 12 | 6 review / 6 repair / 0 defer | `review-now` 6<br>`ask-reporter-for-evidence` 2<br>`check-duplicate-or-fixed-first` 4 | 6 | 12/12 | 0 | 0 | `c86f8bb6684086a1` | `3a669af5c3421b1f` |

## Capture Integrity

| Repository | Capture SHA-256 | Replay proof SHA-256 |
| --- | --- | --- |
| `python/cpython` | `40c8221ee09e843c062aa7590cd692f427af504211d13e45adede61f9036bc06` | `ab4be486ff93185b7447cd5646e9a78618a0c6488ec7a0af30a9e2a7003fd61b` |
| `rust-lang/rust` | `80437dbf33dfe3fe71899bd5177128c1e157cf017ad48035f539f8cb3cb32d8a` | `7927f5047330f2978a8dd36330aa4f4846b0b656b165c35eaa9015a8b0bb1ce9` |
| `golang/go` | `c66f25d30d48f627dad544f56390447a3873523029d969e8d10a61019ab65ac6` | `b1977dab8057e9af3ae893b462b8cd497ca9a280c311584eaf69dedce94e66b2` |
| `nodejs/node` | `74d1ec27644d472e7b462784512adadbdafbe1ca7257fc76ead6e8a5e070dc09` | `0f87ff4699c78c1253bd2d2720f4a791d7787480735c2c3e80beeda3280a7858` |
| `kubernetes/kubernetes` | `6b0904b0ffd14b3154e333e28df351398e0386381d38199ee62262fd9f8c56d8` | `62c2dbfe1f814756dfbca86048311c9347f2fa14998889ed5e3d9a964bb80cd2` |
| `microsoft/vscode` | `d40d40511cb92bf69a3a1f9f74db545799424a971a5efc3690fac67d43febf79` | `1b5e9f4a3b9aa1afa699992e42bc2d4d9cac3052126f4f332e1e3f6a476fda45` |
| `pytorch/pytorch` | `41f697e360240ab4be2ce4d24644b8d7cb200e6fd29d1a4b43b3cd5a835c8ff8` | `a2d75f01600fe1a9206b2637d742f448ec06a4942b00c0239179f1ab06ecefcd` |
| `tensorflow/tensorflow` | `2908b0d40f3d5d7cd75a11e50c7a08f7767d530651f8052e5634b39ea762cae5` | `1b450a3b743b24d7d9eeb5563681142ea7391f1504845a11bfb3df493711d92d` |
| `home-assistant/core` | `7631e3c01508dc1c1f0742912b41e5f527851fb99065fad1e3c9343846348112` | `1d2b7baec0e2ac1e022b1f7e72749e1b15081bada046af4d4ed39becff3566aa` |
| `systemd/systemd` | `c86f8bb6684086a154de75675a8b9a863f5a480db204afd6c04ae3ae17c1652a` | `3a669af5c3421b1f79ba654ebcd2d68ff6b2a9ba0166faad499fe998646555a3` |

## Calibration History Locked In

The earlier large-maintainer pass exposed that PCF was too bug-shaped for formal process issues. The permanent benchmark now includes large-maintainer cases for language proposals, Rust-style tracking issues, and RFE option wording, while repository context still keeps duplicate-adjacent or solved-adjacent items out of `review-now`.

Regression lock-in:

- `test/evaluator.test.mjs` covers large-maintainer language proposals, tracking issues, RFE option wording, and thin proposals that must still fail.
- `test/repository-context.test.mjs` covers proposal ancestry references that should not become duplicate blockers.
- `src/core/benchmark.mjs` includes large-maintainer process cases in the deterministic 69-case benchmark.

## Non-Claims

- This bench is a read-only stress test, not target maintainer endorsement.
- Raw capture files contain third-party issue/PR payloads and must remain private unless a maintainer consents.
- Hashes verify private local artifacts; they do not publish the captured payloads.
- The bench does not enable comments, labels, closures, or any other GitHub write action.
