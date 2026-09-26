## Problem

What maintainer problem does this solve?

## Change

What changed, and what stayed intentionally unchanged?

## Risk

What could break, and how is the blast radius constrained?

## Claim Integrity

For behavior/security/decision-gate changes:

- Claim:
- Evidence surface:
- Positive control (must PASS):
- Negative control (must FAIL):
- Root-cause chain (symptom -> reachability -> invariant -> patch mechanism):
- Routing/overlap checked at:
- Falsification packet or reason not needed:

## Verification

Commands run:

```bash
npm run repo:verify
npm run ci:gates
```

Result:

PASS / FAIL / PARTIAL

Evidence:

- Tests:
- Benchmark/red-test/demo:
- Manual/API/browser check, if needed:

## Maintainer Checklist

- [ ] One issue or behavior change only.
- [ ] The diff is reviewable and avoids unrelated cleanup.
- [ ] Behavior changes include a unit test, benchmark case, red-test case, or feedback candidate.
- [ ] Serious claims have a judgeable evidence surface and reachable controls, or explicitly document a one-sided contract.
- [ ] Generated proof artifacts were updated only when intentionally regenerated.
- [ ] No local runtime `data/` files, secrets, private repository data, or local absolute paths are included.
- [ ] This does not claim AI-authorship detection.
- [ ] This does not enable GitHub comments, labels, or other writes by default.
