# Offline Corpus Validation

`pcf validate-corpus` measures PCF decisions against consented maintainer labels.
It is an offline evidence tool, not a training command, evaluator tuner, or
product-validity oracle.

```bash
pcf validate-corpus consented.jsonl --format json
pcf validate-corpus consented.csv --format markdown
pcf validate-corpus - --input-format jsonl --format pretty < consented.jsonl
```

The command reads one file or standard input and writes only to standard output.
It makes no network request and does not modify PCF fixtures, benchmarks,
policies, feedback stores, or evaluator behavior. Use normal shell redirection
when a local receipt is desired.

## JSONL contract

Each non-empty line is one case:

```json
{"id":"opaque-001","repository":"owner/repo","policyId":"policy-v1","consent":{"allowedForValidation":true,"reference":"consent-batch-a"},"pcf":{"lane":"review-now","score":91,"nextActor":"maintainer"},"ratings":[{"raterId":"maintainer-a","lane":"repair","nextActor":"reporter"},{"raterId":"maintainer-b","lane":"repair","nextActor":"reporter"}],"timing":{"baselineSeconds":120,"pcfSeconds":80},"provenance":{"dataset":"consented-alpha","caseRef":"alpha-001","policySnapshot":"policy-v1@abc123","collectedAt":"2026-07-13T12:00:00Z"}}
```

Required boundaries:

- `id` is an opaque case identifier and must be unique.
- At least one of `repository` or `policyId` identifies the evaluation context.
- `consent.allowedForValidation` must be `true`, with a non-empty consent
  reference.
- PCF and maintainer lanes are exactly `review-now`, `repair`, or `defer`.
- `pcf.score` is numeric from 0 through 100.
- Every case has at least one rating; `raterId` values must be unique within the
  case. IDs are caller assertions and do not prove identity or independence.
- `provenance.dataset`, `caseRef`, and `policySnapshot` are required.
- `timing` is optional. When present, `baselineSeconds` must be positive and
  `pcfSeconds` must be non-negative.
- Declared identifiers are single-line values capped at 256 characters. A case
  may contain at most 50 ratings.

## CSV contract

CSV uses one row per rater. Repeated case metadata must be identical:

```text
id,repository,policyId,dataset,caseRef,policySnapshot,consentReference,consentAllowed,pcfLane,pcfScore,pcfNextActor,raterId,raterLane,raterNextActor,baselineSeconds,pcfSeconds
```

`consentAllowed` must be the literal `true`. The header must contain exactly the
listed columns with no duplicates. Standard quoted CSV fields, embedded commas,
and escaped quotes are parsed locally; identifier values must remain single-line.

## Privacy boundary

The schema intentionally excludes raw third-party material. PCF fails closed if
any nested object includes fields named `title`, `body`, `text`, `content`,
`patch`, `diff`, `comment`, `comments`, `raw`, or `payload`.

Receipts expose aggregate metrics plus opaque IDs, repository/policy identifiers,
approved `caseRef` values, and corpus provenance. They do not expose rater IDs,
consent references, raw issue or PR content, or local absolute paths.

Local resource limits are 10 MiB per corpus, 10,000 cases per run, and 50
ratings per case. These bounds protect an offline operator from accidental
oversized inputs; they are not statistical sufficiency claims.

## Measurement semantics

- A lane is scored only when its maintainer ratings have a strict majority.
  Ties are reported as `NO_STRICT_MAJORITY` exclusions.
- The confusion matrix uses PCF lanes as rows and maintainer consensus as
  columns.
- Precision and recall are reported for every lane. A missing denominator is
  `null` in JSON and `n/a` in human receipts.
- False `review-now` means PCF selected `review-now` while maintainer consensus
  selected `repair` or `defer`.
- Inter-rater output includes pairwise agreement and a nominal, multi-rater
  kappa derived from aggregate lane prevalence. Variable rater counts are
  allowed.
- Score calibration uses fixed 20-point bins and compares PCF `review-now`
  frequency with consensus `review-now` frequency. It is descriptive, not a
  probabilistic calibration claim.
- Paired timing reports seconds and percent saved. Negative savings remain
  visible.
- The SHA-256 digest covers the exact input bytes. Replaying identical bytes
  produces the same result object.

## Formats and exit codes

- `--format pretty`: concise terminal receipt.
- `--format json`: complete machine-readable result.
- `--format markdown`: aggregate human review receipt.
- Exit `0`: the declared corpus shape was valid and metrics were produced.
- Exit `1`: consent, privacy, schema, or integrity validation failed closed.
- Exit `2`: command usage or format was invalid.

Every successful result retains decision status `INCONCLUSIVE`. Metrics require
human interpretation, an independently governed study, and a later VERITAS
decision before any accuracy, maintainer-endorsement, product-validity, or
release-readiness claim.
