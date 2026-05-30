# Contributing To Premature Contribution Firewall

Premature Contribution Firewall exists to make maintainers faster, not busier. Contributions should be small, reviewable, reproducible, and honest about what they prove.

## Contribution Standard

- One issue per pull request.
- Keep the diff narrow and easy to review.
- Explain the problem, change, risk, and verification.
- Add or update a benchmark, red-test, feedback candidate, or unit test when behavior changes.
- Do not claim AI-authorship detection. PCF gates review readiness, evidence quality, repository context, and maintainer attention cost.
- Do not commit local runtime evidence from `data/`.
- Do not include secrets, tokens, private repository data, or private maintainer feedback.

## Before Opening A Pull Request

Run:

```bash
npm run repo:verify
npm run ci:gates
```

If behavior changed, also regenerate the relevant artifact:

```bash
npm run benchmark:write
npm run redtest:write
npm run demo:maintainer:write
```

## When To Add A Test

- Evaluator scoring or labels changed: add or update benchmark cases.
- A hostile or malformed input broke a guardrail: add or update adversarial red-test cases.
- Maintainer feedback exposes a false positive, false negative, missed duplicate, missed concurrent PR, or missed upstream fix: add a feedback candidate first.
- GitHub workflow or repo hygiene changed: update the verifier and focused tests.
- UI or API behavior changed: add unit/API tests and manually verify the local surface when needed.

## Review Checklist

- The pull request has a focused title.
- The body includes problem, change, risk, and verification.
- `npm run ci:gates` passes.
- Generated proof artifacts are updated only when intentionally regenerated.
- No local absolute paths, private data, secrets, or runtime `data/` files are included.
- The change does not enable GitHub comments or labels by default.

## Maintainer Posture

PCF should be conservative about maintainer time and adventurous about useful evidence. If a change makes the tool more helpful without hiding uncertainty, capture that evidence and make it reproducible.
