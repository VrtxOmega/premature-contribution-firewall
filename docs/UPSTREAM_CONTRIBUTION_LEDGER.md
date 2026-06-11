# Upstream Contribution Learning Ledger

PCF exists to reduce wasted maintainer review time, so its own upstream contribution attempts need the same public calibration loop. This ledger records wins, misses, and blocked-before-coding decisions from author-run contribution scouting.

This is not an endorsement log. A merged PR is not a claim that a maintainer endorses PCF, and a closed PR is not a complaint about the maintainer. Both are calibration evidence for what upstream projects actually want.

## Current Gates

Before any public PR or comment, the contribution lane must pass these checks:

- Read the issue, linked issues, and all maintainer comments.
- Search open and closed PRs by issue number and by title/body overlap.
- Check the repository contribution route, including whether fork PRs are accepted.
- Verify local reproduction and platform fit before implementation.
- Scan nearby TODO, FIXME, and architecture comments in every touched file. If a TODO names the same behavior being changed, stop and align before coding.
- Prefer explicit maintainer invitation signals such as `help wanted`, a direct request for a fix, or a clear test-only gap.
- Keep one issue per branch, one fix per PR, and no broad cleanup.
- Stop before any public action until a human approves the exact target and expected diff shape.

## Ledger

### 2026-06-11 - Accepted - `koalaman/shellcheck#3484`

- PR: <https://github.com/koalaman/shellcheck/pull/3484>
- Related issue: <https://github.com/koalaman/shellcheck/issues/3478>
- Outcome: merged after CI passed.
- What was wanted: a narrow, test-backed ShellCheck false-positive fix with a small review surface.
- Gate retained: concrete lint false positives with tests can be good contribution lanes when there is no duplicate PR, no architecture conflict, and the fix follows local patterns.

### 2026-06-11 - Rejected - `mvdan/sh#1350`

- PR: <https://github.com/mvdan/sh/pull/1350>
- Related issue: <https://github.com/mvdan/sh/issues/1318>
- Outcome: closed after maintainer feedback: "No. See the TODO."
- What was not wanted: a patch around an in-file TODO that pointed toward a different handler-level design.
- Gate changed: nearby TODO and FIXME comments are now treated as maintainer policy and architecture signals. If a TODO names the behavior being changed, the lane stops unless the maintainer has already approved that direction.

### 2026-06-09 - Duplicate Closed - `NousResearch/hermes-agent#42911` and `#42912`

- PRs: <https://github.com/NousResearch/hermes-agent/pull/42911>, <https://github.com/NousResearch/hermes-agent/pull/42912>
- Outcome: closed as duplicate or already-owned work.
- What was not wanted: another PR in a lane where existing work already covered the issue.
- Gate changed: every candidate now requires an open and closed PR search by issue number plus title/body overlap before implementation.

### 2026-06-11 - Blocked Before Coding - `casey/just#3323`

- Issue: <https://github.com/casey/just/issues/3323>
- Outcome: no PR or public comment.
- Blocker: repository policy indicates fork PRs are not the right route for this lane.
- Gate changed: if the repo route is collaborator-only or issue-handoff-only, PCF must not treat the issue as a direct PR candidate.

### 2026-06-11 - Blocked Before Coding - `cli/cli#11803` and `#13629`

- Issues: <https://github.com/cli/cli/issues/11803>, <https://github.com/cli/cli/issues/13629>
- Outcome: no PR or public comment.
- Blocker: repository automation states that backlog issues are not looking for external contributions unless explicitly labeled for help.
- Gate changed: for repos with clear "not looking for external contributions" wording, PCF requires an explicit invitation signal before implementation.

### 2026-06-11 - Blocked Before Coding - `charmbracelet/lipgloss#643` and `#644`

- Issues: <https://github.com/charmbracelet/lipgloss/issues/643>, <https://github.com/charmbracelet/lipgloss/issues/644>
- Outcome: no PR or public comment.
- Blocker: both are broad architecture proposals, not narrow implementation gaps.
- Gate changed: large design proposals are not PR candidates unless a maintainer has requested a specific scoped change.

## Latest Scout Result

The 2026-06-11 read-only scout checked ten issue candidates across eight repositories. None were marked PR-ready. The safest next inspection lanes were:

- `koalaman/shellcheck#3472` - small surface, but subjective severity policy needs local rule and TODO review first.
- `koalaman/shellcheck#3483` - small surface, but new lint rules are maintainer-taste sensitive and need policy review first.
- `jesseduffield/lazygit#5683` - not Windows-only, but it is a feature lane and needs local reproduction plus maintainer appetite review before any code.

Blocked lanes from the same pass were `mvdan/sh#1318`, `casey/just#3323`, `cli/cli#11803`, `cli/cli#13629`, `charmbracelet/lipgloss#643`, `charmbracelet/lipgloss#644`, and `koalaman/shellcheck#2574`.
