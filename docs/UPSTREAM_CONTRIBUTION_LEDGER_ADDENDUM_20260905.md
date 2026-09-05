# Upstream Contribution Learning Ledger — 2026-09-05 Addendum

This addendum continues the public [Upstream Contribution Learning Ledger](UPSTREAM_CONTRIBUTION_LEDGER.md) through September 5, 2026. It records post-August outcomes without rewriting the earlier observations.

The purpose is calibration, not résumé inflation. A closed pull request can be more useful to PCF than an easy merge if it exposes a preflight failure class. Open pull requests remain unresolved lanes and carry no acceptance weight.

## Census

The direct external merge count remains **22**, including **16 PCF-era direct merges**. A current GitHub search for `author:VrtxOmega merged:>=2026-08-09` found no newly merged external contribution after the August 9 baseline. The results in VrtxOmega-owned proof/profile repositories are not external merges and are excluded.

The detailed machine-readable snapshot is [upstream-contribution-refresh-20260905.json](upstream-contribution-refresh-20260905.json).

## New closed lanes

### 2026-08-21 — Closed without merge — `python/cpython#156200`

- PR: <https://github.com/python/cpython/pull/156200>
- Outcome: closed without merge after repository actor `picnixz` pointed to the already-existing #143907 and asked that a second PR not be opened even though the earlier one was stale.
- Evidence: <https://github.com/python/cpython/pull/156200#issuecomment-5373144178>
- Gate changed: **stale does not mean absent**. The all-state overlap check must explicitly include existing stale PRs before implementation. If another contribution already owns the issue, PCF should route to review/revival/coordination instead of creating a parallel patch.

### 2026-08-25 — Closed without merge — `nginx/nginx#1674`

- PR: <https://github.com/nginx/nginx/pull/1674>
- Outcome: closed without merge after repository actor `sbhowmikf5` treated the submission as duplicate work and routed discussion back to #1194.
- Evidence: <https://github.com/nginx/nginx/pull/1674#issuecomment-5407482317>
- Gate changed: a public bug/discussion is not automatically an invitation for a patch. PCF must resolve the project's active discussion, ownership, and contribution route before implementation.

### 2026-08-21 — Closed without merge — `libgit2/libgit2#7355`

- PR: <https://github.com/libgit2/libgit2/pull/7355>
- Outcome: the intended focused fix appeared upstream as a **127-commit, 149-file** pull request. External actor `AHSauge` explicitly asked for the actual change to be condensed and identified an incorrect/non-current branch base as the likely cause.
- Evidence: <https://github.com/libgit2/libgit2/pull/7355#issuecomment-5372643439>
- Gate changed: the final publication boundary needs its own ancestry and diff-shape check. Immediately before opening a PR, compare against current upstream main and fail closed on unexpected commits, files, or churn even when the intended local patch is tiny.

### 2026-08-25 — Closed without merge — `pola-rs/polars#28920`

- PR: <https://github.com/pola-rs/polars/pull/28920>
- Outcome: reviewer `orlp` required compliance with the repository AI policy and requested the existing bound check be repaired with `offset.checked_add(length).is_some_and(...)` rather than adding an unused checked result followed by unwrap. The first-time-contribution policy was linked again at closure.
- Evidence: <https://github.com/pola-rs/polars/pull/28920#issuecomment-5373196565> and <https://github.com/pola-rs/polars/pull/28920#issuecomment-5407307470>
- Gate changed: repository AI-assistance posture and local code idiom are part of readiness, not cleanup after technical review begins. A plausible safety fix can still be a bad contribution if it ignores the project's declared process or preferred invariant shape.

## Open external lanes — zero outcome weight

The following external pull requests were open at the September 5 census and therefore are **not** counted as wins, validations, adoption, or merges:

| Pull request | Current subject |
| --- | --- |
| `IBM/mcp-context-forge#5992` | startup build provenance |
| `dotnet/runtime#132602` | unsigned JIT constant assertion |
| `openssl/openssl#32457` | EVP size-addition overflow guard |
| `openssl/openssl#32452` | pre-session group-name null dereference |
| `apache/arrow#50947` | Gandiva overflow and truncated UTF-8 bounds |
| `apache/arrow#50948` | Gandiva soundex bounds |
| `tokio-rs/tokio#8376` | io_uring EAGAIN/UAF path |
| `rust-lang/regex#1388` | bounded-backtracker zero-limit panic |
| `espressif/esp-hosted-mcu#231` | SDIO DMA buffer limit |
| `LLMSecurity/awesome-agent-skills-security#43` | scoped Trust Lab catalogue proposal |

Author-written PR descriptions, local test claims, bots, CI, and an open repository state do not establish acceptance. Each lane remains unresolved until an external repository-controlled event changes its state.

## Gates added from this cycle

1. **Search stale overlap, not just active overlap.** An older or stale PR can still own the issue and make a new implementation premature.
2. **Resolve route before code.** Determine whether the project wants a patch, discussion, issue follow-up, security route, or maintainer decision before implementation.
3. **Pre-publish ancestry check.** Compare the exact head against current upstream base immediately before publication. Unexpected commit count, file count, or diff shape is a hard stop.
4. **Policy before implementation.** Read AI-assistance, first-time-contributor, CLA/DCO, and project-specific patch policies before investing in a public lane.
5. **Open means unresolved.** Open PRs remain learning lanes at zero outcome weight regardless of how strong the local evidence appears.

## Private inbound interest boundary

An unsolicited private inquiry can be useful product-design evidence, but private correspondence is not silently published or converted into adoption, endorsement, validation, or attributable demand. Sender identity or message text should enter the public ledger only with an appropriate public source or explicit consent.

That boundary matters because PCF's job is to reduce premature public action. Its own evidence process should obey the same rule.
