# Premature Contribution Firewall API

Premature Contribution Firewall exposes a small local HTTP API for maintainers, bots, CI jobs, and GitHub App/webhook integrations.

The API is deterministic and dry-run safe by default. It judges contribution readiness, not authorship.

## GitHub Action Wrapper

For maintainers who do not want to run a local server first, the root `action.yml` wraps the public pilot runner as a read-only GitHub Action:

```yaml
permissions:
  contents: read
  issues: read
  pull-requests: read

steps:
  - uses: VrtxOmega/premature-contribution-firewall@v0.1.3
    with:
      github-token: ${{ github.token }}
      limit: 25
```

The action writes `pcf-queue.md` by default and forces `PCF_DRY_RUN=true`, `PCF_POST_COMMENTS=false`, and `PCF_APPLY_LABELS=false`. Full usage is documented in [GITHUB_ACTION.md](GITHUB_ACTION.md).

## Health

```bash
curl http://127.0.0.1:3791/api/health
```

Returns the service state and whether GitHub comment/label writes are enabled.

## API Spec

```bash
curl http://127.0.0.1:3791/api/spec
```

Returns endpoint descriptions, supported profiles, schema hints, and request limits.

## Evaluate One PR Or Issue

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/pr-policy-ready.json \
  http://127.0.0.1:3791/api/evaluate
```

Payload shape:

```json
{
  "kind": "pull_request",
  "profile": "standard",
  "title": "core: enforce repository policy checks",
  "body": "Fixes #80.\n\nVerification: npm test passed locally.",
  "files": [
    { "filename": "src/core/evaluator.mjs", "additions": 48, "deletions": 12 }
  ],
  "checks": [
    { "name": "test", "conclusion": "success" }
  ],
  "repositoryFiles": [
    { "path": "CONTRIBUTING.md", "content": "Every pull request must include tests." }
  ],
  "repositoryContext": {
    "repository": "owner/repo",
    "issues": [
      { "number": 41, "title": "Dry-run labels missing", "body": "Labels are omitted.", "state": "open", "labels": ["bug"] }
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

## Evaluate Patch Or Mbox Text

```bash
node -e "const fs=require('node:fs'); const text=fs.readFileSync('fixtures/patch-kernel-ready.patch','utf8'); fetch('http://127.0.0.1:3791/api/evaluate-patch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))"
```

Patch evaluation defaults to `kernel-grade`.

## Evaluate A Batch

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{
    "items": [
      { "id": "ready", "input": { "kind": "pull_request", "title": "webhook: reject oversized payload bodies", "body": "Fixes #42.\n\nProblem: oversized payloads.\n\nVerification: npm test.", "files": [], "checks": [{ "conclusion": "success" }] } },
      { "id": "patch", "text": "From 1111111111111111111111111111111111111111 Mon Sep 17 00:00:00 2001\nSubject: [PATCH] fix stuff\n\nAI generated this.\n" }
    ]
  }' \
  http://127.0.0.1:3791/api/evaluate-batch
```

Batch requests require `items` to be an array and accept up to 100 items. Malformed containers fail closed with `ok=false` instead of silently evaluating zero items. Each item returns its own `ok`, `status`, `score`, `labels`, `profile`, and full `evaluation`.

## Repository Context

`repositoryContext` is optional and deterministic. It lets callers provide repository search results without requiring the evaluator itself to make a network request.

Supported fields:

- `issues`: local issues with `number`, `title`, `body`, `state`, `labels`, `htmlUrl`
- `pullRequests`: local PRs with `number`, `title`, `body`, `state`, `files`, `htmlUrl`
- `upstream`: upstream `repository`, `issues`, `pullRequests`, `commits`, and `releases`

When context is present, results include `repositoryContext` with summarized findings. Labels may include `possibly-duplicate`, `possibly-solved`, `linked-issue-closed`, `concurrent-work`, `possibly-upstream-fixed`, or `repo-context-unavailable`.

Webhook mode can collect repository context through read-only GitHub search when `PCF_COLLECT_REPOSITORY_CONTEXT=true`. Set `PCF_UPSTREAM_REPOSITORY=owner/repo` to also search an upstream project.

## Maintainer Queue

The queue endpoint evaluates a batch of open work and returns a maintainer triage view with status counts, labels, repair sub-actions, review-budget totals, repository-context findings, queue actions, next-actor ownership, and markdown export.

For deterministic/local use, supply `items` directly:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data-binary @fixtures/queue-sample.json \
  http://127.0.0.1:3791/api/github/queue
```

For read-only GitHub ingestion, supply a repository. This performs no writes:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{
    "owner": "owner",
    "repo": "repo",
    "upstreamRepository": "upstream-owner/upstream-repo",
    "limit": 25,
    "includePullRequests": true,
    "includeIssues": true
  }' \
  http://127.0.0.1:3791/api/github/queue
```

Equivalent GET form:

```bash
curl 'http://127.0.0.1:3791/api/repositories/owner/repo/queue?limit=25&upstream=upstream-owner/upstream-repo'
```

Queue responses are shaped as:

```json
{
  "ok": true,
  "dryRun": true,
  "collectionErrors": [],
  "queue": {
    "repository": "owner/repo",
    "source": "github-api",
    "summary": {
      "total": 3,
      "statuses": {
        "ready-for-maintainer": 1,
        "needs-repair": 1,
        "low-review-value": 1
      },
      "contextFindings": 3,
      "nextActions": {
        "review-now": 1,
        "check-duplicate-or-fixed-first": 1,
        "ask-reporter-for-evidence": 1
      },
      "nextActionOwners": {
        "maintainer": 2,
        "reporter": 1
      },
      "repairSubActions": {
        "check-duplicate-or-fixed-first": 1,
        "ask-reporter-for-evidence": 1
      },
      "reviewBudgetMinutes": 55
    },
    "nextActionGroups": [
      {
        "id": "check-duplicate-or-fixed-first",
        "title": "Check duplicate or fixed first",
        "owner": "maintainer",
        "maintainerAction": "Check related, solved, concurrent, or upstream-fixed work before fresh review.",
        "count": 1,
        "itemIds": ["pr-context-duplicate"]
      }
    ],
    "items": [
      {
        "kind": "pull_request",
        "number": 12,
        "status": "ready-for-maintainer",
        "action": "review-now",
        "nextAction": {
          "id": "review-now",
          "title": "Review now",
          "target": "maintainer",
          "owner": "maintainer",
          "summary": "Ready for maintainer review.",
          "maintainerAction": "Start normal review now.",
          "reason": "Ready for maintainer review.",
          "evidence": {
            "labels": ["ready-for-maintainer"],
            "checks": [],
            "reasons": ["Coarse queue action is review-now.", "Ready for maintainer review."]
          }
        },
        "score": 100,
        "labels": ["ready-for-maintainer"],
        "topReasons": [],
        "responseTemplate": {
          "id": "review-now",
          "title": "Review-now maintainer note",
          "audience": "maintainer",
          "channel": "maintainer-note",
          "dryRun": true,
          "posting": "disabled",
          "shouldPost": false,
          "body": "PCF dry-run triage for pull_request #12: ready for maintainer review..."
        }
      }
    ],
    "markdown": "# Premature Contribution Firewall Maintainer Queue\n..."
  }
}
```

Queue actions remain the coarse compatibility values `review-now`, `send-repair-request`, and `do-not-review-yet`. `nextAction.id` refines the queue by next actor: `review-now`, `ask-reporter-for-evidence`, `check-duplicate-or-fixed-first`, `route-to-subsystem-or-process`, `needs-maintainer-decision`, or `not-actionable-yet`. Each `nextAction` also includes `owner`, `maintainerAction`, `reason`, and evidence arrays so API and CLI consumers can show who owns the next move, why PCF chose that actor, and what label/check evidence caused the route. Each queue item also carries a `responseTemplate`: a deterministic dry-run draft with `dryRun=true`, `posting=disabled`, and `shouldPost=false`. Reporter-owned lanes get a repair-request draft; maintainer-owned lanes get internal notes for review, duplicate checks, routing, decision, or parked-state handling. `nextActionGroups` gives the same contract at queue-lane level for UI grouping and dashboards. The precedence model is documented in [NEXT_ACTOR_MODEL.md](NEXT_ACTOR_MODEL.md): repository context, repository routing, wait-state labels, and maintainer-owned work are not hidden behind generic reporter-evidence requests. Live GitHub collection uses read-only API calls and a short in-memory cache; comments and labels are still controlled only by the explicit webhook write settings.

For maintainer handoff, the public pilot CLI can write a single export bundle:

```bash
npm run pilot:public -- --repository owner/repo --limit 10 --capture /tmp/pcf-owner-repo-capture.json
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --bundle /tmp/pcf-owner-repo-export.md
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --baseline /tmp/pcf-owner-repo-before.json --bundle /tmp/pcf-owner-repo-after.md
npm run pilot:scout -- --repository owner/repo --limit 10 --write /tmp/pcf-owner-repo-scout.md
npm run pilot:watch -- --config config/watchlist.json --write /tmp/pcf-watchlist.md
```

The bundle contains queue markdown, copyable response drafts, proof/replay SHA-256 hashes, exact rerun commands, non-claims, and before/after movement when a previous proof or replay capture is supplied with `--baseline`. It does not include secret values and should not be used to publish raw third-party replay captures without consent.

For contributor scouting, `npm run pilot:scout` is shorthand for a read-only issue queue plus `--contributor-preflight`. The preflight only runs on `review-now` issue candidates. It checks for exact open PR ownership signals, including open PR bodies or titles that reference the candidate issue number. The output adds a `contributorPreflight` object with `blocked`, `candidate`, and `unchecked` counts. A `candidate` result means no exact open PR overlap was found by this gate; it does not replace contribution policy checks, current-upstream behavior verification, or maintainer judgment.

For repeated scouting, `npm run pilot:watch` reads [config/watchlist.json](../config/watchlist.json), runs the issue-only scout path for each enabled repository, and emits a single `pcf-watchlist-report` artifact with repository summaries and candidate rows. It is a curated radar, not repository discovery. It never clones repositories, writes patches, opens pull requests, posts comments, applies labels, or contacts maintainers.

## GitHub App Setup

```bash
curl http://127.0.0.1:3791/api/github/setup
```

This returns sanitized pilot readiness:

- `mode`: `dry-run`, `read-only`, or `write-armed`
- `safety`: whether writes are requested, armed, and actually ready
- `github`: GitHub App/webhook booleans and queue settings without secret values
- `history`: local queue-history status
- `pilot`: ten-minute dry-run pilot steps, safe defaults, and blockers without secret values
- `checklist`: setup checks for the browser UI
- `warnings`: actionable setup warnings

The response intentionally does not include webhook secrets, private keys, installation tokens, or API tokens.

## Guided Pilot Setup

```bash
curl 'http://127.0.0.1:3791/api/github/setup/guide?repository=owner/repo'
curl 'http://127.0.0.1:3791/api/github/setup/guide?repository=owner/repo&format=markdown'
```

The guided setup endpoint is the API version of `npm run setup:pilot -- --repository owner/repo`. It returns:

- exact GitHub App registration fields
- read-only repository permissions for a pilot install
- webhook events and webhook URL guidance
- safe `.env` values with secrets redacted
- local start commands
- first dry-run proof commands for setup status, read-only connection testing, fixture queue, and repository queue
- exit criteria for deciding whether the pilot is ready to show a maintainer

The guide keeps writes disabled by default. It never returns configured webhook secrets, private key contents, installation tokens, or GitHub API tokens.

## Test Read-Only Connection

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{"owner":"octocat","repo":"Hello-World"}' \
  http://127.0.0.1:3791/api/github/test-connection
```

The connection test performs a read-only repository fetch and returns setup status plus connection metadata. It never posts comments, applies labels, or mutates GitHub state.

## Queue History

```bash
curl http://127.0.0.1:3791/api/queue/history
curl 'http://127.0.0.1:3791/api/queue/history?repository=owner/repo&limit=10'
```

Queue history is recorded after queue runs when `PCF_QUEUE_HISTORY_ENABLED=true`. The default path is `data/queue-history.json`.

History entries contain compact queue data:

- summary counts for ready, repair, and low-value work
- review-budget totals
- collection errors
- compact item records, including coarse `action` and refined `nextAction`
- transition counts and item transitions: `improved`, `regressed`, `unchanged`, `new`, and `gone`

## Maintainer Feedback

Feedback endpoints store maintainer corrections locally. They are meant to make the tool auditable and improve future benchmark coverage; they do not perform GitHub writes or automatic model training.

Record feedback:

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
      "score": 82,
      "labels": ["needs-repair"],
      "contextSummary": "1 concurrent pull request found"
    },
    "verdict": "too-harsh",
    "expectedStatus": "ready-for-maintainer",
    "note": "Maintainer had enough evidence to review this now.",
    "originalPayload": {
      "kind": "pull_request",
      "title": "webhook: include dry-run labels",
      "body": "Problem: labels are missing.\nVerification: npm test passed locally.",
      "files": [{ "filename": "src/server.mjs", "additions": 12, "deletions": 3 }],
      "checks": [{ "name": "test", "conclusion": "success" }]
    },
    "shouldBecomeFixture": true
  }' \
  http://127.0.0.1:3791/api/feedback
```

Supported verdicts:

- `correct`
- `false-positive`
- `false-negative`
- `too-harsh`
- `too-lenient`
- `missed-duplicate`
- `missed-upstream-fix`
- `missed-concurrent-work`
- `needs-human-review`

Read feedback:

```bash
curl http://127.0.0.1:3791/api/feedback
curl 'http://127.0.0.1:3791/api/feedback?repository=owner/repo&limit=10'
curl http://127.0.0.1:3791/api/feedback/summary
curl http://127.0.0.1:3791/api/feedback/calibration
```

`GET /api/feedback/calibration` builds the local calibration profile from maintainer feedback and promoted candidate fixtures. It returns summary counts, correction pressure, candidate replay health, compact feedback entries, and compact candidate fingerprints. Evaluations and maintainer queues can attach this calibration profile so close matches are visible on future triage. When a matched maintainer expectation conflicts with the current heuristic result, the evaluation keeps its original status and score but adds `feedback-calibration-needed`, a calibration summary, matched evidence, and a maintainer review step.

Export regression candidates:

```bash
curl http://127.0.0.1:3791/api/feedback/export
```

The export is intentionally a candidate list, not an automatic change to the permanent benchmark corpus. When feedback includes `originalPayload`, cases include:

- `runnableFixture=true`
- `fixture`: a benchmark-compatible draft with `input` or `patchText` plus `expect`
- `replay`: the current evaluator status, score, labels, and whether it already passes the maintainer expectation

When feedback lacks the original payload, cases keep `needsManualFixtureInput=true`. Obvious secret-like values in supplied payloads are redacted before storage/export so real credentials are not preserved in local regression material.

Promote selected runnable drafts into the local candidate corpus:

```bash
curl -s \
  -H 'Content-Type: application/json' \
  --data '{"caseIds":["feedback-example-id"]}' \
  http://127.0.0.1:3791/api/feedback/candidates/apply
```

Read and replay promoted candidates:

```bash
curl http://127.0.0.1:3791/api/feedback/candidates
curl http://127.0.0.1:3791/api/feedback/candidates/replay
```

The candidate corpus is stored separately from the permanent benchmark corpus. `POST /api/feedback/candidates/apply` requires `caseIds` unless `applyAllRunnable=true` is supplied. Duplicate fixture ids are skipped instead of appended again. Replay results include pass/fail state, current status, score, labels, and failure residue for every promoted candidate.

Export shareable candidate evidence:

```bash
curl http://127.0.0.1:3791/api/feedback/candidates/export
curl 'http://127.0.0.1:3791/api/feedback/candidates/export?format=markdown'
```

The JSON export returns `summary`, `markdown`, `fixtureBundle`, and `replay`. The markdown format returns the same README/PR-ready evidence text as `text/markdown`. This export is read-only and omits local candidate-corpus paths.

Compare a baseline replay with the current replay:

```bash
baseline=$(curl -s http://127.0.0.1:3791/api/feedback/candidates/replay)
curl -s \
  -H 'Content-Type: application/json' \
  --data "{\"baselineReplay\":$baseline}" \
  http://127.0.0.1:3791/api/feedback/candidates/compare
```

The compare endpoint does not store baselines. The caller supplies `baselineReplay`, and PCF replays the current candidate corpus before returning transition counts, per-candidate rows, and markdown review residue. Transitions are `improved`, `regressed`, `changed`, `unchanged`, `new`, and `gone`.

## Benchmark

```bash
curl http://127.0.0.1:3791/api/benchmark
curl 'http://127.0.0.1:3791/api/benchmark?cases=false'
```

The benchmark endpoint runs the same deterministic corpus used by `npm run benchmark`.

## Response Contract

Every successful evaluation returns:

- `status`: `ready-for-maintainer`, `needs-repair`, or `low-review-value`
- `score`: 0-100
- `labels`: maintainer-facing labels
- `repairSteps`: contributor-facing repairs
- `checks`: pass/warn/fail check details
- `reviewBudget`: estimated maintainer review time
- `provenance`: sign-off/tool-use/accountability signals
- `policyProfile`: repository policy source and routing signals
- `repositoryContext`: similar, duplicate, concurrent, solved, and upstream-fixed findings
- `calibration`: local feedback/candidate evidence that matched the submission when feedback calibration is active
- `patchSeries`: patch/mbox metadata when applicable
- `comment`: markdown maintainer comment
