# Real-World Calibration

Premature Contribution Firewall should improve by preserving concrete breakage, not by making broader claims.

The rule is:

1. Run a read-only shadow pilot.
2. Find where the evaluator is wrong against real queue shape.
3. Explain the wrong assumption in plain language.
4. Make the smallest evaluator or policy fix that covers that shape.
5. Add or update tests, benchmark cases, or red-test residue so the same miss cannot quietly return.
6. Publish only the evidence that can be reproduced, with non-claims attached.

This is human-reviewed calibration. PCF does not automatically learn from maintainer queues, infer maintainer intent, or claim universal precision.

## What Live Pilots Add

The synthetic benchmark is necessary because it is deterministic and CI-friendly. It is not enough by itself. Real repositories expose queue shapes that are easy to miss when every fixture was invented inside the project.

Live pilots are useful when they surface one of these failures:

- a valid issue shape is being judged with the wrong checklist
- repository context finds a likely duplicate, solved issue, upstream fix, or concurrent item
- a long-running issue should stay out of the daily operational queue
- a report is too thin even though it uses the right template
- a dry-run artifact hides missing context or collection errors

The output of a pilot is not a claim that PCF knows better than the project maintainer. It is a candidate evidence package.

## Pilot Pattern

Every real-world calibration pass should answer four questions:

| Question | Required evidence |
| --- | --- |
| What did the evaluator get wrong? | Source issue or PR shape, current PCF status, and why that status was not useful. |
| What assumption caused the miss? | A short sentence about the evidence shape, not a claim about author motive. |
| What changed? | A narrow code, policy, test, or benchmark change. |
| How is it locked in? | Passing tests, benchmark case ids, red-test residue, or replayable feedback candidates. |

If a pilot does not expose a specific miss, keep it private. Do not publish a clean run as proof of precision.

## tuya-local: Device-Support Evidence

The `make-all/tuya-local` pilot stressed a device-support queue, not a conventional application bug queue.

The useful issue shape was different:

- product IDs and device model names
- DPS mappings
- diagnostic logs
- config/environment details
- symptoms that may duplicate existing device support work

The miss: PCF was too close to a classic bug-report checklist. Some device-support reports had review material, but not in the form of a normal reproducer plus expected/actual sections.

The fix: device-support reports can now earn review readiness from concrete product, log, and DPS evidence. The queue still stays conservative when evidence is thin or repository context suggests the work may already be solved.

Published outreach: [tuya-local new-device queue shadow pilot](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1)

## floccus: Feature-Request Evidence

The `floccusaddon/floccus` pilot stressed browser-sync reports, environmental variance, and feature requests.

The first dry run got an important part of the queue wrong. It treated complete feature requests like incomplete bug reports because they did not include logs, repro steps, or expected/actual bug behavior.

That assumption was wrong for floccus. Its feature-request shape asks for:

- the feature or use case
- the requested solution
- alternatives considered

After adding explicit feature-request evidence checks, the queue moved from:

| Run | Review now | Ask for repair / clarification | Defer for now |
| --- | ---: | ---: | ---: |
| Initial dry run | 0 | 9 | 3 |
| After feature-request fix | 4 | 8 | 0 |

The important part is not the bigger `review-now` number by itself. The important part is that the change came from a concrete wrong assumption, was fixed narrowly, and was locked into the benchmark corpus with feature-request cases.

Published outreach: [floccus browser-sync queue shadow pilot](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2)

## Hard-Case Routing

Calibration should not turn every plausible issue into `review-now`.

Two floccus examples show the intended conservative behavior:

- [floccus #2251](https://github.com/floccusaddon/floccus/issues/2251) had repository-context findings that looked possibly solved or duplicate-adjacent. Routing it to repair/clarification asks for version and current-repro confirmation before the maintainer spends fresh triage time.
- [floccus #886](https://github.com/floccusaddon/floccus/issues/886) is a long-running technical issue. It may be valid, but it should not crowd the immediate operational queue without current status and reproduction evidence.

That is the standard: PCF should surface useful work quickly, but it should keep stale, duplicate-adjacent, solved-adjacent, or high-context issues out of the immediate review lane until the missing evidence is supplied.

## Non-Claims

Real-world calibration does not mean:

- PCF detects AI authorship
- PCF knows maintainer intent
- PCF has universal triage precision
- a target project endorses the result
- a clean pilot proves production readiness
- a live pilot artifact should be committed without maintainer consent

The claim is narrower: when PCF is wrong on a real queue, the failure can become a small, reviewable, reproducible improvement.

## Promotion Standard

A live-pilot lesson can become part of the durable corpus only when it has:

- a named failure mode
- source evidence from the original item shape
- a narrow expected behavior
- a fixture, benchmark case, red-test case, or replay candidate
- a passing gate that proves the new expectation
- a public-facing explanation that avoids endorsement and precision claims

Anything less stays as private pilot residue until it is ready.
