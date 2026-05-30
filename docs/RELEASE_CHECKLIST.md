# Premature Contribution Firewall Release Checklist

Use this checklist before presenting Premature Contribution Firewall as a public pilot, README-ready demo, or GitHub maintainer tool. The point is evidence, not vibes.

## Required Local Gates

Run these from the repository root:

```bash
npm run check
npm run repo:verify
npm test
npm run benchmark
npm run redtest
npm run demo:maintainer -- --fail-on-regression
npm run ci:verify
npm run demo:maintainer:write
```

Expected result:

- Syntax check passes.
- Repository hygiene verification passes.
- Unit tests pass.
- Benchmark stays at 35/35 or the documented case count increases with reviewed expectations.
- Adversarial red test stays at 8/8 or grows with preserved breakage residue.
- Maintainer demo reports `PASS`.
- CI workflow verification reports all required gates present and forbidden write posture absent.
- `docs/maintainer-demo-output.md` is regenerated from the demo command, not hand-edited.

## Required CI Gates

The GitHub Actions workflow at `.github/workflows/pcf-verification.yml` must run on pull requests and pushes to `main`. It must keep:

- `permissions.contents: read`
- `PCF_DRY_RUN=true`
- `PCF_POST_COMMENTS=false`
- `PCF_APPLY_LABELS=false`

It must run:

- `npm run ci:verify`
- `npm run repo:verify`
- `npm run check`
- `npm test`
- `npm run benchmark`
- `npm run redtest`
- `npm run demo:maintainer -- --fail-on-regression`

It should upload regenerated proof artifacts after those gates pass, not before.

## Evidence To Ship

- `docs/benchmark-results.md`
- `docs/adversarial-red-team-results.md`
- `docs/maintainer-demo-output.md`
- `docs/API.md`
- `docs/MAINTAINER_DEMO.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `CODE_OF_CONDUCT.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/`
- A screenshot or screen recording of the local queue, feedback, candidate export, and replay compare UI when presenting the browser experience.

## Safety Gates

- Keep GitHub writes disabled unless the deployment owner intentionally enables comments or labels.
- Configure webhook HMAC verification before accepting public webhooks.
- Add authentication, rate limiting, request logging, and operational alerting before public hosting.
- Treat `data/` as local runtime evidence. Do not commit feedback ledgers, candidate corpora, or queue-history files by accident.
- Keep feedback candidate promotion separate from the permanent benchmark until a maintainer reviews the case and expectation.
- Run `npm run setup:pilot -- --repository owner/repo` and verify the guided GitHub App pilot path is still accurate before sending the repo to a maintainer.
- Run a secret-pattern scan before publishing artifacts.

## Claims Allowed

- PCF evaluates review readiness, scope, evidence, repository policy, repository context, and maintainer attention cost.
- PCF includes deterministic local benchmark and adversarial red-test corpora.
- PCF can expose a read-only/dry-run GitHub maintainer queue and a callable local API.
- PCF can print a guided GitHub App pilot checklist and first dry-run queue commands without exposing secret values.
- PCF can turn maintainer corrections into replayable fixture candidates when the original payload is available.
- PCF can compare candidate replay baselines before evaluator or policy changes are accepted.

## Claims Not Allowed

- Do not claim AI-authorship detection.
- Do not claim universal maintainer-preference accuracy.
- Do not claim endorsement from the Linux kernel project or any maintainer group.
- Do not claim production-hosted security readiness until auth, rate limits, webhook secret posture, storage policy, and operational logging are reviewed.
- Do not claim feedback candidates are part of the permanent benchmark until they are intentionally promoted.

## Release Blockers

- Any failing unit, benchmark, red-test, or maintainer-demo gate.
- Any generated evidence artifact containing local absolute paths, private tokens, or runtime data paths.
- Any public mode with GitHub writes enabled by default.
- Any CI workflow that drops `ci:verify`, benchmark, red-test, or maintainer-demo gates.
- Any release missing contribution, security, support, conduct, PR, or issue-template guardrails.
- Any CI workflow requesting issue, pull-request, or contents write permissions.
- Any API or UI copy implying AI detection instead of review-readiness gating.
- Any hidden mutation of GitHub issues, PRs, labels, or comments during dry-run demonstrations.
