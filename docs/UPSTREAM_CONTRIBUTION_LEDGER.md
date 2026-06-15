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
- Before investing implementation time, check the repo's **AI-assisted contribution posture** in [AI_CONTRIBUTION_POSTURE_INDEX.md](AI_CONTRIBUTION_POSTURE_INDEX.md). Search `CONTRIBUTING.md`, issue/PR discussions, and prior closures for maintainer trust/provenance signals — not just technical review readiness.

## Ledger

### 2026-06-11 - Accepted - `ansvisor/ansvisor#235`

- PR: <https://github.com/ansvisor/ansvisor/pull/235>
- Related issue: <https://github.com/ansvisor/ansvisor/issues/231>
- Outcome: merged quickly after all checks passed; the linked issue closed automatically.
- What was wanted: a fresh `bug` + `help wanted` issue with an exact file pointer and acceptance criteria for preventing duplicate platform rows on the insights dashboard when provider model slugs drift over time.
- What changed: the insights dashboard now groups prompt-result buckets by `platform` only while keeping latest model and region metadata for display. The pure grouping logic was moved into a small local helper module and covered with Vitest cases for model slug drift, latest metadata, sorted history, aggregate counts, and distinct platform separation.
- Evidence: live issue readback showed #231 open, unassigned, and without comments before implementation. Open and all-state PR searches by issue number plus semantic grouping terms found no overlap. Local validation passed with focused Vitest, touched-file Prettier and ESLint, full `format:check`, full `test`, `typecheck`, full `lint` with zero errors, and `git diff --cached --check`. Upstream CI passed `server - lint & format`, `web - format, lint & typecheck`, Vercel, and the welcome check.
- Gate retained: when an issue includes root cause, acceptance criteria, and a precise display-layer pointer, keep the PR scoped to that surface, test the data-shaping edge cases directly, and leave only one short repo-centered PCF provenance comment after merge.

### 2026-06-11 - Open PR - `ansvisor/ansvisor#237`

- PR: <https://github.com/ansvisor/ansvisor/pull/237>
- Related issue: <https://github.com/ansvisor/ansvisor/issues/236>
- Outcome: opened after the maintainer of #235 explicitly invited the sibling prompt-detail fix; initial GitHub readback reported it as open, mergeable, and not draft. At closeout, server, Vercel, and welcome checks were passing, with the web check still pending.
- What was wanted: the prompt detail page had its own copy of the same platform grouping bug fixed in #235, using a `platform|modelUsed` key that split one platform into duplicate cards when the provider model slug drifted.
- What changed: prompt detail grouping was extracted into a local `grouping.ts` helper, now keyed by `platform` only while preserving latest model and region metadata for display. A Vitest regression covers model slug drift and separate-platform behavior.
- Evidence: maintainer comment on #235 pointed directly to issue #236 and the affected route. Live issue readback showed #236 open, unassigned, with exact file path and acceptance criteria; all-state PR search by issue number and grouping/model/platform terms found no open overlap. Local validation passed with focused Vitest, touched-file Prettier and ESLint, full `test`, `typecheck`, `format:check`, full `lint` with zero errors, `git diff --cached --check`, and `git diff --check HEAD~1..HEAD`.
- Gate retained: direct maintainer invitation is high-signal, but still rerun all-state overlap and issue-state checks immediately before publishing; then keep the diff to the named display-layer copy and reuse the already accepted test shape.

### 2026-06-13 - Accepted - `karakeep-app/karakeep#2863`

- PR: <https://github.com/karakeep-app/karakeep/pull/2863>
- Related issue: <https://github.com/karakeep-app/karakeep/issues/2766>
- Outcome: merged on 2026-06-13; linked issue closed.
- What was wanted: a `bug` + `status/approved` issue where `BROWSER_WEB_URL` failed on IPv6-enabled Docker networks because WHATWG `URL.hostname` silently rejects unbracketed IPv6 literals.
- What changed: a shared helper now brackets IPv6 literals before assigning resolved addresses into `URL.hostname`; crawler CDP and admin browser status paths both use it. Focused Vitest coverage covers IPv4, IPv6, and path/query preservation.
- Evidence: issue #2766 was open with `status/approved` before implementation. PR body included explicit LLM disclosure (Codex-assisted identification/implementation with human review and listed validation). Local validation spanned shared, workers, and trpc packages (Vitest, typecheck, lint, format) plus commit-hook `turbo run typecheck lint format`. Upstream merge readback: `MERGED` at 2026-06-13T09:55:21Z, four files, `+40/-2`.
- Rejection class: n/a — merge on technical merit with disclosed assistance.
- Gate retained: when an approved bug names a URL-host assignment edge case, extract one shared helper, wire every named call site, test IPv4/IPv6/path preservation directly, and list every validation command actually run.
- Gate contrast: same contributor workflow that Eos rejected on provenance was accepted here with disclosed AI assistance when scope, tests, and validation were clear. Review-the-work posture.

### 2026-06-13 - Closed Without Merge - `Xarlos89/Eos#151`

- PR: <https://github.com/Xarlos89/Eos/pull/151>
- Related issue: <https://github.com/Xarlos89/Eos/issues/134>
- Outcome: closed without merge on 2026-06-13 after maintainer stated discomfort with AI-assisted contribution despite scoped fix, tests, validation listing, and PR-template compliance requested mid-review.
- What was wanted: a `bug` + `help wanted` issue where several API routes returned `jsonify(data, status_code)`, causing Flask to serialize the payload and status as a JSON array while the HTTP status stayed `200`.
- What changed: the listed `roles`, `logging`, `settings`, and `healthchecks` route returns now use Flask's `(jsonify(payload), status_code)` tuple form. A route-level unittest suite covers the affected role, logging, setting, and healthcheck responses with a fake DB so Docker/Postgres is not required.
- Evidence: current-master reproduction for `GET /role` returned HTTP `200` with body `[{"status": "ok"}, 200]`; after the fix it returned HTTP `200` with body `{"status": "ok"}`. Focused route tests, Ruff check, Ruff format check, compileall, targeted pre-commit, `git diff --check`, and an AST guard for remaining multi-argument `jsonify(...)` calls all passed locally. The upstream PR contains one commit, five files, `+150/-27`. Maintainer asked for PR-template reformat (done), then asked whether AI was used and how the repo was found. Contributor disclosed AI-assisted workflow with human review/validation. Maintainer closed with: "AI-generated low-quality code is not acceptable for this project and will not be merged into the codebase" and prior comment that the PR "reads as AI-generated code, not a careful contribution from someone who understands the project."
- Rejection class: **maintainer trust/provenance posture**, not a cited technical defect in the patch or tests.
- Gate retained: for API route response-shape bugs, prove the malformed HTTP/body behavior with a Flask test client, keep the change to return tuple shape only, avoid overlapping bot-helper issues, and avoid Docker/Postgres by using fake route dependencies in focused tests.
- Gate added: if a repo has no upfront AI/tooling policy but maintainers interrogate provenance after technical work is already supplied, classify the repo as **AI-resistant / high-friction** in [AI_CONTRIBUTION_POSTURE_INDEX.md](AI_CONTRIBUTION_POSTURE_INDEX.md) and stop before implementation unless explicit maintainer approval is obtained first. Do not treat template compliance or validation listing as sufficient when the review axis is contributor trust.

### 2026-06-11 - Open PR - `annotorious/annotorious#610`

- PR: <https://github.com/annotorious/annotorious/pull/610>
- Related issue: <https://github.com/annotorious/annotorious/issues/595>
- Outcome: opened as a narrow OpenSeadragon polygon-simplification configurability fix; initial GitHub readback reported it as open, mergeable, not draft, `CLEAN`, and maintainer edits enabled. No checks were reported at closeout.
- What was wanted: an `openseadragon` + `help wanted` issue where detailed polygons were visibly simplified after deselection; the maintainer confirmed the `PixiLayer` simplification path and pointed to the existing optional `tolerance` argument on `simplifyPolygon` / `simplifyMultiPolygon`.
- What changed: `AnnotoriousOSDOpts` now exposes `polygonSimplificationTolerance`, `PixiLayer` passes that value into polygon and multipolygon simplification, and the default remains `1` to preserve the existing rendering self-protection. Callers can set `0` when they need full polygon geometry preserved.
- Evidence: live issue readback showed #595 open and unassigned, with no open overlapping PRs for the simplification/tolerance lane. Local validation passed with `npm test --workspace @annotorious/annotorious -- simplificationTolerance.test.ts`, `npm test --workspace @annotorious/annotorious`, `npm run build --workspace @annotorious/openseadragon`, `npm test`, and `npm run build`. The upstream PR contains one commit, four files, `+72/-3`.
- Gate retained: when a maintainer names the code path and likely option, implement that path directly, keep the default performance safeguard unchanged, test both polygon and multipolygon tolerance behavior, and do not add a PCF provenance note on the upstream PR before merge.

### 2026-06-11 - Closed Without Merge - `oakwood-commons/scafctl#493`

- PR: <https://github.com/oakwood-commons/scafctl/pull/493>
- Related issue: <https://github.com/oakwood-commons/scafctl/issues/492>
- Superseding maintainer PR: <https://github.com/oakwood-commons/scafctl/pull/494>
- Outcome: closed without merge after the maintainer explained that `help wanted` had been applied to #492 by mistake; they had already planned the fix and merged #494 before seeing #493. The maintainer thanked the contribution and apologized for the label confusion.
- What was wanted: a `bug` + `help wanted` + `good first issue` + `developer-experience` issue where `scafctl get provider <official> -o json` returned only catalog metadata while MCP could return full schema/detail information.
- What changed: structured CLI output for official providers now attempts to load the official plugin descriptor and emits the shared `BuildProviderDetail` payload, while preserving the catalog-metadata fallback when plugin resolution is unavailable.
- Evidence: current-main before-output for `get provider github -o json` contained only `catalogRef`, description, name, source, and version; after the fix it included capabilities, schema, outputSchemas, examples, and concrete plugin version. Full `go test ./...`, `task lint`, `task format:check`, `task vet`, `go build ./...`, and `git diff --check` passed locally. Live readback on 2026-06-11 showed #494 merged at 20:07:29Z, #492 closed at 20:07:30Z, and #493 closed at 20:21:07Z with the maintainer's apology.
- Gate retained: for CLI/MCP parity bugs, prove the mismatch on current main, keep the fix in the user-facing command path unless shared logic is truly needed, preserve offline fallback behavior, and test the richer structured output without making unit tests fetch from the network.
- Gate added: `help wanted` is not enough when the maintainer may be actively self-fixing the issue. Before opening, check same-day maintainer PRs, recently pushed maintainer branches when visible, linked issue closure timing, and all-state PR search around the exact issue and title terms. If a maintainer-owned fix appears between coding and PR open, stop and ask rather than publishing.

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
