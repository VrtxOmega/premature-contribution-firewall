# Serious Candidate Scout

PCF serious scout is the broad GitHub-search lane for finding upstream issues worth engineering time.

It is different from watchlist mode:

- Watchlist mode asks, "Which curated repositories should we inspect again?"
- Serious scout asks, "Across broad GitHub issue search results, which issues are serious, reproducible, scoped, and not cosmetic noise?"

## Run

```bash
npm run scout:serious -- --format markdown --write /tmp/pcf-serious-scout.md
npm run scout:serious -- --preset maintainer-grade --format markdown --write /tmp/pcf-serious-scout.md
npm run scout:serious -- --preset maintainer-grade --check-pr-overlap --max-overlap-checks 25 --format markdown --write /tmp/pcf-serious-scout.md
npm run scout:serious -- --query 'is:issue is:open archived:false crash' --query 'is:issue is:open archived:false regression' --write /tmp/pcf-serious-scout.md
npm run scout:serious -- --fixture /tmp/issues.json --format json
```

The default preset searches discussed open GitHub issues for terms like crash, regression, data loss, deadlock, incorrect result, panic, memory leak, and wrong output. The `maintainer-grade` preset starts narrower: bug-labeled, discussed issues with reproduction evidence such as steps, expected/actual behavior, stack traces, bisects, versions, or minimal repros, while excluding obvious GitHub Actions bot authors. Neither preset requires a repository watchlist.

Set `GITHUB_TOKEN` or `GH_TOKEN` for repeated runs so GitHub search rate limits do not distort the results.

Use `--check-pr-overlap` for unattended contributor scouting. It performs bounded read-only open-PR searches for preliminary candidate/review rows first, using issue numbers and strong code identifiers from the issue text. This catches overlap such as an existing PR for the same `refreshNuxtData` fix even when the PR does not reference the issue number.

## Automation Verdict

Every report includes an `automation.status`:

- `PROMOTE`: at least one issue cleared the serious-candidate bar, collection integrity metadata is present and complete, and every required open-PR overlap check is complete.
- `NO_ACTION`: nothing cleared the bar, collection was incomplete, integrity metadata was omitted, or required overlap evidence failed/was unchecked.

GitHub `incomplete_results=true`, query errors, secondary rate limits, and requested overlap failures are preserved in the artifact. Partial results can still be inspected, but they cannot authorize a worker handoff.

Fixture and MCP callers must supply an explicit `collection` integrity block before `PROMOTE` is possible. A supplied per-issue `overlapStatus` also makes overlap coverage authoritative: `error` or `unchecked` forces `NO_ACTION`.

The standard for a successful unattended run is not volume. It is a small number of serious candidates, or an honest no-action artifact when the search results are weak.

## What It Rewards

- high-impact failures: crash, data loss, deadlock, regression, incorrect result, memory leak, build/install breakage
- evidence: steps to reproduce, expected/actual behavior, stack traces, logs, versions, failing tests, bisects
- scope: file paths, components, packages, parsers, CLIs, runtimes, APIs
- maintainer signal: confirmed, accepted, reproduced, triaged, bug, regression labels

## What It Blocks Or Down-Ranks

- typo, spelling, whitespace, formatting, indentation, documentation-only, broken-link, and polish issues
- feature requests, RFCs, ideas, questions, and design discussions without concrete bug impact
- generated tracker, agent-workbench, design-plan, auto-suggested-fix, and QA-boilerplate issues
- CI bot daily reports, bot-created E2E/CI issue reports, and platform/game/hardware compatibility issues without concrete code scope
- contest, mentorship, or program-assignment queues that require official assignment before PRs
- duplicate, stale, invalid, wontfix, blocked, or needs-design labels
- assigned issues, maintainer-owned issues without an explicit invitation label, and supplied open-PR overlap
- reporter-claimed work where the issue body says the reporter plans to submit or has started a PR
- thin serious-sounding reports with no reproduction evidence

Negated ownership such as "nobody is working on this" is not treated as claimed work. Legitimate agent/runtime bugs are not generated tracker noise merely because they contain the word "agent".

## Operator Rule

A serious-scout candidate is permission to spend preflight time, not permission to code.

Before cloning or patching:

1. Read the contribution policy and AI/tooling policy.
2. Check open PR overlap and maintainer ownership.
3. Reproduce the issue against current upstream.
4. Scan touched files for TODO/FIXME or architectural warnings.
5. Keep the diff narrow, tested, and tied to the issue evidence.

## Non-Claims

- Serious scout does not clone repositories.
- Serious scout does not write patches, open PRs, comment, label, or contact maintainers.
- Serious scout does not prove an issue is still present on current upstream.
- Serious scout deliberately prefers fewer serious candidates over many low-value rows.
