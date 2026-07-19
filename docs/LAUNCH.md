# PCF Launch Runbook

This is the operator checklist for taking PCF from a local pilot to public distribution. Every step that needs credentials or a human judgment call is marked OPERATOR. Everything else is already automated in the repo.

## 0. Preconditions

```bash
npm run ci:gates
```

All gates must pass: repo hygiene, workflow contract, syntax, unit tests, current benchmark corpus, current red-test corpus, maintainer demo with zero regressions.

## 1. npm Publish (unlocks `npx` adoption)

The package is npx-ready: `bin` exposes `pcf`, `premature-contribution-firewall`, and `pcf-mcp`. The `files` whitelist includes `src`, `fixtures`, MCP docs, the MCP smoke script, the pilot/PR-gate scripts, `action.yml`, README, changelog, Glama metadata, and LICENSE.

Publish from `.github/workflows/npm-publish.yml`; do not create or paste a reusable npm token. The workflow verifies the requested version is unpublished, runs every proof gate, checks package contents, and uses GitHub OIDC trusted publishing.

```bash
VERSION=0.2.0
gh workflow run npm-publish.yml --ref main -f version="$VERSION" -f dry-run=true
# Inspect and require a successful dry-run workflow before continuing.
gh workflow run npm-publish.yml --ref main -f version="$VERSION" -f dry-run=false
```

Notes:

- The npm trusted publisher must match this repository and the exact workflow filename `npm-publish.yml`.
- The workflow has `id-token: write`; npm records provenance and the GitHub trusted-publisher identity on the package version.
- npm does not allow republishing an existing version. If package metadata changes after publication, bump a new patch version before publishing.
- Smoke test after publish:

```bash
npx premature-contribution-firewall@latest --help
npx premature-contribution-firewall@latest evaluate fixtures/pr-ready.json
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | npm exec --yes --package=premature-contribution-firewall@latest -- pcf-mcp
npm view premature-contribution-firewall version bin
```

## 2. GitHub Marketplace Listing (unlocks one-click Action adoption)

The Action supports two modes:

- `queue` (default on non-PR events): read-only markdown queue artifact.
- `pr-gate` (default on `pull_request` events): evaluates the triggering PR, writes the verdict to the step summary, exposes `status`/`score`/`ready` outputs, optional `fail-on` blocking.

OPERATOR steps for each new Action release:

1. Tag the exact commit recorded as the npm version's `gitHead`; do not move the tag to a later documentation-only commit.
2. Create a GitHub Release from the tag with release-specific verification links and non-claims.
3. On the release page, check "Publish this Action to the GitHub Marketplace".
4. Category: "Continuous integration" + "Code review". The `branding` block (filter icon, blue) is already in `action.yml`.

Current release: [`v0.2.0`](https://github.com/VrtxOmega/premature-contribution-firewall/releases/tag/v0.2.0), published from npm `gitHead` `8739108af4055c9ac72b033a7da4df770aa43272`.

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
