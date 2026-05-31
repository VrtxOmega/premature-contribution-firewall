# Real-World Pilot Ledger

This ledger tracks real repository shadow pilots, the evidence they produced, and the changes made from that evidence.

It is not a list of endorsements. A target repository appearing here means PCF ran a read-only pilot against public GitHub data and used the result to evaluate its own behavior.

## Rules

- Keep pilots read-only unless a maintainer explicitly opts in.
- Do not publish raw third-party pilot artifacts without maintainer consent.
- Record queue splits, defects, fixes, and verification evidence.
- Promote only reviewed misses into tests, benchmark cases, red-test cases, or replay candidates.
- Separate "PCF was wrong" from "the target project is wrong."

## Summary

| Repository | Status | Public outreach | Initial split | Final split | Main lesson |
| --- | --- | --- | --- | --- | --- |
| `make-all/tuya-local` | Public brief sent from PCF repo | [PCF #1](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1) | n/a | 5 review / 2 repair / 1 defer | Device-support reports need product, log, and DPS evidence checks, not only classic bug-report anatomy. |
| `floccusaddon/floccus` | Public brief sent from PCF repo | [PCF #2](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2) | 0 review / 9 repair / 3 defer | 4 review / 8 repair / 0 defer | Feature requests need use-case and requested-behavior checks instead of bug-only logs/reproducer checks. |
| `knadh/listmonk` | Private only | None | 6 review / 4 repair / 2 defer | 5 review / 6 repair / 1 defer | Current-workflow feature requests and issue-comment duplicate references both matter; external GitHub URLs must not be treated as local refs. |
| `henrygd/beszel` | Private only | None | 5 review / 6 repair / 1 defer | 6 review / 6 repair / 0 defer | Security/SSL monitoring feature requests must not be mistaken for vulnerability reports requiring a reproducer. |
| `karakeep-app/karakeep` | Private only | None | 2 review / 8 repair / 2 defer | 6 review / 3 repair / 3 defer | Maintainer triage labels, bug-template failure output, and AI/LLM product language need separate handling. |
| `keymapperorg/KeyMapper` | Private only | None | 0 review / 5 repair / 7 defer | 5 review / 3 repair / 4 defer | Maintainer-authored internal issues should not get contributor repair prompts unless context or safety conflicts exist. |
| `jarnedemeulemeester/findroid` | Private only | None | 2 review / 6 repair / 4 defer | 7 review / 0 repair / 5 defer | Complete Android/media bug templates need first-triage credit without requiring logs/root-cause analysis, while uncertain repros stay out of review-now. |
| `FreeTubeApp/FreeTube` | Private only | None | 1 review / 10 repair / 1 defer | 3 review / 8 repair / 1 defer | Bug-template reproduction steps may be embedded in description sections, and `U: reproduced` is maintainer validation unless repository context conflicts. |
| `photoprism/photoprism` | Private only | None | 6 review / 3 repair / 3 defer | 9 review / 1 repair / 2 defer | Project-specific bug headings, contextual follow-up references, and GitHub search pacing matter for media-heavy queues. |
| `advplyr/audiobookshelf` | Private only | None | 3 review / 7 repair / 2 defer | 6 review / 6 repair / 0 defer | Enhancement templates and "What happened?" bug templates need project-specific section recognition while duplicate context stays active. |
| `termux/termux-app` | Private only | None | 2 review / 7 repair / 3 defer | 4 review / 3 repair / 5 defer | App-only repositories need wrong-repository routing for package/dependency reports, while nested crash environment and feature sections still count as reviewable evidence. |

## tuya-local

Target: `make-all/tuya-local`

Queue shape:

- new-device support requests
- device model and product IDs
- DPS mapping evidence
- logs and config-specific symptoms
- duplicate device-support symptoms under different device IDs

What PCF got wrong:

- The evaluator was too close to classic bug-report evidence.
- Some useful device-support reports did not look like normal expected/actual/reproducer reports but still had maintainer-review material.

Fixes made:

- Added device-support evidence recognition for product identity, logs, and DPS telemetry.
- Kept repository-context failures visible instead of silently treating missing context as an empty result.
- Kept rate-limit and context collection errors in the pilot artifact.

Verification:

- Public pilot after fixes: 8 sampled issues, 5 review-now, 2 repair, 1 defer.
- Repository context checked all 8 sampled issues.
- Public outreach posted only in the PCF repo: [tuya-local new-device queue shadow pilot](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1).
- GitHub writes to `make-all/tuya-local`: none.

Private artifact hash:

```text
ed9467df0cc9fdc5a4e748eb41ded46a54cee9881a882f02b9825db662cf12fc
```

## floccus

Target: `floccusaddon/floccus`

Queue shape:

- browser-sync reports
- WebDAV/cloud/provider variance
- feature requests with template sections
- environment-specific reports that may need logs or current reproduction

What PCF got wrong:

- Complete feature requests were treated like incomplete bug reports because they did not include logs, stack traces, repro steps, or expected/actual bug sections.

Fixes made:

- Added explicit feature-request issue evidence:
  - user problem or use case
  - requested behavior or solution
  - optional alternatives, constraints, or acceptance criteria
- Kept thin feature requests blocked.
- Preserved hard-case routing for duplicate-adjacent and long-running technical issues.

Verification:

- Initial private pilot: 12 sampled issues, 0 review-now, 9 repair, 3 defer.
- Final private pilot: 12 sampled issues, 4 review-now, 8 repair, 0 defer.
- Repository context checked all 12 sampled issues in the final run.
- Public outreach posted only in the PCF repo: [floccus browser-sync queue shadow pilot](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2).
- GitHub writes to `floccusaddon/floccus`: none.

Private artifact hashes:

```text
4f7e8f9b7e235c4c80d02b0d2d6e6caf262b4847a14276024aa81828c5f2c72d
b5c5da8bf4a16ec7776c0c96f77de928fd4e8b1eef6f3caab799aa90a41e6955
8ce0781d60f6954c036e668d0367810155556839bd744117b64e749d931a97c3
```

## listmonk

Target: `knadh/listmonk`

Queue shape:

- feature/change requests
- confirmed bug reports
- possible bugs needing investigation
- operational questions
- stale but still active issues
- issue comments that link related work

Templates inspected:

- `confirmed-bug.md`
- `possible-bug--needs-investigation-.md`
- `feature-or-change-request.md`
- `general-question.md`

Initial private pilot:

- 12 sampled issues
- 6 review-now
- 4 repair
- 2 defer
- repository context checked all 12
- context unavailable: 0

What PCF got wrong:

- `#3028` used a current-workflow and expected-behavior shape: "When I use..." and "I expect..." PCF treated it as missing a feature use case.
- `#3068` had a comment pointing to `#2880`, but issue comments were not included in repository-context duplicate detection, so it stayed in review-now.
- During inspection, an external GitHub URL could be interpreted as a local issue reference. That would create false local context on cross-repository links.

Fixes made:

- Feature-request use-case detection now recognizes current workflow and expected-behavior phrasing.
- The GitHub queue collector reads issue comments for repository-context references without changing the evaluated issue body.
- Repository context accepts current issue refs supplied by collection and surfaces open linked duplicates.
- GitHub issue-reference parsing now accepts `#123`, same-repo GitHub issue/PR URLs, and relative local refs, while ignoring external GitHub repository URLs.

Final private pilot:

- 12 sampled issues
- 5 review-now
- 6 repair
- 1 defer
- repository context checked all 12
- context findings: 14
- items with context findings: 5
- context unavailable: 0

Notable final routing:

- `#3028` moved from defer to review-now after current-workflow feature evidence was recognized.
- `#3068` moved from review-now to repair because a comment linked the related open issue `#2880`.
- `#2065` remained out of review-now because context found solved-adjacent and concurrent-work signals.
- `#2544` stayed review-now after external GitHub issue URLs were no longer treated as local listmonk refs.

Verification:

- Focused tests passed for evaluator, GitHub client, and repository context.
- Benchmark corpus increased to 40 cases:
  - `feature-request-current-workflow`
  - `repo-context-comment-linked-issue`
- Benchmark result after this pilot: 40/40 passing.
- GitHub writes to `knadh/listmonk`: none.
- Public outreach: none.

Private artifact hashes:

```text
ac00754fb5803b1e7c55749993adf03f3076ac39e741714f7a5655d8a55f7127
143c597aa8f3a23b360782f491473e04b89c085d1ca3deddb3944c8fb3df2bda
996c7cd1f54c655310c37e81f844d3820c8f8febe36942832005157964a2c2d2
8953e9687d4f6e9723e3c20a3811a6aca06c9afdfaea1c21849fa5c558a24fba
```

## beszel

Target: `henrygd/beszel`

Queue shape:

- hub and agent bug reports
- Podman/container runtime behavior
- WebSocket and SSH-pull connection reports
- OIDC/authentication configuration
- infrastructure monitoring feature requests
- repository context that may point to duplicate or already-solved issues

Templates inspected:

- `bug_report.yml`
- `feature_request.yml`
- `config.yml`

Initial private pilot:

- 12 sampled issues
- 5 review-now
- 6 repair
- 1 defer
- repository context checked all 12
- context findings: 14
- items with context findings: 4
- context unavailable: 0

What PCF got wrong:

- `#2038` was a complete feature request for SSL certificate expiry monitoring and SNMP monitoring, with requirements and motivation.
- PCF treated generic security/SSL monitoring language as a vulnerability report, applied security reproducer discipline, and routed it to `do-not-review-yet`.

Fixes made:

- Security-claim detection now targets actual vulnerability/exploit/CVE/security-issue claims instead of any generic use of the word "security."
- Security or SSL monitoring feature requests can remain in the feature-request path when they provide use case and requested behavior evidence.
- Actual vulnerability reports without reproducer evidence remain blocked.

Final private pilot:

- 12 sampled issues
- 6 review-now
- 6 repair
- 0 defer
- repository context checked all 12
- context findings: 14
- items with context findings: 4
- context unavailable: 0

Notable final routing:

- `#2038` moved from do-not-review-yet to review-now.
- `#1995`, `#2041`, `#1997`, and `#2049` stayed in repair because repository context found duplicate, solved, or closed-linked issue signals.
- `#1983` and `#2040` stayed in repair because their bug reports still need clearer expected/actual or technical-analysis evidence before immediate maintainer review.

Verification:

- Focused evaluator and benchmark tests passed.
- Benchmark corpus increased to 41 cases:
  - `feature-request-security-monitoring`
- Benchmark result after this pilot: 41/41 passing.
- GitHub writes to `henrygd/beszel`: none.
- Public outreach: none.

Private artifact hashes:

```text
3fec6a095baf8aa8ab2f0e4075135900b22da42a2483c43dc36e1a7f6974d758
5f935b087bf993cd87b74c899de5882ed042c18b3f603541544043b64d4c7bf4
85c76e130caf2f1dcea1d61e0587548831557451daa4c203ed4924f861944cea
8f2d2bcc2d3c0e6194b61678254ebe5b0c9a62fe8c6e8e1a732a86bd064d0b6a
```

## karakeep

Target: `karakeep-app/karakeep`

Live metadata at pilot start:

- stars: 25,634
- forks: 1,220
- open issues: 572
- open pull requests: 64
- default branch: `main`
- last pushed: 2026-05-31T00:06:33Z

Queue shape:

- self-hosted deployment bugs
- Android/mobile bug reports
- crawler and inference failures
- feature requests with explicit template sections
- maintainer labels such as `status/approved`, `status/icebox`, and `status/pending_clarification`

Templates inspected:

- `bug_report.yml`
- `feature_request.yml`
- `question.yml`

Initial private pilot:

- 12 sampled issues
- 2 review-now
- 8 repair
- 2 defer
- repository context checked all 12
- context findings: 1
- items with context findings: 1
- context unavailable: 0

What PCF got wrong:

- `#2766` was a maintainer-approved IPv6/Docker crawler bug with root-cause analysis and a proposed fix, but PCF treated it as needing expected/actual repair.
- `#2854` used Karakeep's bug template with expected behavior plus concrete connection-failure output, but did not literally use an `Actual` section, so PCF treated it as incomplete.
- `#2612` was an approved feature request about LLM reasoning behavior. PCF confused product-domain AI/LLM language with a tool-generated report claim.
- `#838` was `status/approved` but stayed out of review-now because soft feature-evidence checks overrode maintainer triage.
- `#1828` and `#665` were `status/icebox` backlog items, but PCF sent them to repair instead of deferring them as accepted backlog.

Fixes made:

- Added maintainer-triage label awareness for common approved, backlog/icebox, and pending-clarification labels.
- Approved/accepted issues can route to review-now when no hard safety or repository-context conflict is present.
- Icebox/backlog items route to do-not-review-yet without noisy repair prompts.
- Pending-clarification items remain out of review-now.
- Bug behavior evidence now accepts expected/intended behavior plus concrete observed failure output when reproduction, logs, or root-cause evidence is present.
- AI/LLM product-domain language no longer counts as a tool-generated report unless the issue claims an AI tool found, generated, or suggested the report.

Final private pilot:

- 12 sampled issues
- 6 review-now
- 3 repair
- 3 defer
- repository context checked all 12
- context findings: 1
- items with context findings: 1
- context unavailable: 0

Notable final routing:

- `#2766`, `#2854`, `#2612`, and `#838` moved into review-now.
- `#1828` and `#665` moved from repair to do-not-review-yet as accepted backlog/icebox items.
- `#2852` and `#2567` stayed in repair because repository labels already indicate pending clarification.
- `#2845` stayed do-not-review-yet because repository context found similar open work and the project already had it in `status/icebox`.

Verification:

- Focused evaluator tests passed.
- Benchmark corpus increased to 45 cases:
  - `bug-template-expected-failure-output`
  - `maintainer-approved-issue-label`
  - `maintainer-icebox-feature-request`
  - `llm-domain-feature-request`
- Benchmark result after this pilot: 45/45 passing.
- GitHub writes to `karakeep-app/karakeep`: none.
- Public outreach: none.

Private artifact hashes:

```text
4d53574ef06643050b72d5819d43e1bbc2e0d85bb66771dc21380946d3a5032e
9ea5a3270a9620e413041a701025b8593cfb6973c00be8a125259af0cace2fc2
40e9da15ad09dcc84b544ffc3c4fa87c6c94eef9134b0a69f1957f63ba41f949
2fd39abe3ebbc2b9f0f50269674b60b6ec9963db9aa777d55170e69c956fff68
```

## KeyMapper

Target: `keymapperorg/KeyMapper`

Live metadata at pilot start:

- stars: 2,370
- forks: 248
- open issues: 188
- open pull requests: 2
- default branch: `develop`
- last pushed: 2026-05-31T00:18:16Z

Queue shape:

- Android button/input bugs
- Android TV and device-specific behavior
- expert-mode and system-bridge reports
- UX complaints
- maintainer-authored TODO issues
- duplicate and solved-adjacent historical issues

Templates inspected:

- `bug_report.yml`
- `feature_request.yml`
- `ux_issue.yml`
- `config.yml`

Initial private pilot:

- 12 sampled issues
- 0 review-now
- 5 repair
- 7 defer
- repository context checked all 12
- context findings: 10
- items with context findings: 4
- context unavailable: 0

What PCF got wrong:

- Several KeyMapper issues were opened by repository collaborators as internal work items, including `#2069`, `#2137`, `#1656`, `#2107`, and `#1418`.
- PCF treated those maintainer-authored issues like public drive-by reports and asked for contributor-style reproducer, log, environment, feature-scope, or expected/actual repairs.
- That was wrong for a maintainer queue: internal maintainer-authored work should be surfaced for maintainer attention unless there is a hard safety issue or repository-context conflict.

Fixes made:

- Added maintainer-authored issue recognition for `OWNER`, `MEMBER`, and `COLLABORATOR` author associations.
- Maintainer-authored issues can route to review-now when no hard safety issue or repository-context conflict is present.
- Soft contributor repair prompts are suppressed for maintainer-authored review-now issues.
- Repository context still wins: maintainer-authored issues with duplicate, solved, upstream, or concurrent-work conflicts stay out of review-now.

Final private pilot:

- 12 sampled issues
- 5 review-now
- 3 repair
- 4 defer
- repository context checked all 12
- context findings: 10
- items with context findings: 4
- context unavailable: 0

Notable final routing:

- `#2069`, `#2137`, `#1656`, `#2107`, and `#1418` moved into review-now as maintainer-authored/internal work items.
- `#2074` stayed in repair because repository context found similar open issues, a closed linked issue, and concurrent work.
- `#2127` stayed in repair because a closed linked issue and solved-adjacent context need verification.
- `#1306` stayed in repair because repository context found related open and closed work.
- Thin external feature requests such as `#2147`, `#2140`, and `#2139` stayed do-not-review-yet.

Verification:

- Focused evaluator tests passed.
- Benchmark corpus increased to 46 cases:
  - `maintainer-authored-internal-issue`
- Current benchmark result: 46/46 passing.
- GitHub writes to `keymapperorg/KeyMapper`: none.
- Public outreach: none.

Private artifact hashes:

```text
1a12d580e810831d9b61376c58753599604f4f710ea5ca4f6a1059c1de17a991
a5ce2402e52044a5abf2e642498b8a1d0e331eb73a03ef39949ceddccd4c2bf4
32ffd46abce013598e5147e1ebac9aa5a6d4599c06a4d9efa8f624f3c3c3fd90
3b98fe412ff64b67f0cd9d1bb6abd31b4d67484bfa14c28cdfedf73e2834bad8
```

## Findroid

Target: `jarnedemeulemeester/findroid`

Live metadata at pilot start:

- stars: 4,050
- forks: 273
- open issues: 251
- open pull requests: 32
- default branch: `main`
- last pushed: 2026-05-29T09:04:22Z

Queue shape:

- Android/Jellyfin client bug reports
- media playback and player-specific reproduction
- server-session and API behavior reports
- background download/playback requests
- duplicate feature requests and dependency automation noise

Templates inspected:

- `bug-report.yml`
- `feature_request.md`

Initial private pilot:

- 12 sampled issues
- 2 review-now
- 6 repair
- 4 defer
- repository context checked all 12
- context findings: 4
- items with context findings: 2
- context unavailable: 0

What PCF got wrong:

- `#1122` was a complete SSO feature request, but the concise title `Support SSO` was treated as too vague even though the protocol target was clear.
- `#1208`, `#1199`, and `#1200` completed Findroid's bug template with concrete steps, expected behavior, and environment/player details, but PCF held them in repair because they did not include pasted logs or a root-cause hypothesis.
- `#1215` was a performance/API behavior bug with steps and expected client behavior, but PCF treated it like it lacked enough first-triage evidence.
- `#1205` looked superficially structured but admitted the reproducer was unknown; this needed to stay out of review-now.

Fixes made:

- Added meaningful structured bug-template evidence detection for issue description, concrete reproduction steps, expected behavior, and environment fields.
- Structured bug reports can clear soft log and technical-analysis prompts for initial maintainer triage when the reproducer is concrete.
- Uncertain reproduction language such as `I don't know how to reproduce`, `not sure`, or `unknown` no longer counts as reproduction evidence merely because a `Steps to reproduce` heading exists.
- Concise protocol/auth feature titles such as `Support SSO` can pass title clarity without opening the door to generic short titles.

Final private pilot:

- 12 sampled issues
- 7 review-now
- 0 repair
- 5 defer
- repository context checked all 12
- context findings: 4
- items with context findings: 2
- context unavailable: 0

Notable final routing:

- `#1122`, `#1215`, `#1208`, `#1199`, and `#1200` moved into review-now.
- `#425` and `#197` stayed do-not-review-yet because repository context found duplicate/solved/closed or concurrent-work signals.
- `#1214` and `#1211` stayed do-not-review-yet as thin or under-scoped feature requests.
- `#1205` stayed do-not-review-yet because its reproduction steps were explicitly uncertain.

Verification:

- Focused evaluator tests passed.
- Benchmark corpus increased to 49 cases:
  - `concise-protocol-feature-request`
  - `structured-media-bug-template`
  - `structured-bug-uncertain-repro`
- Current benchmark result: 49/49 passing.
- GitHub writes to `jarnedemeulemeester/findroid`: none.
- Public outreach: none.

Private artifact hashes:

```text
c7dadd6171aaae5ee33bd8469b1131a22966a3a84e851ee4ed465e770f8bc94c
7bb464cd8a1b4888866e1b67687f11fa830208250919935d1c54ef5499119a54
7486a04314d3692a63096a85ac3ac240efca8e6c493df499234021dc020c9d51
5a979ba1343931d7023b34f64f4e3998ea93b080fe3f60aef5f20e7246b95692
```

## FreeTube

Target: `FreeTubeApp/FreeTube`

Live metadata at pilot start:

- stars: 21,085
- forks: 1,424
- open issues: 302
- open pull requests: 15
- default branch: `development`
- last pushed: 2026-05-29T22:13:41Z

Queue shape:

- YouTube SABR/content-loading failures
- Wayland/Electron desktop behavior
- feature requests with strict one-feature templates
- old but still active issues with current comments
- maintainer labels such as `U: reproduced`
- duplicate/solved/concurrent work signals around provider breakage

Templates inspected:

- `bug_report.yaml`
- `feature_request.yaml`
- `config.yml`

Initial private pilot:

- 12 sampled issues
- 1 review-now
- 10 repair
- 1 defer
- repository context checked all 12
- context findings: 18
- items with context findings: 5
- context unavailable: 0

What PCF got wrong:

- `#9187` completed FreeTube's bug template and included numbered reproduction steps, expected behavior, desktop environment, upstream Electron/Chromium links, and a workaround, but PCF missed it because the steps lived inside `Describe the bug` instead of a separate `Steps to reproduce` heading.
- `#5915` carried FreeTube's `U: reproduced` label and had corroborating current comments, but PCF treated it like an unconfirmed public report and asked for soft log/root-cause repair.
- The markdown section parser was stopping at the first blank line in a section, causing multi-paragraph issue-template fields to be under-read.

Fixes made:

- Fixed markdown section extraction so issue-template sections can span blank lines until the next heading.
- Added detection for numbered reproduction steps embedded inside a bug description section.
- Added desktop app environment headings such as FreeTube version, operating system version, installation method, and primary API to structured bug-template evidence.
- Treated `reproduced` labels as maintainer-approved triage signals while preserving repository-context conflicts.

Final private pilot:

- 12 sampled issues
- 3 review-now
- 8 repair
- 1 defer
- repository context checked all 12
- context findings: 18
- items with context findings: 5
- context unavailable: 0

Notable final routing:

- `#9187`, `#9127`, and `#5915` routed to review-now.
- `#9021`, `#7690`, `#3221`, and `#9066` stayed in repair because duplicate, solved, closed-linked, or concurrent-work context still needs a maintainer call.
- `#6206`, `#9190`, and `#9080` stayed in repair because they still need current repro/log/detail or maintainer confirmation.
- `#450` stayed do-not-review-yet as an old thin IPv6 feature request.

Verification:

- Focused evaluator tests passed.
- Benchmark corpus increased to 51 cases:
  - `combined-description-repro-steps`
  - `maintainer-reproduced-issue-label`
- Current benchmark result: 51/51 passing.
- GitHub writes to `FreeTubeApp/FreeTube`: none.
- Public outreach: none.

Private artifact hashes:

```text
b0a98108c9ff2b7976b1d35ea89abf068ba2efa0a8834fc995a1cafd6d9c0028
89ed512c91c75ba8cb1967d59135b9605c798ccb23262d82ecd90bf0e8d2ef41
b25d4a38d040679b9fdbde086dfc36e017e348dba4340c9e3796fda30570798c
fd40f3e1147399fba8e08c27d9e7250a8d2fcb3188ec404efffe3660fa31a0d2
```

## PhotoPrism

Target: `photoprism/photoprism`

Queue shape:

- media indexing issues
- hidden-file recovery and duplicate-management follow-ups
- FFmpeg 8 hardware transcoding regressions
- maintainer-authored implementation and verification tickets
- older viewer feature requests with possible duplicate context

Templates inspected:

- `bug_report.yml`
- `feature-request.yml`
- legacy `bug_report.md`
- legacy `feature-request.md`

Initial private pilot:

- 12 sampled issues
- 6 review-now
- 3 repair
- 3 defer
- repository context checked all 12
- context findings: 9
- items with context findings: 5
- context unavailable: 0

What PCF got wrong:

- `#5630` completed PhotoPrism's project-specific bug template, included FFmpeg error output, expected behavior, version/device evidence, and a workaround, but PCF missed headings such as "What is not working as documented?" and "How can we reproduce it?"
- `#5631` and `#5632` were maintainer-authored follow-up/tracking issues, but direct references to related issues could be mistaken for duplicate or solved blockers.
- `#5630` also said it was "not sure if this only occurs with Intel"; PCF treated that scope uncertainty as "unknown reproduction" even though the reproducer itself was concrete.
- A rapid rerun across the live queue triggered GitHub secondary rate-limit failures, proving repeated pilots need paced search calls rather than only a token.

Fixes made:

- Added PhotoPrism-style documented-bug headings to structured issue evidence.
- Distinguished uncertainty about reproduction steps from uncertainty about affected hardware or platform scope.
- Treated contextual follow-up/tracking references as non-blocking unless the text explicitly says duplicate, fixed by, closes, or resolves.
- Added configurable GitHub search pacing with `PCF_GITHUB_SEARCH_DELAY_MS` and documented it in the setup path.

Final private pilot:

- 12 sampled issues
- 9 review-now
- 1 repair
- 2 defer
- repository context checked all 12
- context findings: 6
- items with context findings: 3
- context unavailable: 0

Notable final routing:

- `#5630` routed to review-now after PCF recognized its project-specific bug template and hardware-scope uncertainty correctly.
- `#5631` and `#5632` routed to review-now as maintainer-authored follow-up/tracking work instead of duplicate blockers.
- `#5615` stayed in repair because closed/solved linked context still needs a maintainer call.
- `#4718` and `#352` stayed do-not-review-yet because 360 media viewer requests remain duplicate-adjacent and thin on current use case.

Verification:

- Focused evaluator, repository-context, GitHub-client, setup-guide, and benchmark tests passed.
- Benchmark corpus increased to 53 cases:
  - `project-specific-bug-template-headings`
  - `contextual-follow-up-reference`
- Current benchmark result: 53/53 passing.
- GitHub writes to `photoprism/photoprism`: none.
- Public outreach: none.

Private artifact hashes:

```text
b3213fb646ee935ac11af1c36345df6ac0bb2b0f0eb8c0f24362d77a75362457
385ab6a4df81a9f9d45794e244128f764d481b3abf3125cecd32137d24eb2e42
88d4d636e8aebed06b28ca22baf4e6296b193b9d2e09443e4f4815be3a6b43b2
cbe38104b842e819c952b46288e7058b8d243df8746d4d4b4c53f92eff35559c
```

## Audiobookshelf

Target: `advplyr/audiobookshelf`

Queue shape:

- enhancement-heavy server/API/media-library requests
- audiobook and podcast metadata edge cases
- API payload and mobile-client efficiency proposals
- bug reports with structured "What happened?" and "What did you expect to happen?" headings
- duplicate-adjacent endpoint, metadata, and redirect reports

Templates inspected:

- `bug.yaml`
- `feature.yml`
- `config.yml`

Initial private pilot:

- 12 sampled issues
- 3 review-now
- 7 repair
- 2 defer
- repository context checked all 12
- context findings: 13
- items with context findings: 6
- context unavailable: 0

What PCF got wrong:

- `#5271` completed Audiobookshelf's enhancement template with requested backup-location behavior, user value, screenshot/context, current version, and current implementation, but PCF still asked for feature solution and scope.
- `#5273` completed the same enhancement template for ASIN metadata embedding, including implementation notes, but PCF treated "no screenshot appropriate" as missing feature detail.
- `#5048` completed the bug template with "What happened?", "What did you expect to happen?", reproduction steps, version/install/OS/browser fields, and logs, but PCF did not recognize those headings as complete bug evidence.

Fixes made:

- Added structured feature-template section recognition for `Describe the Feature/Enhancement`, `Why would this be helpful?`, `Future Implementation`, and `Current Implementation`.
- Added bug-template recognition for `What happened?`, `What did you expect to happen?`, and `Steps to reproduce the issue`.
- Added Audiobookshelf environment fields such as server version, install method, server OS, and browser field.
- Kept duplicate/solved repository-context blockers active for otherwise complete reports.

Final private pilot:

- 12 sampled issues
- 6 review-now
- 6 repair
- 0 defer
- repository context checked all 12
- context findings: 13
- items with context findings: 6
- context unavailable: 0

Notable final routing:

- `#5048`, `#5271`, and `#5273` moved to review-now after PCF learned the project template sections.
- `#5275`, `#5277`, `#5129`, and `#5230` stayed in repair because similar open issue context still needs a maintainer call.
- `#5251` and `#5261` stayed in repair because closed/solved context is relevant.

Verification:

- Focused evaluator and benchmark tests passed.
- Benchmark corpus increased to 55 cases:
  - `project-specific-feature-template-sections`
  - `project-specific-bug-what-happened-headings`
- Current benchmark result: 55/55 passing.
- GitHub writes to `advplyr/audiobookshelf`: none.
- Public outreach: none.

Private artifact hashes:

```text
a6113e2d97bc09779a5a5cf8aada8d79892058a332efef7bcdf22d16fb736aff
b3b272f005b970460780d3dd2f66dcbf3968bd1297449a1e734d8f7127cd5e8f
1bd6e957161935c7fea52a9bc092ef2240bec5826d25a4c62679786effd710bc
96aed30043e188baa0b1f6ec7cebe9b641bd1f84926c0a551500e46019dcb950
```

## Termux App

Target: `termux/termux-app`

Queue shape:

- Android terminal emulator bug reports
- terminal UI and keyboard/extra-keys feature requests
- crash reports with generated Termux app/device diagnostics
- package install or dependency build failures that the project template routes to `termux/termux-packages`
- old feature requests mixed with very recent app-specific issues

Templates inspected:

- `01-bug-report.yml`
- `02-feature-request.yml`
- `config.yml`

Initial private pilot:

- 12 sampled issues
- 2 review-now
- 7 repair
- 3 defer
- repository context checked all 12
- context findings: 2
- items with context findings: 1
- context unavailable: 0

What PCF got wrong:

- `#5130` was a package install/dependency build failure in an app-only repository whose issue template explicitly routes package issues elsewhere, but PCF treated the complete bug-template fields as enough for review-now.
- `#5119` was a complete crash report with reproduction steps, expected behavior, stack trace, app version, and device diagnostics, but PCF missed nested generated environment sections under Termux's crash-report output.
- `#5133` used a `[Feature]` title plus `Feature description` and `Additional information` sections, but PCF treated it like an underspecified bug report.

Fixes made:

- Added `wrong-repository` routing for Termux app package/dependency install reports without app-scope signals.
- Added Termux feature-title and feature-section recognition for `Feature description` and `Additional information`.
- Added crash-environment key recognition for generated app/device diagnostics such as `APP_NAME`, `PACKAGE_NAME`, `VERSION_NAME`, `SDK_INT`, `OS_VERSION`, and `MODEL`.
- Added a GitHub label template for `wrong-repository`.

Final private pilot:

- 12 sampled issues
- 4 review-now
- 3 repair
- 5 defer
- repository context checked all 12
- context findings: 2
- items with context findings: 1
- context unavailable: 0

Notable final routing:

- `#5130` moved from review-now to do-not-review-yet as `wrong-repository`.
- `#5126` stayed do-not-review-yet with both wrong-repository and closed/solved linked context.
- `#5119` moved to review-now after generated nested crash diagnostics counted as environment evidence.
- `#5133` moved to review-now after Termux-style feature evidence was recognized.
- `#5137`, `#107`, and `#5139` stayed in repair because title clarity, requested behavior, or expected/actual evidence still needs contributor repair.

Verification:

- Focused evaluator and benchmark tests passed.
- Benchmark corpus increased to 58 cases:
  - `package-install-wrong-repository`
  - `project-specific-crash-report-headings`
  - `project-specific-feature-title-sections`
- Current benchmark result: 58/58 passing.
- GitHub writes to `termux/termux-app`: none.
- Public outreach: none.

Private artifact hashes:

```text
50fcc93971d56ca2e99472a00d2801c6035b0c4f697c927f58d3dc65f8366452
2f086a1a8c8c61d7ab187ef79e51a386b30419b82ec55ead4e0671bed7a4cc3c
09e1c929262d3065c3b84ee5c994f7d58426c6cadb0ac186c469807a48216e84
0072402874f53b287276b36769658d356746e2d1d103ee80c6aceb6601f118eb
```

## Current Gate State

The pilot ledger should be updated whenever a real pilot changes PCF behavior.

Current expected proof state:

- benchmark: 58/58
- adversarial red test: 8/8
- maintainer demo: PASS
- GitHub write posture: dry-run/read-only unless explicitly enabled by the repository owner

## Next Pilot Rule

Do not approach another maintainer just because a pilot is clean.

Approach only when there is a useful story:

- PCF got something wrong on that repository's public queue.
- The miss was fixed narrowly.
- The fix is locked into tests, benchmark cases, red-test residue, or replay candidates.
- The public brief includes non-claims and does not write to the target repository.
