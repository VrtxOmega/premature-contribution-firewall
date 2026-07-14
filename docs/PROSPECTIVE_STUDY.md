# Prospective Maintainer Study Runner

`pcf study` is a local, fail-closed operator for the frozen independent-
maintainer evaluation protocol. It keeps consent and raw snapshots separate,
locks case selection before PCF evaluation, hides PCF output from raters, and
builds privacy-reduced aggregate receipts through `validate-corpus`.

It does not contact GitHub, send invitations, register a study, promise
compensation, verify institutional compliance, or establish product validity.

## Modes

- `production` is the default. Initialization is allowed for method review, but
  consent, issue observation, and case freezing stop unless the activated
  protocol contains `status.outreachAuthorized=true` and
  `snapshot.restrictedSnapshotStoreCreated=true`.
- `synthetic` supports end-to-end rehearsal. Every consent record must contain
  `synthetic=true`. Synthetic output is never participant evidence.

Production mutations use the system clock. Caller-supplied `--now` values are
accepted only in synthetic mode for deterministic testing, and every consent,
observation, freeze, rating, withdrawal, and lock transition must remain in
monotonic time order.

## Private store

The study root must be an explicit absolute path and cannot contain symbolic
links. Directories are created with mode `0700`; files use `0600`. Every read
fails closed if those owner-only permissions drift.

```text
<root>/
  config/
    protocol.json
    sampling-frame.json
    study.json
  restricted/
    participants.json
    observations.json
    cases.json
    snapshots/<case>.json
    ratings/<case>/<rater-position>.json
    corpus/consented.jsonl
  sealed/pcf/<case>.json
  blinded/cases/<case>.json
  output/analysis.json
  audit/events.jsonl
```

`participants.json` is the only file containing consent and contact
references. Blinded case files contain the same canonical issue and policy
context PCF received, but no PCF output, consent reference, contact reference,
or peer rating. The aggregate receipt contains no raw issue text or participant
identifier.

These permissions do not protect data from another process running as the same
operating-system user. Production use still requires an approved restricted
storage location, backups, deletion policy, access logging, and operator model.
Run commands sequentially; the runner is a single-writer local tool.

## 1. Initialize

```bash
pcf study init \
  --root /absolute/private/study-root \
  --protocol protocol.json \
  --sampling-frame sampling-frame.json \
  --mode synthetic \
  --format json
```

Initialization canonicalizes and hashes the protocol and sampling frame.
Every later command rechecks those hashes.

## 2. Record consent

```bash
pcf study consent --root /absolute/private/study-root --input consent.json
```

The input contains one opaque participant ID, host position, repository,
versioned consent reference, separate contact reference, consent and withdrawal
times, adult and maintainer-role attestations, and validation permission.
Participant IDs and host positions must be unique among active records.

## 3. Lock issue eligibility before PCF

Every public issue number observed after repository activation is recorded once
in strictly ascending order. Inclusion or a frozen objective exclusion is
chosen before any PCF output is inspected.

```json
{
  "hostPosition": "H1",
  "repository": "owner/repository",
  "issueNumber": 123,
  "issueCreatedAt": "2026-07-14T11:59:00Z",
  "observedAt": "2026-07-14T12:00:00Z",
  "disposition": "INCLUDE",
  "eligibilityChecked": true,
  "pcfOutputInspected": false
}
```

```bash
pcf study observe --root /absolute/private/study-root --input observation.json
```

An exclusion uses `disposition: "EXCLUDE"` and exactly one code from the
frozen protocol. The runner assigns included ordinals from this ledger. A case
cannot be frozen without its prior unmatched `INCLUDE` observation, preventing
post-score cherry-picking.

## 4. Freeze the canonical intake and seal PCF

```bash
pcf study freeze --root /absolute/private/study-root --input case.json --format json
```

The input contains the assigned case/host position, repository, issue ordinal,
initial issue title/body, author association, creation-time labels, creation
time, language, eligibility attestations, and frozen policy context. Comments,
reactions, later labels, assignments, closure, linked patches, and eventual
outcomes are rejected.

The runner:

1. verifies all three assigned positions have active consent;
2. matches the case to the next prior `INCLUDE` observation;
3. canonicalizes the exact intake and computes SHA-256;
4. evaluates that snapshot with the frozen PCF mapping;
5. writes PCF output only under `sealed/pcf/`; and
6. writes the same issue and policy context without PCF output under
   `blinded/cases/`.

## 5. Lock ratings

```bash
pcf study rate --root /absolute/private/study-root --input rating.json
```

A rating must match the snapshot hash and one frozen context/external
assignment. External self-rating is rejected. Lane and next actor must be one
of the frozen pairs:

- `review-now` / `maintainer`
- `repair` / `reporter`
- `defer` / `no-action`

Each rater-position file is created exclusively; a second submission cannot
overwrite it. Abstentions remain explicit and never become `defer`.

## 6. Withdraw before aggregate lock

```bash
pcf study withdraw \
  --root /absolute/private/study-root \
  --participant opaque-participant-id
```

Before aggregate lock, withdrawal deletes that participant's unaggregated
rating files and marks every affected case excluded. After aggregate lock, all
mutation commands fail closed; the consent language governs any later request.

## 7. Inspect, analyze, and lock

```bash
pcf study status --root /absolute/private/study-root --format markdown
pcf study analyze --root /absolute/private/study-root --format json
pcf study analyze --root /absolute/private/study-root --write --lock --format json
```

Aggregate lock requires exactly the protocol target of complete,
non-abstaining cases. It also fails closed until every active participant's
disclosed withdrawal deadline has passed and at least 14 days have elapsed
since the final rating. `--write` stores the metadata-only corpus under
`restricted/corpus/` and the aggregate receipt under `output/`.

Analysis reports:

- counts before rates;
- the three-by-three lane confusion matrix;
- false and missed `review-now` counts and naive Wilson intervals;
- context-versus-external agreement;
- per-stratum confusion counts;
- the existing validator's lane precision/recall, nominal kappa, next-actor
  agreement, and fixed score bins; and
- incomplete, abstaining, excluded, and withdrawn cases.

Every analysis remains `INCONCLUSIVE`. Wilson intervals are explicitly naive
because issues cluster within repositories and raters repeat. Timing is not in
the validator corpus, no threshold is tuned, and a later tuned evaluator needs
a new independent holdout.

## Stop conditions

Stop on any consent ambiguity, policy mismatch, suspected security/private
content, out-of-order observation, unapproved exclusion, snapshot corruption,
permission drift, symlink, assignment conflict, self-rating, hash mismatch,
duplicate rating, evaluator-mapping drift, unauthorized production clock,
aggregate-lock mutation, or public-write risk.
