# GitHub Action Dry-Run Pilot

The root `action.yml` runs PCF as a read-only GitHub Action. It builds a markdown maintainer queue artifact and does not post comments, apply labels, merge pull requests, close issues, or mutate GitHub state.

## Minimal Workflow

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
        uses: VrtxOmega/premature-contribution-firewall@v0.1.0
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

## Options

```yaml
- uses: VrtxOmega/premature-contribution-firewall@v0.1.0
  with:
    repository: owner/repo
    github-token: ${{ github.token }}
    limit: 25
    include-pull-requests: true
    include-issues: true
    upstream-repository: upstream-owner/upstream-repo
    output: pcf-queue.md
```

`repository` defaults to the workflow repository. For a public repo outside the workflow repository, pass a token that can read that target or expect GitHub API rate limits to reduce repository-context coverage.

## Safety Contract

The action forces:

- `PCF_DRY_RUN=true`
- `PCF_POST_COMMENTS=false`
- `PCF_APPLY_LABELS=false`
- `PCF_COLLECT_REPOSITORY_CONTEXT=true`

The action calls `scripts/run-public-pilot.mjs` and writes a markdown artifact to the workflow workspace. Treat that artifact as a first triage map, not an automatic maintainer decision.

For a concrete output example before installing anything, inspect the canonical dogfood artifact: [MAINTAINER_EXPORT_SAMPLE.md](MAINTAINER_EXPORT_SAMPLE.md). It was generated from PCF's own public queue and includes the queue markdown, response drafts, artifact hashes, rerun commands, safety posture, and non-claims without committing the private replay capture.

For the maintainer-facing release note, see [RELEASE_POST_V0_1_0.md](RELEASE_POST_V0_1_0.md).
