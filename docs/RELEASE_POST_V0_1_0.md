# PCF v0.1.0: Read-Only Maintainer Queue Pilot

Premature Contribution Firewall v0.1.0 is a read-only pilot for maintainers who are drowning in public GitHub issues and pull requests.

It is not an AI-authorship detector. It does not try to guess who or what wrote a contribution. It asks the maintainer question that matters:

Is this contribution reviewable, reproducible, scoped, tested, and worth human attention right now?

## Try It Without Granting Write Access

The lowest-friction path is a manual GitHub Action run. It uses read-only permissions and uploads one markdown queue artifact.

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

That run forces dry-run mode:

- `PCF_DRY_RUN=true`
- `PCF_POST_COMMENTS=false`
- `PCF_APPLY_LABELS=false`
- `PCF_COLLECT_REPOSITORY_CONTEXT=true`

PCF does not comment, label, close, merge, or mutate GitHub state in this pilot path.

Full Action usage: [docs/GITHUB_ACTION.md](https://github.com/VrtxOmega/premature-contribution-firewall/blob/main/docs/GITHUB_ACTION.md)

## What The Artifact Gives You

The queue is sorted by maintainer action, not by blame:

| Lane | Who acts next | Maintainer move |
| --- | --- | --- |
| `review-now` | maintainer | Start normal review now. |
| `ask-reporter-for-evidence` | reporter | Send a focused repair request. |
| `check-duplicate-or-fixed-first` | maintainer | Check duplicate, solved, concurrent, or upstream-fixed work first. |
| `route-to-subsystem-or-process` | maintainer/process | Move it to the right owner, template, repo, or process. |
| `needs-maintainer-decision` | maintainer | Make the judgment call without pretending the reporter can fix it. |
| `not-actionable-yet` | external state | Wait for release, stale-state cleanup, upstream answer, or another missing event. |

Each item includes the route reason, next actor, maintainer action, top labels/checks, repository-context summary, review-budget estimate, and a dry-run response draft. Reporter-owned lanes get a copyable repair-request draft; maintainer-owned lanes get an internal note.

## Inspect A Real Sample First

Before installing anything, inspect the canonical dogfood artifact generated from PCF's own public queue:

[docs/MAINTAINER_EXPORT_SAMPLE.md](https://github.com/VrtxOmega/premature-contribution-firewall/blob/main/docs/MAINTAINER_EXPORT_SAMPLE.md)

That sample includes:

- queue markdown
- dry-run response drafts
- artifact hashes
- rerun commands
- safety posture
- explicit non-claims

The raw replay capture stayed private under `/tmp`; only hash-verifiable maintainer output was committed.

## Proof Gates

The release is gated locally and remotely.

Current public proof:

- Local `npm run ci:gates`: 147/147 tests, 69/69 benchmark, 11/11 adversarial red test, maintainer demo PASS.
- GitHub Actions `PCF Verification` run `26716892269`: success on `6b19ea0a0a95351230f5e242472c02d88c1e08de`.
- Canonical sample artifact is committed and linked from the README and Action docs.

Remote run: [PCF Verification 26716892269](https://github.com/VrtxOmega/premature-contribution-firewall/actions/runs/26716892269)

## What This Release Does Not Claim

- PCF is not an AI-authorship detector.
- PCF is not a replacement for maintainer judgment.
- PCF does not prove a patch is correct, secure, or mergeable.
- PCF does not claim endorsement from any target maintainer, the Linux kernel project, Linus Torvalds, or any other project.
- PCF does not enable GitHub comments, labels, closures, merges, or other writes by default.

The point of v0.1.0 is simple: give maintainers a safe way to compress a messy queue into a reviewable action map, then let them decide whether the map is useful.

For the build-history evidence capsule behind this release, see [docs/BUILD_ARC_36_HOURS.md](https://github.com/VrtxOmega/premature-contribution-firewall/blob/main/docs/BUILD_ARC_36_HOURS.md).
