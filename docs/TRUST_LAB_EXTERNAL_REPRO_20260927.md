# Trust Lab External Reproduction Lessons — 2026-09-27

This note records engineering lessons transferred into PCF from a separate public verification loop in `VrtxOmega/veritas-agent-trust-lab`.

It is **not** an endorsement, adoption signal, independent validation of PCF, or a new direct-merge contribution outcome.

## External report

[tolegm / AstraNL report #81](https://github.com/VrtxOmega/veritas-agent-trust-lab/issues/81) implemented Track 1 of the Trust Lab external-verification challenge separately from the frozen JavaScript reference.

The project-side replay subsequently confirmed, against the pinned submission revision, that:

- all **12 complete result objects** matched the frozen reference;
- all five regenerated result files were byte-identical to the submitted files;
- every packet digest/count remained equal;
- the six clean controls and six hostile cases retained their expected dispositions;
- `execution_authorized` remained boolean `false`.

The submission disclosed Claude assistance and same-model-family correlation with an earlier report. Trust Lab therefore kept its campaign counts unchanged rather than relabeling the result as independent model-family validation.

## Adjacent failures the fixed fixtures did not cover

The same report deliberately separated the fixed twelve-case result from rule-level behavior outside those fixtures.

Two useful classes emerged:

1. **Freshness can fail open before staleness is even measured.**
   - missing, unparseable, or future-dated heartbeat values could satisfy the old comparison accidentally;
   - an invalid clock/bound is not fresh evidence.

2. **Normalized declarations are still declarations.**
   - delimiter and cosmetic case/whitespace differences could inflate the simulated evaluator-group count;
   - normalization can prevent accidental double-counting, but it cannot authenticate evaluator identity or actual independence.

Trust Lab merged bounded repairs in [PR #84](https://github.com/VrtxOmega/veritas-agent-trust-lab/pull/84) while leaving authenticated independence explicitly unresolved in [#83](https://github.com/VrtxOmega/veritas-agent-trust-lab/issues/83).

## PCF gates strengthened from the exchange

PCF applies the same lessons generically:

### Freshness

When freshness is required:

- `checkedAt` must exist;
- `asOf` must exist so age can actually be measured;
- both times must parse;
- `checkedAt` cannot be in the future relative to `asOf`;
- a caller-supplied `maxAgeHours` must be finite and non-negative;
- stale evidence still follows the declared fail/warn policy.

PCF no longer silently substitutes a default age bound when the caller supplied an invalid one.

### Independence

PCF can now record an `independence` contract with:

- `requiredGroups`;
- `supportedGroups`;
- `basis` (`declared`, `observed`, `external`, `mixed`, or `unknown`);
- tangible provenance evidence.

If independent verification is required, declared labels alone cannot satisfy the gate. The supported grouping needs tangible non-claimed evidence and enough supported groups.

This still does not make PCF an identity verifier. It prevents a supplied record from laundering self-description into an independence claim.

### Frozen targets

Falsification packets distinguish a convenient ref from immutable target identity.

- source-only repository targets need an immutable 40-hex commit SHA;
- exact release artifacts can instead be frozen by digest;
- an artifact-pinned packet without a source commit remains usable but carries a source-level warning.

A moving `main` branch is not treated as historical proof of what was tested.

## Boundary

These controls make supplied evidence harder to overstate. They do not prove that:

- an external actor is independent merely because its provenance record says so;
- a timestamp is cryptographically signed;
- a repository ref or digest exists unless separately checked;
- a reproduced fixture establishes real-world efficacy;
- Trust Lab or its external reporters validate PCF.

The useful transfer is methodological: **bad clocks do not establish freshness, declarations do not establish identity, and moving names do not establish frozen evidence.**
