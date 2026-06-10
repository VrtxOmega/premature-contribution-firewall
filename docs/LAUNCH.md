# PCF Launch Runbook

This is the operator checklist for taking PCF from a local v0.1.0 pilot to public distribution. Every step that needs credentials or a human judgment call is marked OPERATOR. Everything else is already automated in the repo.

## 0. Preconditions

```bash
npm run ci:gates
```

All gates must pass: repo hygiene, workflow contract, syntax, unit tests, 69/69 benchmark, 11/11 red test, maintainer demo with zero regressions.

## 1. npm Publish (unlocks `npx` adoption)

The package is npx-ready: `bin` exposes `pcf` and `premature-contribution-firewall`, and `files` whitelists `src`, `fixtures`, the pilot/PR-gate scripts, `action.yml`, README, and LICENSE.

OPERATOR steps:

```bash
npm login
npm publish --access public --provenance
```

Notes:

- `--provenance` requires publishing from a GitHub Actions workflow with `id-token: write`, or use a local publish without it for the first release and add provenance in CI for v0.1.1.
- Verify the package name is available; if `premature-contribution-firewall` is taken, the fallback scope is `@vrtxomega/premature-contribution-firewall` (update `bin` consumers in docs).
- Smoke test after publish:

```bash
npx premature-contribution-firewall@latest --help
npx premature-contribution-firewall@latest evaluate fixtures/pr-ready.json
```

## 2. GitHub Marketplace Listing (unlocks one-click Action adoption)

The Action supports two modes:

- `queue` (default on non-PR events): read-only markdown queue artifact.
- `pr-gate` (default on `pull_request` events): evaluates the triggering PR, writes the verdict to the step summary, exposes `status`/`score`/`ready` outputs, optional `fail-on` blocking.

OPERATOR steps:

1. Tag a release: `git tag v0.1.0 && git push origin v0.1.0` (or `v0.1.1` if npm publish required changes).
2. Create a GitHub Release from the tag; paste `docs/RELEASE_POST_V0_1_0.md` content.
3. On the release page, check "Publish this Action to the GitHub Marketplace".
4. Category: "Continuous integration" + "Code review". The `branding` block (filter icon, blue) is already in `action.yml`.

## 3. PR Gate Rollout Guidance (what to tell adopters)

Recommended adoption ladder, in order:

1. `workflow_dispatch` queue artifact (read-only, zero risk).
2. `pull_request` PR gate with `fail-on: never` (report-only step summary).
3. `fail-on: low-review-value` once maintainers trust the lane.
4. `fail-on: needs-repair` only for repos that want a hard readiness gate.

Never skip steps. The trust ladder is the product.

## 4. Contributor Preflight Promotion

The `preflight` command is the contributor-side wedge:

```bash
npx premature-contribution-firewall preflight my-pr-draft.json
npx premature-contribution-firewall preflight my-series.patch
```

OPERATOR steps:

- Add a "Run PCF preflight before submitting" line to adopting repos' CONTRIBUTING.md (PCF's own CONTRIBUTING.md should adopt it first — dogfood).
- Exit-code contract is stable: 0 ready, 1 not ready, 2 usage error. Safe for pre-push hooks and CI.

## 5. Announcement Sequence

Assets already in the repo:

| Asset | Use |
| --- | --- |
| `docs/RELEASE_POST_V0_1_0.md` | Release/announcement body |
| `docs/BUILD_ARC_36_HOURS.md` | "How it was built" post |
| `docs/MAINTAINER_EXPORT_SAMPLE.md` | Canonical output demo |
| `docs/PILOT_REPORT.md` + `docs/PILOT_LEDGER.md` | Evidence for skeptics |
| `docs/adversarial-red-team-results.md` | "We publish our failures" trust post |

Channel order: GitHub Release → Hacker News (Show HN, lead with the maintainer-pain framing, not the tool) → Lobsters → r/opensource → targeted maintainer outreach from `docs/PILOT_TARGETS.md`.

Message discipline (non-claims are the brand):

- PCF does not detect AI authorship.
- PCF does not replace maintainer judgment.
- A lane assignment is not an endorsement or correctness claim.

## 6. Post-Launch Watch

- Triage incoming issues with PCF itself; publish the queue artifact in the repo (already the canonical sample pattern).
- Every wrong call goes through the feedback → candidate → calibration loop and becomes a benchmark or red-test case.
- Track adoption: Marketplace installs, npm downloads, and `pcf-queue` artifact mentions in public workflows (GitHub code search for `premature-contribution-firewall@`).

## 7. Next Milestones (from the roadmap)

1. Hosted "paste a repo, see the queue" demo page (deploy `public/` + rate limiting + auth before any public deployment).
2. Benchmark corpus extraction as a standalone dataset others can run against their own tools.
3. GitLab/Forgejo collectors (the evaluator is already platform-agnostic; only `src/github/client.mjs` is GitHub-specific).
4. Mailing-list watch mode for kernel-grade email workflows.
5. Consented, anonymized feedback-sharing design (the data flywheel).
