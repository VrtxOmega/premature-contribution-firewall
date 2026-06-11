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
- After a PR merges, leave one short thank-you/provenance comment on that PR thread explaining how PCF helped scope or gate the work; do not comment before merge, repeat the note, or imply maintainer endorsement.

## Ledger

### 2026-06-11 - Open PR - `oakwood-commons/scafctl#493`

- PR: <https://github.com/oakwood-commons/scafctl/pull/493>
- Related issue: <https://github.com/oakwood-commons/scafctl/issues/492>
- Outcome: opened as a narrow CLI provider-detail fix; initial GitHub readback reported it as open, mergeable, not draft, and DCO passing.
- What was wanted: a `bug` + `help wanted` + `good first issue` + `developer-experience` issue where `scafctl get provider <official> -o json` returned only catalog metadata while MCP could return full schema/detail information.
- What changed: structured CLI output for official providers now attempts to load the official plugin descriptor and emits the shared `BuildProviderDetail` payload, while preserving the catalog-metadata fallback when plugin resolution is unavailable.
- Evidence: current-main before-output for `get provider github -o json` contained only `catalogRef`, description, name, source, and version; after the fix it included capabilities, schema, outputSchemas, examples, and concrete plugin version. Full `go test ./...`, `task lint`, `task format:check`, `task vet`, `go build ./...`, and `git diff --check` passed locally.
- Gate retained: for CLI/MCP parity bugs, prove the mismatch on current main, keep the fix in the user-facing command path unless shared logic is truly needed, preserve offline fallback behavior, and test the richer structured output without making unit tests fetch from the network.

### 2026-06-11 - Accepted - `amber-lang/amber#1116`

- PR: <https://github.com/amber-lang/amber/pull/1116>
- Related issue: <https://github.com/amber-lang/amber/issues/897>
- Outcome: merged after two project-member approvals and a passing CodeRabbit review with no actionable comments.
- What was wanted: a `bug` + `help wanted` + `good first issue` bucket asking for ShellCheck cleanup on generated Amber test scripts.
- What changed: the generated shell-version prelude now adds `-r` to the zsh and ksh `read` calls, removing the `SC2162` warning class without touching the other ShellCheck classes in the bucket.
- Evidence: the latest June 8 report showed repeated `SC2162` findings from the generated prelude. A focused `shellversion()` repro produced two `SC2162` findings before the fix and zero filtered findings after the fix when `SC2296` and `SC2034` were excluded as separate warning classes.
- Gate retained: for bucket issues, choose exactly one current warning class, prove it on current `staging`, leave unrelated warning classes for separate PRs, and avoid claiming the whole bucket is closed.
- Follow-up: after merge, left one short thank-you/provenance comment explaining that PCF helped keep the Amber contribution narrow, check overlap, and verify generated output before opening.

### 2026-06-11 - Open PR - `KaotoIO/forms#104`

- PR: <https://github.com/KaotoIO/forms/pull/104>
- Related issue: <https://github.com/KaotoIO/kaoto/issues/3281>
- Outcome: opened as a narrow bugfix PR against the `1.x` forms branch; initial GitHub readback reported it as open, mergeable, and not draft. CodeRabbit review was pending at closeout.
- What was wanted: a `bug` + `good first issue` + `help wanted` empty-state copy fix where the form already on the `All` tab should not tell the user to switch to `All`.
- What changed: `NoFieldFound` now keeps the `Switch to All tab` action for filtered `Required` / `Modified` tabs, but shows a plain no-results message when `All` is already selected.
- Evidence: `KaotoIO/kaoto#3283` was already merged and intentionally scoped to adding REST DSL search, while `#3281` was opened separately for this shared forms-library message. `@kaoto/forms@1.7.1` and `1.7.2` had identical `NoFieldFound` output, so the fix belonged in `KaotoIO/forms` rather than a Kaoto app dependency bump.
- Gate retained: when a downstream app issue points at a shared library component, verify the library source/release branch first and open the PR in the owning repo/release line instead of patching around the symptom in the app.

### 2026-06-11 - Open PR - `StingraySoftware/stingray#978`

- PR: <https://github.com/StingraySoftware/stingray/pull/978>
- Related issue: <https://github.com/StingraySoftware/stingray/issues/977>
- Outcome: opened as a narrow bugfix PR; initial GitHub readback reported it as open, mergeable, and not draft. GitHub had not reported CI checks yet at closeout.
- What was wanted: a `bug` + `help wanted` issue with a concrete reproduction where `AveragedCrossspectrum` returned all-zero powers for `Lightcurve(..., input_counts=False)`.
- What changed: the light-curve cross-spectrum path now reads public `counts` / `counts_err` attributes, matching the existing `AveragedPowerspectrum` path, and adds a regression test for identical countrate light curves.
- Evidence: current-main repro before the fix returned zero cross powers for `input_counts=False`; after the fix, the cross spectrum matched the averaged power spectrum for both `input_counts=False` and `input_counts=True`.
- Gate retained: proceed when the issue has explicit help-wanted signal, no open PR overlap, fork PRs are accepted, the bug reproduces locally, nearby TODO/FIXME scan does not contradict the patch, and the diff stays one-issue/three-file small.
- Caveat: the broader local `TestAveragedCrossspectrum` class run exposed an unrelated `test_timelag` failure that also reproduces from a clean `origin/main` worktree under the same local dependency set, so it was not treated as a blocker for this issue-specific PR.

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
