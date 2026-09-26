# Claim Integrity and Falsification

PCF claim integrity asks a stricter question than "does this contribution contain evidence?"

> **Can the supplied evidence actually support the claim being made, and can the evaluator distinguish the safe pole from the unsafe pole?**

This is the evidence discipline PCF applies before a serious contribution is treated as ready for public action.

## The four-part contract

Every claim should name four things:

1. **Claim** — the narrow statement being asserted.
2. **Evidence surface** — the observable behavior that could make the claim right or wrong.
3. **Positive control** — a served/observable case that must reach PASS.
4. **Negative control** — a served/observable case that must reach FAIL.

If a contract is intentionally one-sided, it must say why and still provide a tangible executed control. "We never expect this test to pass" or "we never expect it to fail" is a contract decision, not an implicit exemption.

## Why both poles matter

Two opposite evaluator failures are dangerous:

### Verdict without a surface

An evaluator reports PASS or FAIL even though the target supplied nothing sufficient to judge.

Examples:

- an empty response is treated as "identity verified";
- a failed request is treated as "accepted";
- absence of one marker is treated as proof that a control held;
- a narrative note is treated as if a command actually ran.

PCF blocks decisive claims when the evidence surface is explicitly absent.

### Evidence exists but the verdict is unreachable

A guard can also become too strong.

A real target may supply exactly the evidence a test claims to recognize, yet a transport adapter or generic safety rule can erase the result and make PASS or FAIL unreachable.

PCF therefore treats **verdict reachability** as an integrity property:

> Where the contract permits both outcomes, at least one served positive control and one served negative control must remain capable of reaching their respective verdicts.

This is the mirror of false-positive suppression. A verifier must be able to be wrong **and** able to be right.

## Evidence authority

PCF separates evidence by source:

1. `observed`
2. `external`
3. `derived`
4. `claimed`

Higher-authority evidence wins inside the supplied record.

If caller-claimed metadata disagrees with observed evidence, claim integrity blocks instead of allowing the claim to overwrite the observation.

That matters for fields such as:

- exit code;
- HTTP/transport status;
- target commit;
- artifact digest;
- changed-file count;
- workflow result.

A target or contributor should not be able to spoof the evidence field that the evaluator itself observed.

## Root-cause chain

For high-risk, security, kernel, concurrency, memory-safety, or otherwise serious work, a crash or failing test is not enough.

PCF requires a four-step chain:

1. `symptom`
2. `reachability`
3. `invariant`
4. `patchMechanism`

In plain language:

> What happened? How does execution reach it? What rule is violated? How does the patch restore that rule?

This prevents a plausible patch from being mistaken for a demonstrated root-cause fix.

## Narrow claim vs. generalized invariant

A reproduction can confirm a narrow claim while leaving a broader invariant untested.

PCF records those separately.

A claim may say:

- the three named target shapes reproduce correctly;

while a generalized invariant may say:

- no contentless target shape can produce a verdict.

If the generalized invariant is asserted, named untested shapes block publication of that broader claim. If the broader statement is only exploratory, the untested shapes remain review warnings instead of silently inheriting the narrow result.

## Routing and ownership

Technical correctness does not answer whether the contributor owns the next action.

Claim integrity can record:

- `contributionOwner`
- `releaseOwner`
- `backportOwner`
- `catalogueEligibility`
- `intendedAction`

Examples of fail-closed routing:

- the project reserves backports for maintainers;
- release work is maintainer-owned;
- an existing maintainer-owned fix already controls the lane;
- a catalogue accepts reusable tools but the submitted artifact is only a demonstrator.

These are contribution-routing facts, not judgments about code quality.

## Freshness

Overlap, ownership, route, and upstream-state checks expire.

A duplicate search performed before days of branch repair is not automatically fresh evidence at publication time.

Claim integrity can timestamp context with:

- `checkedAt`
- `asOf`
- `maxAgeHours`
- `failOnStale`

When freshness is required, stale context fails closed until it is refreshed.

## CLI

Evaluate a claim-integrity record:

```bash
pcf claim-integrity fixtures/claim-integrity-example.json
pcf claim-integrity claim.json --format json
```

Exit codes:

- `0` — integrity PASS
- `1` — BLOCKED or REVIEW
- `2` — usage error

## Falsification packet

A contribution should be easy to challenge without reverse-engineering the author's intent.

Build a portable try-to-break-it packet:

```bash
pcf falsify falsification-input.json --format json
```

A packet can carry:

- exact repository/ref;
- package or artifact identity;
- SHA-256;
- narrow claim;
- scope boundary;
- evidence surface;
- positive and negative controls;
- known exceptions;
- exact reproduction commands;
- parser/classification rules;
- adjacent shapes worth trying;
- raw artifact paths;
- non-claims.

The packet receives its own SHA-256 over the deterministic packet core.

A falsification packet is publication-ready only when its embedded claim-integrity assessment passes.

## Repro gate composition

`pcf_repro_gate` can accept a `claimIntegrity` object.

An otherwise-green before/after run does not override a blocked claim-integrity contract.

For example:

- before fails;
- after exits 0;
- but the "after" test never exercised the affected surface.

The command pair alone must not certify the claim.

## Contribution lane

Claim integrity is a mandatory PCF lane gate between reproduction and diff shape:

```text
scout
  -> aiPosture
  -> overlap
  -> policy
  -> repro
  -> claimIntegrity
  -> diffShape
  -> preflight
  -> pr
  -> provenance
  -> calibration
```

Existing evidence can be preserved, but a lane does not become `ready` without a proof-bearing claim-integrity gate artifact.

## API and MCP

Local API:

- `POST /api/claim-integrity`
- `POST /api/falsification-packet`

MCP tools:

- `pcf_claim_integrity`
- `pcf_falsification_packet`

MCP schema resource:

- `pcf://schemas/claim-integrity`

The MCP tools remain closed-world and read-only. They evaluate supplied records only; they do not run commands, inspect arbitrary repositories, or perform GitHub writes.

## Shrink-only failure registers

The general pattern behind claim integrity is monotonic repair.

When a class of known-bad cases exists:

1. record every known offender;
2. fail CI if a new offender appears;
3. fail CI when an old entry stops reproducing until the stale entry is removed;
4. let the register shrink toward zero;
5. keep the regression controls permanently.

PCF now exposes `pcf residue-register` (and MCP `pcf_residue_register`) for this exact pattern. A run passes only when the declared and observed residue identifiers match exactly; new residue fails, and repaired/stale declarations also fail until the register is updated.

Useful registers include:

- known false-ready cases;
- known false-block cases;
- known unreachable verdict poles;
- known stale-route failures;
- known evidence-authority conflicts.

A passing test suite should not erase known residue by forgetting it exists.

## Boundary

Claim integrity does **not** prove:

- correctness;
- security;
- maintainer intent;
- mergeability;
- adoption;
- endorsement;
- authorship.

It makes a narrower promise:

> PCF will not call supplied evidence sufficient merely because it looks complete. The claim must name what can be observed, the evidence must discriminate, authority must be explicit, routing must be current, and reachable verdicts must remain reachable.
