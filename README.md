# Premature Contribution Firewall

[![PCF Verification](https://github.com/VrtxOmega/premature-contribution-firewall/actions/workflows/pcf-verification.yml/badge.svg)](https://github.com/VrtxOmega/premature-contribution-firewall/actions/workflows/pcf-verification.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![Premature Contribution Firewall preflight: drive-by PR vs scoped fix](docs/images/pcf-hero.jpeg)

Premature Contribution Firewall is a review-readiness firewall for maintainers drowning in public GitHub issues, pull requests, patches, and patch series.

It does not try to detect whether a contribution was written by AI. That is a bad maintainer primitive. PCF asks the question maintainers can actually act on:

Is this contribution reviewable, reproducible, scoped, tested, and worth human attention?

The output is a maintainer queue, not a vibe score: labels, repair checklists, repository-context findings, benchmark proof, adversarial residue, and dry-run guardrails before any write action touches GitHub.

![PCF maintainer queue: review-now, duplicate-check, and reporter-repair lanes](docs/images/pcf-maintainer-queue.jpeg)

## Status

PCF v0.1.3 is published on [npm](https://www.npmjs.com/package/premature-contribution-firewall/v/0.1.3) and as a [GitHub release](https://github.com/VrtxOmega/premature-contribution-firewall/releases/tag/v0.1.3). It adds impact-first serious candidate scouting, the AI-assisted contribution posture gate, and stricter authority boundaries for repository context, overlap checks, lane evidence, repro claims, and MCP framing. The recommended adoption path remains read-only first: run the GitHub Action or MCP smoke path, read one artifact, and decide whether it is useful before enabling anything else.

Try it in one command, no install:

```bash
npx premature-contribution-firewall preflight your-pr-draft.json
```

Current public state:

- Published on npm: [`premature-contribution-firewall`](https://www.npmjs.com/package/premature-contribution-firewall) with `pcf` CLI (`evaluate`, `queue`, `preflight`, `setup`) and the `pcf-mcp` stdio server bin.
- Published on the GitHub Marketplace as a read-only Action with two modes: `workflow_dispatch` queue artifact and `pull_request` PR gate (step-summary verdict, optional `fail-on` blocking, no GitHub writes).
- MCP server: `pcf-mcp` / `npm run mcp` exposes default-safe agent tools for scout, policy, repro, diff-shape, lane status/resume, evidence drafts, fixed local lane storage, and registry-readiness self-audit. The release gate verifies `npm pack` includes the bin before publish. See [docs/MCP.md](docs/MCP.md).
- Contributor preflight: `pcf preflight` checks a draft PR or patch before submission, with a stable exit-code contract for hooks and CI.
- Initial release post: [v0.1.0 read-only maintainer queue pilot](docs/RELEASE_POST_V0_1_0.md).
- Canonical output sample: [maintainer export bundle from PCF's own public queue](docs/MAINTAINER_EXPORT_SAMPLE.md).
- Build history: [36-hour idea-to-v0.1.0 evidence capsule](docs/BUILD_ARC_36_HOURS.md).
- Maintainer feedback tracker: [five-maintainer artifact-shape feedback pass](docs/MAINTAINER_FEEDBACK_TRACKER.md).
- Real-world usage so far: author-run read-only shadow pilots against public queues, with two public briefs in this repo and private replay captures for calibration.
- Upstream contribution learning ledger: [public wins, misses, blocked lanes, and gate changes](docs/UPSTREAM_CONTRIBUTION_LEDGER.md).
- AI-assisted contribution posture index: [evidence-based repo compatibility, not a maintainer blacklist](docs/AI_CONTRIBUTION_POSTURE_INDEX.md).
- Still not a hosted service or write-enabled bot; every write surface stays opt-in and dry-run by default.
- No target repository or maintainer listed in the pilot ledger is an endorsement.

## 30-Second Maintainer View

A messy queue turns into a short action list:

| PCF lane | Who acts next | Maintainer move |
| --- | --- | --- |
| `review-now` | maintainer | Start normal review now. |
| `ask-reporter-for-evidence` | reporter | Send a focused repair request. |
| `check-duplicate-or-fixed-first` | maintainer | Check solved, duplicate, concurrent, or upstream-fixed work before fresh review. |
| `route-to-subsystem-or-process` | maintainer/process | Send it to the right owner, template, repo, or process. |
| `needs-maintainer-decision` | maintainer | Make the judgment call without pretending the reporter can fix it. |
| `not-actionable-yet` | external state | Wait for release, stale-state cleanup, upstream answer, or missing external event. |

Each queue item includes the route reason, next actor, maintainer action, top labels/checks, repository-context summary, and feedback controls for turning wrong calls into replayable evidence.

Each queue item also includes a dry-run response draft. Reporter-owned lanes get a copyable repair-request draft; maintainer-owned lanes get an internal note for duplicate checks, routing, decision, or parked-state handling. PCF still does not post those drafts automatically.

Canonical sample: [PCF maintainer export bundle from this repo's own public queue](docs/MAINTAINER_EXPORT_SAMPLE.md).

Release post: [v0.1.0 read-only maintainer queue pilot](docs/RELEASE_POST_V0_1_0.md).

Build arc: [36-hour idea-to-v0.1.0 evidence capsule](docs/BUILD_ARC_36_HOURS.md).

## GitHub Action Dry-Run

The lowest-friction pilot is a read-only workflow artifact. It does not require a GitHub App and does not comment, label, close, merge, or write to issues or pull requests.

```yaml
name: PCF dry-run

on:
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  pull-requests: read

jobs:
  queue:
    runs-on: ubuntu-latest
    steps:
      - name: Run PCF
        uses: VrtxOmega/premature-contribution-firewall@v0.1.3
        with:
          github-token: ${{ github.token }}
          limit: 25

      - name: Upload queue artifact
        uses: actions/upload-artifact@v7
        with:
          name: pcf-queue
          path: pcf-queue.md
          if-no-files-found: error
```

See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md) for inputs, upstream-repo context, and the safety contract.

### PR Gate Mode

When the same Action runs on a `pull_request` event (or with `mode: pr-gate`), it evaluates just the triggering PR, writes a readiness verdict to the job step summary, and exposes `status`, `score`, and `ready` outputs. It still makes no comments, labels, or other GitHub writes; the only "write" is the workflow's own step summary.

```yaml
name: PCF PR gate

on:
  pull_request:

permissions:
  contents: read

jobs:
  readiness:
    runs-on: ubuntu-latest
    steps:
      - name: PCF readiness check
        uses: VrtxOmega/premature-contribution-firewall@v0.1.3
        with:
          fail-on: never
```

`fail-on` accepts `never` (report only), `low-review-value`, or `needs-repair` for repos that want the gate to block. Start with `never`; tighten only after the artifact has earned trust.

## Contributor Preflight

Contributors can check their own work before submitting, so the repair request never has to happen:

```bash
node src/cli.mjs preflight my-pr-draft.json
node src/cli.mjs preflight my-series.patch --format json
node src/cli.mjs preflight my-pr-draft.json --allow-repair
```

Exit code 0 means ready to submit, 1 means not ready (with a fix-first checklist), 2 means usage error. Patch and mbox files are auto-detected and use the kernel-grade profile. The preflight is advisory: it does not guarantee acceptance and makes no GitHub writes.

## Feedback Loop

PCF is not only a static rule set. When a maintainer says PCF was too harsh, too lenient, or missed duplicate/upstream/concurrent context, the correction can become a local evidence case file.

The loop is deliberate:

1. Record maintainer feedback against a queue item.
2. Export a regression-candidate fixture when the original payload is available.
3. Promote selected runnable candidates into a separate local candidate corpus.
4. Replay and compare that candidate corpus before accepting evaluator changes.
5. Build a feedback calibration profile from local corrections and promoted candidates.
6. Attach matching calibration evidence to future queue items without hiding the original score or status.

Feedback candidates do not automatically enter the permanent benchmark. A human has to review the case and expectation first.

## What Maintainers Get

- A sorted queue that separates ready work from low-evidence, too-broad, duplicate, already-solved, or context-missing work.
- A next-actor model that shows whether the next useful move belongs to the reporter, maintainer, repository context lookup, process routing, or external state.
- A GitHub Action dry-run path that emits a markdown queue artifact with read-only permissions.
- Repair checklists contributors can act on before maintainers spend review time.
- Repository policy ingestion for templates, `CODEOWNERS`, `MAINTAINERS`, scripts, manifests, and contribution rules.
- Upstream and concurrent-work context for duplicates, solved issues, merged upstream fixes, and competing PRs.
- A deterministic benchmark and adversarial red-test corpus that can be rerun in CI.
- A local feedback calibration loop that turns maintainer corrections into candidate regression fixtures and attaches matching evidence to future triage.
- Dry-run-first GitHub posture with HMAC webhook verification and explicit setup/readiness reporting.
- Optional shielded maintainer stack with high-assurance behavioral context, vouch parsing, issue-form checks, and deterministic duplicate assist. See [docs/SHIELDED_POSTURE.md](docs/SHIELDED_POSTURE.md) and [docs/MAINTAINER_STACK.md](docs/MAINTAINER_STACK.md).

## Maintainer Pain Map

| Queue pressure | PCF response |
| --- | --- |
| "This issue says a lot but proves nothing." | Requires reproduction, observed behavior, expected behavior, logs, screenshots, or equivalent evidence. |
| "This PR is huge and nobody can safely review it." | Flags broad scope, generated churn, missing rationale, and review-budget risk. |
| "We already solved this upstream." | Surfaces closed duplicates, linked closed issues, merged upstream PRs, and possibly fixed work. |
| "Someone else is already working on this." | Detects concurrent open issues and PRs touching related files or claims. |
| "The patch looks polished but unverified." | Separates claimed tests from actual verification evidence and blocks skipped-only proof. |
| "The project policy was ignored again." | Reads repo policy files and reports missing template sections, ownership, sign-off, or test expectations. |

## What This Is Not

- Not an AI-authorship detector.
- Not a replacement for maintainer judgment.
- Not a mergeability, correctness, security, or endorsement certificate.
- Not a claim that Linux kernel maintainers, Linus Torvalds, or any specific project endorses this repo.
- Not a write-enabled GitHub bot until a project deliberately enables writes after dry-run review.

For the maintainer-facing assumptions behind the tool, see [docs/MAINTAINER_OPERATING_MODEL.md](docs/MAINTAINER_OPERATING_MODEL.md).

## What It Does

- Scores pull requests and issues for review readiness.
- Produces maintainer-facing labels such as `ready-for-maintainer`, `needs-tests`, `needs-reproducer`, `too-broad`, and `low-review-value`.
- Returns a repair checklist contributors can follow before a maintainer spends review time.
- Exposes a local browser surface for paste-in/manual evaluation.
- Provides a GitHub webhook endpoint with HMAC verification and dry-run behavior by default.
- Includes a CLI for fixtures, saved payloads, and pre-submission checks.
- Ingests repository policy files such as `CONTRIBUTING.md`, PR templates, issue templates, `CODEOWNERS`, `MAINTAINERS`, and common project manifests to infer required sections, owner routing, and test commands.
- Checks repository and upstream context for similar open issues, concurrent PRs, closed/solved duplicates, linked issues that are already closed, and upstream fixes.
- Builds a dry-run maintainer queue for open GitHub PRs/issues, with status counts, repair sub-actions, review-budget totals, context findings, queue actions, and markdown export.
- Shows GitHub App setup posture without exposing secrets: dry-run/write mode, webhook secret presence, app credential readiness, queue history status, and read-only connection testing.
- Stores local queue history so maintainers can compare runs, including improved, regressed, unchanged, and new queue items.
- Captures maintainer feedback as local evidence case files: agreement, false positives, false negatives, too-harsh/too-lenient calls, missed duplicates, missed upstream fixes, and missed concurrent work.
- Exports feedback as regression-fixture candidates, including runnable benchmark fixture drafts when the original PR, issue, or patch payload is available.
- Promotes selected runnable feedback drafts into a separate local candidate corpus and replays that corpus against the current evaluator before anything is folded into the permanent benchmark.
- Builds an auditable feedback calibration profile from local corrections and promoted candidates, then attaches close matches to future evaluations and queue items without hiding the base heuristic status or score.
- Evaluates plain-text patch or mbox submissions with `evaluate-patch`, defaulting to `kernel-grade` discipline for email-style review.
- Ships a deterministic maintainer benchmark corpus with 77 reproducible cases across PRs, issues, feature requests, large-maintainer process issues, repo-policy, repo-context, patch series, tool-use, kernel-grade, and review-budget pressure.
- Ships a separate adversarial red-test corpus with 29 cases that preserve breakage residue across contribution evaluation, Unicode/control-text evasion, serious-scout authority, repository context, lane gates, repro evidence, and malformed API input.
- Exposes callable API endpoints for single, patch, batch, spec, and benchmark evaluation.
- Includes a stricter `kernel-grade` profile for projects that want Linux-kernel-style patch discipline: concise subsystem subjects, human DCO sign-off, Fixes/stable discipline, maintainer routing, build/test evidence, review-budget control, and transparent tool provenance.

## Quick Start

```bash
cd premature-contribution-firewall
npm run check
npm run repo:verify
npm test
npm run benchmark
npm run redtest
npm run demo:maintainer
npm start
```

Open `http://127.0.0.1:3791`.

For the full publishable proof run:

```bash
npm run ci:gates
```

## Benchmark

The reproducible benchmark is the proof surface maintainers can inspect and rerun:

```bash
npm run benchmark
npm run benchmark:json
npm run benchmark:markdown
npm run benchmark:write
```

Current generated results live in [`docs/benchmark-results.md`](docs/benchmark-results.md):

- 77/77 benchmark cases passing
- standard PR readiness
- issue triage readiness
- repository policy enforcement
- repository/upstream context detection
- kernel-grade patch discipline
- patch/mbox parsing
- tool-use accountability
- review-budget pressure

The benchmark is deterministic. It asserts expected outcomes over a public synthetic corpus; it does not claim AI-authorship detection or universal real-world maintainer preference.

## Real-World Calibration

Synthetic fixtures are not enough. PCF's live-pilot rule is: when a real repository exposes a wrong assumption, preserve the evidence, fix the narrow evaluator behavior, and lock the lesson into tests, benchmark cases, red-test residue, or replayable feedback candidates.

The maintainer proof report is in [docs/PILOT_REPORT.md](docs/PILOT_REPORT.md). The calibration method is documented in [docs/REAL_WORLD_CALIBRATION.md](docs/REAL_WORLD_CALIBRATION.md). The running ledger of pilot repositories, findings, fixes, artifact hashes, and public/private status lives in [docs/PILOT_LEDGER.md](docs/PILOT_LEDGER.md). Future read-only pilot candidates are tracked in [docs/PILOT_TARGETS.md](docs/PILOT_TARGETS.md).

Current pilot progression:

The large-maintainer stress bench is summarized in [docs/LARGE_MAINTAINER_BENCH.md](docs/LARGE_MAINTAINER_BENCH.md). That bench now uses private replay captures across 10 read-only large public queues and 120 sampled issues. The replay-captured aggregate is 20 review-now, 61 repair, 39 defer, with 120/120 repository-context checks, 149 context findings, 0 collection errors, and a published `nextAction` split for the non-ready work.

| Repository | Public status | Before | After | Lesson locked into PCF |
| --- | --- | ---: | ---: | --- |
| `make-all/tuya-local` | Public brief in PCF repo | n/a | 5 review / 2 repair / 1 defer | Device-support reports need product, log, and DPS evidence checks. |
| `floccusaddon/floccus` | Public brief in PCF repo | 0 review / 9 repair / 3 defer | 4 review / 8 repair / 0 defer | Feature requests need use-case and requested-behavior checks, not bug-only evidence. |
| `knadh/listmonk` | Private only | 6 review / 4 repair / 2 defer | 5 review / 6 repair / 1 defer | Current-workflow feature requests and comment-linked duplicate context matter. |
| `henrygd/beszel` | Private only | 5 review / 6 repair / 1 defer | 6 review / 6 repair / 0 defer | Security-monitoring feature requests are not vulnerability reports. |
| `karakeep-app/karakeep` | Private only | 2 review / 8 repair / 2 defer | 6 review / 3 repair / 3 defer | Maintainer triage labels, bug-template failure output, and AI/LLM domain language need distinct handling. |
| `keymapperorg/KeyMapper` | Private only | 0 review / 5 repair / 7 defer | 5 review / 3 repair / 4 defer | Maintainer-authored internal issues should not get contributor repair prompts unless context or safety conflicts exist. |
| `jarnedemeulemeester/findroid` | Private only | 2 review / 6 repair / 4 defer | 7 review / 0 repair / 5 defer | Complete Android/media bug templates should not need logs or root-cause analysis for first triage, but uncertain repros stay out of review-now. |
| `FreeTubeApp/FreeTube` | Private only | 1 review / 10 repair / 1 defer | 3 review / 8 repair / 1 defer | Bug-template repro steps can live inside description sections, and `U: reproduced` is maintainer validation unless repo context conflicts. |
| `photoprism/photoprism` | Private only | 6 review / 3 repair / 3 defer | 9 review / 1 repair / 2 defer | Project-specific bug headings, contextual follow-up references, and GitHub search pacing matter for media-heavy queues. |
| `advplyr/audiobookshelf` | Private only | 3 review / 7 repair / 2 defer | 6 review / 6 repair / 0 defer | Enhancement templates and "What happened?" bug templates need project-specific section recognition while duplicate context stays active. |
| `termux/termux-app` | Private only | 2 review / 7 repair / 3 defer | 4 review / 3 repair / 5 defer | App-only repos need wrong-repository routing for package/dependency reports, while nested crash environment and Termux feature sections still count as reviewable evidence. |
| `esphome/esphome` | Private only | 1 review / 4 repair / 7 defer | 4 review / 6 repair / 2 defer | YAML/log firmware reports need template-aware evidence, placeholder secrets should not block review, and stale labels keep old complete reports out of review-now. |
| `yt-dlp/yt-dlp` | Private only | 0 review / 6 repair / 6 defer | 4 review / 7 repair / 1 defer | High-volume CLI queues need checked known-issues search recognition, complete verbose-output evidence, contextual issue-link handling, question-template routing, and signed media URL token tolerance. |

## Adversarial Red Test

The red-test suite captures inputs that try to make bad work look reviewable:

```bash
npm run redtest
npm run redtest:json
npm run redtest:markdown
npm run redtest:write
```

Current generated results live in [`docs/adversarial-red-team-results.md`](docs/adversarial-red-team-results.md):

- 29/29 adversarial cases passing
- negated test/verification claims no longer count as proof
- suspicious repository paths are blocked before docs-only logic can bless them
- AWS-style secret material is caught
- generated/minified bundles need a source/rationale
- skipped-only CI is treated as weak signal, not green signal
- prompt-injection or review-bypass language is quarantined
- zero-width and bidirectional controls cannot split prompt-injection or claimed-work phrases around analysis checks
- malformed batch API payloads fail closed
- incomplete or metadata-free serious-scout searches cannot authorize promotion
- failed or unchecked open-PR overlap cannot be laundered into a clean handoff
- empty repository context stays unchecked instead of passing duplicate search
- bare, evidence-free, placeholder, or self-verified lane passes and verdict-only repro claims do not count as evidence
- mixed queue labels cannot make a context or wait-state action explain itself as a reporter-evidence request
- maintainer-owned queue items cannot be sent back to a generic reporter when maintainer judgment is the next action

This corpus is meant to grow whenever the firewall breaks. The residue from a break becomes the next regression case.

## Maintainer Demo

The maintainer demo packages the core proof surfaces into one reproducible command:

```bash
npm run demo:maintainer
npm run demo:maintainer:json
npm run demo:maintainer:markdown
npm run demo:maintainer:write
```

Current generated output lives in [`docs/maintainer-demo-output.md`](docs/maintainer-demo-output.md). Use it when preparing a README, release note, or maintainer walkthrough. The release gate is documented in [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md), and the short browser/API script is in [`docs/MAINTAINER_DEMO.md`](docs/MAINTAINER_DEMO.md).

The demo proves benchmark health, adversarial residue health, queue sorting with repository context, feedback candidate replay, and replay-baseline comparison. It still does not claim AI-authorship detection, universal maintainer preference, GitHub writes, or public deployment security readiness.

## CI Proof Gates

The repo includes a least-privilege GitHub Actions workflow at [`.github/workflows/pcf-verification.yml`](.github/workflows/pcf-verification.yml). It runs on pull requests, pushes to `main`, and manual dispatch:

```bash
npm run ci:verify
npm run check
npm test
npm run benchmark
npm run redtest
npm run demo:maintainer -- --fail-on-regression
```

The workflow sets `PCF_DRY_RUN=true`, keeps comment/label writes disabled, uses `contents: read`, and uploads the generated benchmark, adversarial red-test, and maintainer demo artifacts after the gates pass. `npm run ci:verify` is a local contract check for the workflow itself; it fails if the proof gates are removed or write posture appears in the workflow.

## Repository Hygiene

The repo includes maintainer intake files that match PCF's own review-readiness standard:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [LICENSE](LICENSE)
- GitHub issue templates for bugs, false positives, false negatives, repository context misses, and feature requests
- A pull request template that requires problem, change, risk, verification, and dry-run guardrails

Run `npm run repo:verify` to check that these files still include the required maintainer evidence, security posture, non-claim guardrails, and issue/PR intake fields. The CI workflow runs this verifier before syntax, tests, benchmark, red-test, and maintainer demo gates.

## API

Local endpoints:

- `GET /api/spec`
- `GET /api/benchmark`
- `POST /api/evaluate`
- `POST /api/evaluate-patch`
- `POST /api/evaluate-batch`
- `POST /api/github/queue`
- `GET /api/github/setup`
- `GET /api/github/setup/guide`
- `POST /api/github/test-connection`
- `GET /api/queue/history`
- `POST /api/feedback`
- `GET /api/feedback`
- `GET /api/feedback/summary`
- `GET /api/feedback/calibration`
- `GET /api/feedback/export`
- `GET /api/feedback/candidates`
- `POST /api/feedback/candidates/apply`
- `GET /api/feedback/candidates/replay`
- `GET /api/feedback/candidates/export`
- `POST /api/feedback/candidates/compare`
- `GET /api/repositories/:owner/:repo/queue`
- `POST /webhook/github`

See [`docs/API.md`](docs/API.md) for payloads, response contracts, and curl examples.

## CLI

```bash
node src/cli.mjs setup --repository owner/repo
node src/cli.mjs evaluate fixtures/pr-unready.json
node src/cli.mjs evaluate fixtures/pr-ready.json --format markdown
node src/cli.mjs evaluate fixtures/issue-unready.json --format json
node src/cli.mjs evaluate fixtures/pr-kernel-ready.json --profile kernel-grade
node src/cli.mjs evaluate fixtures/pr-policy-ready.json --format markdown
node src/cli.mjs evaluate-patch fixtures/patch-kernel-ready.patch --format json
node src/cli.mjs evaluate-patch series.mbox --policy policy-files.json
```

`--policy` accepts a JSON array of objects shaped like:

```json
[
  {
    "path": "CONTRIBUTING.md",
    "content": "Every PR must link an issue and include tests."
  },
  {
    "path": "CODEOWNERS",
    "content": "/src/core/ @maintainers/core"
  }
]
```

## Profiles

`standard` is the default profile for GitHub projects. It checks whether a PR or issue has enough context, scope control, verification, and repair guidance to deserve maintainer attention.

`kernel-grade` is stricter. It is inspired by the Linux kernel's public contribution process, not endorsed by the kernel project. It checks:

- subsystem-prefixed patch subject under 75 characters
- human `Signed-off-by` / DCO accountability
- problem, reachability, impact, and correctness rationale
- `Fixes:` and stable-tree discipline for bug fixes
- maintainer/list targeting evidence
- build, style/static-analysis, and runtime-test evidence
- transparent `Assisted-by` provenance when meaningful tool-generated content is involved
- patch-series structure and maintainer review-budget risk

Source basis:

- https://docs.kernel.org/process/submitting-patches.html
- https://docs.kernel.org/process/submit-checklist.html
- https://docs.kernel.org/dev-tools/checkpatch.html
- https://docs.kernel.org/process/stable-kernel-rules.html
- https://docs.kernel.org/process/generated-content.html
- https://docs.kernel.org/process/coding-assistants.html

## Repository Policy Ingestion

Payloads may include `repositoryFiles` or `policyFiles`:

```json
{
  "repositoryFiles": [
    { "path": ".github/pull_request_template.md", "content": "## Description\n## Tests" },
    { "path": "package.json", "content": "{\"scripts\":{\"test\":\"node --test\"}}" }
  ]
}
```

The evaluator reports the inferred policy profile in `policyProfile`, including sources, required template sections, discovered test commands, and owner/maintainer matches for touched files.

## Repository Context

Payloads may also include `repositoryContext` so the evaluator can surface already-known work before a maintainer spends time:

```json
{
  "repositoryContext": {
    "repository": "owner/repo",
    "issues": [
      { "number": 41, "title": "Dry-run labels are missing", "body": "Labels are omitted from dry-run output.", "state": "open", "labels": ["bug"] }
    ],
    "pullRequests": [
      { "number": 77, "title": "webhook: expose dry-run labels", "state": "open", "files": ["src/github/templates.mjs"] }
    ],
    "upstream": {
      "repository": "upstream/repo",
      "pullRequests": [
        { "number": 300, "title": "webhook: include dry-run labels", "state": "merged", "files": ["src/github/templates.mjs"] }
      ]
    }
  }
}
```

Context findings add maintainer-facing labels such as `possibly-duplicate`, `possibly-solved`, `linked-issue-closed`, `concurrent-work`, and `possibly-upstream-fixed`. Webhook mode can collect this read-only context from GitHub search when `PCF_COLLECT_REPOSITORY_CONTEXT` is enabled.

## Maintainer Queue

The queue layer turns single evaluations into an operational triage surface. It can run entirely from supplied JSON fixtures or collect open GitHub PRs/issues through read-only API calls:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/queue-sample.json \
  http://127.0.0.1:3791/api/github/queue

curl 'http://127.0.0.1:3791/api/repositories/owner/repo/queue?limit=25&upstream=upstream-owner/upstream-repo'

node src/cli.mjs queue fixtures/queue-sample.json
```

Queue items are grouped into:

- `review-now` for `ready-for-maintainer`
- `send-repair-request` for `needs-repair`
- `do-not-review-yet` for `low-review-value`

Each item also includes a `nextAction` object that explains who can usefully act next and why. See [`docs/NEXT_ACTOR_MODEL.md`](docs/NEXT_ACTOR_MODEL.md) for the full next-actor model and precedence rules.

- `ask-reporter-for-evidence`: send the item back to the submitter for missing evidence.
- `check-duplicate-or-fixed-first`: check related, duplicate, concurrent, solved, or upstream-fixed work before spending fresh review time.
- `route-to-subsystem-or-process`: route through repository ownership, subsystem, policy, or contribution process.
- `needs-maintainer-decision`: make a judgment call because PCF cannot reduce the item to reporter evidence, context lookup, routing, or waiting.
- `not-actionable-yet`: wait because the item is parked, pending, draft, or otherwise blocked on external state.

The rule of thumb is that higher-cost maintainer-side signals beat generic reporter evidence: context lookup, repository routing, wait-state labels, and maintainer-owned work should not be hidden behind "please add logs."

The response includes per-item top reasons, labels, repository-context summaries, review-budget estimates, sub-action counts, dry-run response drafts, the full underlying evaluation, lane groups, and markdown suitable for a maintainer report. GitHub queue collection is dry-run/read-only; comment and label writes still require explicit webhook write configuration.

What a maintainer sees:

```json
{
  "summary": {
    "total": 3,
    "nextActions": {
      "review-now": 1,
      "check-duplicate-or-fixed-first": 1,
      "ask-reporter-for-evidence": 1
    },
    "nextActionOwners": {
      "maintainer": 2,
      "reporter": 1
    }
  },
  "nextActionGroups": [
    {
      "id": "check-duplicate-or-fixed-first",
      "owner": "maintainer",
      "maintainerAction": "Check related, solved, concurrent, or upstream-fixed work before fresh review.",
      "count": 1,
      "itemIds": ["pr-context-duplicate"]
    }
  ],
  "items": [
    {
      "id": "pr-context-duplicate",
      "action": "send-repair-request",
      "nextAction": {
        "id": "check-duplicate-or-fixed-first",
        "owner": "maintainer",
        "maintainerAction": "Check related, solved, concurrent, or upstream-fixed work before fresh review.",
        "reason": "Repository context label: possibly-duplicate.",
        "evidence": {
          "labels": ["possibly-duplicate", "concurrent-work", "possibly-upstream-fixed"]
        }
      },
      "responseTemplate": {
        "title": "Duplicate or fixed-first check",
        "audience": "maintainer",
        "channel": "maintainer-note",
        "dryRun": true,
        "posting": "disabled",
        "shouldPost": false,
        "body": "PCF dry-run triage for pull_request #13: check related or already-fixed work before fresh review..."
      }
    }
  ]
}
```

## Pilot Mode

Pilot mode is for maintainers who want to try PCF safely before letting it comment or label anything.

The shortest path is the guided pilot command:

```bash
npm run setup:pilot -- --repository owner/repo
```

That prints the GitHub App registration checklist, read-only permission list, webhook event list, safe `.env` values, local server commands, and first dry-run queue commands. It redacts configured secrets and keeps `PCF_DRY_RUN=true`, `PCF_POST_COMMENTS=false`, and `PCF_APPLY_LABELS=false`.

For a live read-only shadow pilot against a public repository:

```bash
npm run pilot:public -- --repository owner/repo --limit 10
npm run pilot:public:markdown -- --repository owner/repo --limit 10 --write public-pilot.md
npm run pilot:public -- --repository owner/repo --limit 10 --capture /tmp/pcf-owner-repo-capture.json
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --write /tmp/pcf-owner-repo-replay.md
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --bundle /tmp/pcf-owner-repo-export.md
npm run pilot:scout -- --repository owner/repo --limit 10 --write /tmp/pcf-owner-repo-scout.md
npm run scout:serious -- --write /tmp/pcf-serious-scout.md
npm run pilot:watch -- --config config/watchlist.json --write /tmp/pcf-watchlist.md
```

The public pilot artifact leads with `review-now` versus `send-repair-request`, breaks non-ready work into `nextAction` buckets, preserves repository-context findings such as duplicates, concurrent work, and upstream fixes, and records collection errors. `--capture` writes the normalized queue payload that PCF actually evaluated so future before/after comparisons can replay the same input with `--fixture` instead of depending on a live queue that may have changed. Captures include third-party issue/PR bodies and repository-context results; keep them private and do not commit them without maintainer consent. Set `GITHUB_TOKEN` or `GH_TOKEN` to a public-read token for larger pilots or repeated search-heavy runs; the guide reports only whether a token is configured and never returns the token value. PCF spaces GitHub search calls with `PCF_GITHUB_SEARCH_DELAY_MS` so multi-repo pilots do not collapse into secondary rate-limit noise.

`npm run pilot:scout` is the contributor-scouting path. It runs the issue queue only, keeps the read-only/no-write posture, and adds `--contributor-preflight` so each `review-now` issue candidate is checked for exact open PR ownership signals such as an open PR body that references `#123`. A blocked result means another PR path needs inspection before cloning or coding. A candidate result is not permission to code; contribution policy and current-upstream behavior still need separate gates.

`npm run scout:serious` is the broad GitHub-search path for finding serious upstream contribution leads outside a curated watchlist. It ranks open issue-search results by impact, reproduction evidence, scope, and maintainer signal, then blocks or down-ranks cosmetic/docs-only work, feature requests, duplicates, stale labels, assigned issues, and thin reports. `PROMOTE` additionally requires explicit complete collection integrity; requested open-PR overlap must be complete for every promotable row. It is documented in [docs/SERIOUS_SCOUT.md](docs/SERIOUS_SCOUT.md). A serious-scout candidate is permission to spend preflight time, not permission to code.

`npm run pilot:watch` runs that same scout path across a curated watchlist and produces one contribution-radar report. It is documented in [docs/WATCHLIST.md](docs/WATCHLIST.md). Watchlist mode does not search all of GitHub, clone repositories, write patches, open pull requests, or contact maintainers.

`--bundle` writes a maintainer export bundle: queue markdown, copyable response drafts, SHA-256 hashes for the proof surfaces and replay payload, exact rerun/replay commands, non-claims, and optional before/after movement when paired with `--baseline previous-proof-or-capture.json`. The bundle is designed for a GitHub issue, README, or private maintainer handoff without publishing raw replay captures.

The same guide is available from the API once the local server is running:

```bash
curl 'http://127.0.0.1:3791/api/github/setup/guide?repository=owner/repo'
curl 'http://127.0.0.1:3791/api/github/setup/guide?repository=owner/repo&format=markdown'
```

The recommended pilot App settings are:

- GitHub App name: `Premature Contribution Firewall - owner/repo`
- Webhook URL: a public HTTPS tunnel or deployment URL ending in `/webhook/github`
- Webhook secret: the same value as `PCF_WEBHOOK_SECRET`
- Repository permissions: Metadata read-only, Issues read-only, Pull requests read-only, Contents read-only
- Webhook events: `issues` and `pull_request`
- Install scope: only the pilot repository

```bash
curl http://127.0.0.1:3791/api/github/setup

curl -s \
  -H 'Content-Type: application/json' \
  --data '{"owner":"octocat","repo":"Hello-World"}' \
  http://127.0.0.1:3791/api/github/test-connection

curl http://127.0.0.1:3791/api/queue/history
```

The setup endpoint reports only booleans and safe metadata. It does not return webhook secrets, private keys, tokens, or secret values. It now includes a ten-minute pilot plan: run proof gates, start the local server, check setup posture, test read-only repository access, run a dry-run queue, and inspect feedback calibration. Queue history is stored locally under `data/queue-history.json` by default and is ignored by git.

History tracks:

- latest ready / repair / low-value counts
- total estimated review budget
- improved, regressed, unchanged, new, and gone queue items between runs
- compact per-item status, action, next action, score, labels, budget, and context-finding counts

## Maintainer Feedback Calibration

Feedback capture is an evidence loop, not a model-training claim. It records explicit maintainer corrections, exports replayable candidates, and builds an auditable calibration profile that future evaluations and queues can consult.

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{
    "repository": "owner/repo",
    "item": {
      "kind": "pull_request",
      "number": 12,
      "title": "webhook: include dry-run labels",
      "status": "needs-repair",
      "action": "send-repair-request",
      "nextAction": {
        "id": "check-duplicate-or-fixed-first",
        "target": "maintainer"
      },
      "score": 82
    },
    "verdict": "too-harsh",
    "expectedStatus": "ready-for-maintainer",
    "note": "Maintainer would review this now.",
    "shouldBecomeFixture": true
  }' \
  http://127.0.0.1:3791/api/feedback

curl http://127.0.0.1:3791/api/feedback/summary
curl http://127.0.0.1:3791/api/feedback/calibration
curl http://127.0.0.1:3791/api/feedback/export
curl http://127.0.0.1:3791/api/feedback/candidates
curl http://127.0.0.1:3791/api/feedback/candidates/replay
curl http://127.0.0.1:3791/api/feedback/candidates/export
```

Feedback entries are stored locally under `data/feedback.json` by default and are ignored by git. Each entry includes a compact case file with the PCF status, maintainer verdict, expected status, top reasons, context summary, recommended next action, and whether it should become a regression candidate.

The calibration endpoint combines feedback entries with promoted local candidates. When a new evaluation resembles a correction or candidate by repository, item, title, touched files, labels, kind, and profile, PCF adds a `calibration` object to the evaluation and queue item. If the matched maintainer expectation conflicts with the current heuristic status, PCF adds `feedback-calibration-needed` and a repair note for the maintainer to compare the evidence. The original status and score remain visible.

Regression export is intentionally conservative. When the original payload is available, PCF exports a benchmark-compatible fixture draft with an expected status and a current replay result. When only compact queue evidence is available, the export keeps `needsManualFixtureInput=true` until a maintainer or developer attaches the original PR, issue, or patch payload.

Payload-backed export also redacts obvious secret-like strings before storing or exporting a fixture draft. The point is to keep the regression useful without preserving real credentials.

Applying candidates is explicit:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{"caseIds":["feedback-example-id"]}' \
  http://127.0.0.1:3791/api/feedback/candidates/apply
```

Applied candidates are stored locally under `data/feedback-candidates.json` by default, ignored by git, and kept separate from the permanent benchmark corpus. Duplicate fixture ids are not appended twice. Replay results show which promoted feedback fixtures still pass and which are breaking under the current evaluator.

Candidate evidence export is read-only:

```bash
curl http://127.0.0.1:3791/api/feedback/candidates/export
curl 'http://127.0.0.1:3791/api/feedback/candidates/export?format=markdown'
```

The JSON response includes a README/PR-ready markdown report plus a fixture bundle that can be reviewed before any permanent benchmark change. The markdown response is useful for release notes or a pull request description. Neither export includes local corpus file paths.

Replay compare is for policy edits:

```bash
baseline=$(curl -s http://127.0.0.1:3791/api/feedback/candidates/replay)
curl -s \
  -H 'Content-Type: application/json' \
  --data "{\"baselineReplay\":$baseline}" \
  http://127.0.0.1:3791/api/feedback/candidates/compare
```

The browser keeps comparison baselines in localStorage only. The server receives the caller-supplied baseline and compares it with the current candidate replay, returning improved, regressed, changed, unchanged, new, and gone candidate rows plus markdown review residue.

## Patch And Mbox Evaluation

Plain-text patch evaluation accepts `git format-patch` output or simple mbox-style messages:

```bash
node src/cli.mjs evaluate-patch fixtures/patch-kernel-ready.patch --format markdown
```

The local API also accepts:

```text
POST /api/evaluate-patch
```

with JSON shaped like:

```json
{
  "text": "From ...\nSubject: [PATCH 1/1] subsystem: change summary\n...",
  "profile": "kernel-grade",
  "repositoryFiles": []
}
```

## GitHub Webhook

Set the values in `.env` or the process environment:

```bash
PCF_WEBHOOK_SECRET=...
PCF_DRY_RUN=true
PCF_POST_COMMENTS=false
PCF_APPLY_LABELS=false
PCF_COLLECT_REPOSITORY_CONTEXT=true
PCF_UPSTREAM_REPOSITORY=upstream-owner/upstream-repo
PCF_GITHUB_QUEUE_LIMIT=25
PCF_GITHUB_CACHE_TTL_MS=60000
PCF_GITHUB_SEARCH_DELAY_MS=3000
PCF_GITHUB_RATE_LIMIT_RETRIES=2
PCF_GITHUB_RATE_LIMIT_FALLBACK_MS=60000
PCF_GITHUB_RATE_LIMIT_MAX_WAIT_MS=300000
PCF_QUEUE_HISTORY_ENABLED=true
PCF_QUEUE_HISTORY_PATH=
PCF_QUEUE_HISTORY_LIMIT=50
```

Point a GitHub App webhook at:

```text
POST /webhook/github
```

Supported events in this MVP:

- `pull_request`
- `issues`

Dry-run mode logs and returns the comment and labels that would be applied. To post comments or labels, install a GitHub App with issue/PR write access, set `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_PATH`, and explicitly set `PCF_POST_COMMENTS=true` or `PCF_APPLY_LABELS=true`.

## Design Rule

Premature Contribution Firewall judges contribution quality, not authorship. A bad PR is bad whether it came from a human, an AI tool, or both. A good PR still needs reproducible evidence and human accountability.
