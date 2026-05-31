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
- Current benchmark result: 40/40 passing.
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
- Current benchmark result: 41/41 passing.
- GitHub writes to `henrygd/beszel`: none.
- Public outreach: none.

Private artifact hashes:

```text
3fec6a095baf8aa8ab2f0e4075135900b22da42a2483c43dc36e1a7f6974d758
5f935b087bf993cd87b74c899de5882ed042c18b3f603541544043b64d4c7bf4
85c76e130caf2f1dcea1d61e0587548831557451daa4c203ed4924f861944cea
8f2d2bcc2d3c0e6194b61678254ebe5b0c9a62fe8c6e8e1a732a86bd064d0b6a
```

## Current Gate State

The pilot ledger should be updated whenever a real pilot changes PCF behavior.

Current expected proof state:

- benchmark: 41/41
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
