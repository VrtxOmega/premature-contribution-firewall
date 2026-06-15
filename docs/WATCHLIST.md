# Watchlist Contribution Radar

PCF watchlist mode runs the contributor-scouting path across a curated list of repositories and returns one operator report.

It is for finding possible upstream contribution targets without wasting maintainer attention.

## Run

```bash
npm run pilot:watch -- --config config/watchlist.json --write /tmp/pcf-watchlist.md
npm run watch:repos -- --config config/watchlist.json --format json --write /tmp/pcf-watchlist.json
```

The default config is [config/watchlist.json](../config/watchlist.json). It is intentionally curated. Add repositories by hand when they are important, active, contributor-accessible, and worth checking repeatedly.

## What It Checks

For each enabled repository, watchlist mode runs an issue-only public pilot with contributor preflight:

```bash
npm run pilot:scout -- --repository owner/repo --limit 10
```

The report aggregates:

- `candidate`: PCF found a `review-now` issue and did not find an exact open PR overlap for that issue number.
- `blocked`: an open PR appears to own or reference the issue, so do not clone or code yet.
- `unchecked`: PCF could not prove the PR-overlap gate; run manual preflight before coding.
- `error`: GitHub collection or evaluation failed for that repository.

## Operator Rule

Watchlist mode is the first gate, not the last gate.

Before cloning or coding a candidate:

1. Read the repository contribution policy.
2. Check AI/tooling policy and the [AI contribution posture index](AI_CONTRIBUTION_POSTURE_INDEX.md).
3. Reproduce the issue on current upstream.
4. Re-check open PR overlap and maintainer ownership.
5. Keep the patch narrow and testable.

## Non-Claims

- Watchlist mode does not search all of GitHub for repositories.
- Watchlist mode does not clone repositories.
- Watchlist mode does not write patches, open PRs, comment, label, or contact maintainers.
- A `candidate` row is not permission to code.
- A quiet or empty run is normal evidence, not a failure.
