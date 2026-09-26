# Upstream Contribution Learning Ledger — 2026-09-25 Addendum (refreshed 2026-09-26)

This addendum continues the public [Upstream Contribution Learning Ledger](UPSTREAM_CONTRIBUTION_LEDGER.md) and the [September 5 addendum](UPSTREAM_CONTRIBUTION_LEDGER_ADDENDUM_20260905.md) through September 26, 2026. The filename is retained because this refresh began on September 25.

The purpose is calibration, not résumé inflation. Merges count only when GitHub records a direct external VrtxOmega-authored PR as merged. Open PRs, approvals, author-side tests, self-repository changes, maintainer-authored salvage, and catalogue listings remain separate evidence classes.

## Census

The verified direct external merge count is now **23**, including **17 PCF-era direct merges**.

The only new direct external merge found after the September 5 census is [ClickHouse/ClickHouse #118352](https://github.com/ClickHouse/ClickHouse/pull/118352), merged September 24, 2026.

The September 5 open-lane set also changed materially:

- `dotnet/runtime#132602` — closed without merge after review showed the proposed root cause was unsupported and unrelated crash-dump changes had been bundled into the PR.
- `openssl/openssl#32452` — closed without merge as duplicate of the more complete `#32437`, after the branch had first been repaired from the wrong base.
- `LLMSecurity/awesome-agent-skills-security#43` — closed without merge because the submitted Trust Lab repository was a fixed demonstrator rather than a reusable tool or benchmark others could apply to their own agents.
- `tokio-rs/tokio#8376` — still open, now with a human `APPROVED` review on September 25 and GitHub reporting the PR cleanly mergeable. Approval is not counted as a merge.

A machine-readable snapshot accompanies this addendum at [upstream-contribution-refresh-20260925.json](upstream-contribution-refresh-20260925.json).

## New accepted lane

### 2026-09-24 — Accepted — `ClickHouse/ClickHouse#118352`

- PR: <https://github.com/ClickHouse/ClickHouse/pull/118352>
- Outcome: merged at `2026-09-24T08:59:09Z`.
- What changed: async-insert pool admission was moved out from under the queue-shard mutex so a producer waiting for worker admission does not unnecessarily block other inserts sharing the shard. The final change also tracked detached batches so global flush and shutdown behavior stayed coherent.
- Review evidence: an automated review raised a possible shutdown-time use-after-free/race after the lock was moved. A project member reproduced the scenario against the branch and master, explained why the server's connection-drain/forced-exit sequence prevents the destructor path in that case, then approved the PR.
- Gate retained: a scary concurrency review finding is not something to argue away from source reading. Reproduce the exact lifecycle path against both candidate and baseline, then preserve the result in the review record before merge.
- Count effect: **+1 direct external merge / +1 PCF-era direct merge**.

## New closed calibration lanes

### 2026-09-21 — Closed without merge — `dotnet/runtime#132602`

- PR: <https://github.com/dotnet/runtime/pull/132602>
- Outcome: author-withdrawn after external review identified a root-cause failure.
- Review evidence: reviewers noted that `TYP_UINT` typed IR was not legal in the claimed path and asked for the actual caller/reproduction; a separate bundled crash-dump change was also identified as unrelated.
- Author closeout explicitly acknowledged that the existing assertion invalidated the proposed explanation and that no valid caller/reproduction supported the relaxation.
- Gate added: **root cause before patch**. A crash, assertion, or sanitizer report is not enough. Prove the code path that violates the invariant before changing the guard, and keep unrelated cleanup out of the fix.

### 2026-09-25 — Closed without merge — `openssl/openssl#32452`

- PR: <https://github.com/openssl/openssl/pull/32452>
- Outcome: closed as duplicate of the more complete `openssl/openssl#32437`.
- Prior repair: the contribution had first been based on the OpenSSL 3.5 branch instead of current `master`; it was later rebuilt as one commit on current master with focused regression evidence.
- Gate added: **duplicate search must be refreshed after long-lived repair work**. Fixing branch ancestry and strengthening a reproducer does not preserve ownership if a more complete upstream PR has appeared meanwhile.

### 2026-09-20 — Closed without merge — `LLMSecurity/awesome-agent-skills-security#43`

- PR: <https://github.com/LLMSecurity/awesome-agent-skills-security/pull/43>
- Outcome: closed because the submitted repository was judged to be a browser demonstrator over fixed synthetic fixtures, not a reusable security tool or benchmark other users could apply to their own agents.
- Maintainer guidance: resubmit if the VERITAS engine itself becomes a usable open-source component.
- Gate added: **catalogue fit is a product-shape question, not only a quality question**.

### 2026-09-24 — Closed without merge — `ClickHouse/ClickHouse#122066`

- PR: <https://github.com/ClickHouse/ClickHouse/pull/122066>
- Outcome: closed because ClickHouse does not accept custom contributor-created backport PRs; backports are triggered by maintainers from the accepted source PR.
- Gate added: **backport ownership is part of contribution routing**. After a mainline merge, do not assume a contributor should open stable-branch PRs; read the project's backport process and stop when maintainers own that transition.

## Open external lanes — zero outcome weight

| Pull request | Current state |
| --- | --- |
| [IBM/mcp-context-forge#5992](https://github.com/IBM/mcp-context-forge/pull/5992) | open |
| [openssl/openssl#32457](https://github.com/openssl/openssl/pull/32457) | open |
| [apache/arrow#50947](https://github.com/apache/arrow/pull/50947) | open |
| [apache/arrow#50948](https://github.com/apache/arrow/pull/50948) | open |
| [tokio-rs/tokio#8376](https://github.com/tokio-rs/tokio/pull/8376) | open; human-approved September 25; cleanly mergeable |
| [rust-lang/regex#1388](https://github.com/rust-lang/regex/pull/1388) | open |
| [espressif/esp-hosted-mcu#231](https://github.com/espressif/esp-hosted-mcu/pull/231) | open |

The Tokio approval is useful review evidence but remains zero outcome weight until the repository records a merge or another terminal outcome.

## External technical feedback loop — Agent Security Harness #622

A separate evidence class matured after the September 25 census: a public reproduction report produced upstream remediation even though it was not a pull-request merge.

- Report: [msaleme/red-team-blue-team-agent-fabric#622](https://github.com/msaleme/red-team-blue-team-agent-fabric/issues/622).
- Initial result against the exact published `agent-security-harness==4.25.0` wheel: the project's named closed-port / 404 / bare-403 claim reproduced, while independently implemented redirect-loop, empty-500, empty-200, and empty-204 targets still produced **45 / 35 / 134 / 144** non-self PASS/FAIL rows.
- External owner reproduction: the repository owner reran the empty-500 / over-refusal example on a fresh v4.25.0 install and reproduced **25/25 PASS**, agreeing that "Legitimate initialize accepted" from an empty 500 was a false-assurance verdict.
- Upstream action: PRs [#624](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/624), [#625](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/625), [#626](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/626), [#627](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/627), [#629](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/629), and [#630](https://github.com/msaleme/red-team-blue-team-agent-fabric/pull/630) converted the new shapes into permanent guard poles and reduced a **346-cell / 19-family** contentless-answer register to zero.
- Release: [v4.26.0](https://github.com/msaleme/red-team-blue-team-agent-fabric/releases/tag/v4.26.0) shipped on September 26 with the no-surface guard expanded from three poles to nine.
- Independent retest: the exact v4.26.0 release wheel was rerun against the same nine independently implemented targets. No unexpected target-dependent PASS/FAIL remained; the only target verdicts were the project's explicitly pinned A2A/payment contract exceptions plus its declared local self-tests. The rerunnable source and raw workflow artifacts are public in [VrtxOmega/veritas-agent-trust-lab#78](https://github.com/VrtxOmega/veritas-agent-trust-lab/pull/78).

This does **not** increase the direct external PR merge count and is not independent validation of PCF or VERITAS. It is evidence of a different thing: a scoped, reproducible technical report was independently checked by an external repository owner, converted into durable regression policy, shipped, and then retested against the released artifact.

### Gates retained from the loop

1. **Confirm the narrow claim before widening the falsification surface.** A useful report can say both "the stated claim reproduced" and "the broader invariant still has residue."
2. **Publish runnable evidence, not only prose.** Preserve exact artifact identity, target behavior, parser rules, raw outputs, and a rerunnable path so upstream can reproduce the observation without trusting the reporter.
3. **Turn failure shapes into shrink-only regression state.** A discovered class should become a permanent guard whose known-bad register can only shrink, not a one-off patch.
4. **Retest the released artifact.** A fix on `main` is not the end of the lifecycle; verify the exact package/tag users will consume.
5. **Keep evidence classes separate.** Technical impact, adoption, approval, and direct authored merges are distinct signals and must not inflate one another.

## Independent public PCF usage discovered in this refresh

A global GitHub code search found an independently owned public repository using PCF itself:

- [rygel/outerstellar-platform#532](https://github.com/rygel/outerstellar-platform/pull/532) merged June 18, 2026.
- Its current [`.github/workflows/pcf-pr-gate.yml`](https://github.com/rygel/outerstellar-platform/blob/main/.github/workflows/pcf-pr-gate.yml) runs PCF on pull requests to `main` and `develop`.
- The workflow pins PCF to commit `ee022516a5aaf134b9633322537300bb8483713c` (`v0.1.3`), grants `contents: read`, and uses `fail-on: never`, so the gate is advisory and read-only.

This is evidence of at least one independent public installation of the PCF GitHub Action. It is not a total adoption count or a blanket endorsement.

Other public references found in the same search include automated GitHub Marketplace-news entries for PCF releases and archived community-showcase links. Those are distribution/discovery evidence, not independent use.

## Gates added or strengthened from this cycle

1. **Root cause before patch.** Reproduce and identify the violating call path before relaxing an assertion or guard.
2. **Refresh duplicate ownership after repair.** Long-lived branch repair or repro work must rerun overlap checks.
3. **Match catalogue/product shape before submission.** A polished demonstrator is not automatically a reusable tool.
4. **Resolve backport ownership before coding.** Stable-branch work may be maintainer-triggered even when mainline was accepted.
5. **Reproduce concurrency review claims against baseline.** Treat lifecycle/race objections as hypotheses to test, not comments to dismiss.
6. **Approval remains unresolved.** A human approval can be recorded as review evidence, but it is not a merge.
7. **Independent adoption is a separate evidence class.** A public third-party workflow install is stronger than a mention, but weaker than a claim of broad adoption.
8. **Separate claim confirmation from falsification residue.** Record what reproduced before reporting the wider failure class.
9. **Evidence should survive handoff.** Prefer public rerunnable artifacts and release-level retests over private or reporter-only proof.

## PCF repository hardening since the September 5 evidence refresh

- Repro gates no longer infer pass/fail or evidence presence from narrative notes; structured command/verdict/artifact evidence controls authority.
- The adversarial residue corpus increased from **29 to 31** cases.
- Script entrypoints now use native file-URL conversion so fixture CLIs execute on Windows and in checkout paths containing spaces, `#`, or `%`.
- Repository-relative display paths and LF/CRLF workflow checks are portable across Windows and Linux.
- Current Linux full-gate evidence after PR #26 is **302 tests**, **77/77 benchmark cases**, **31/31 adversarial cases**, and maintainer demo PASS.
- Native Windows reached **296/302** in the full suite; the six remaining failures are the separately tracked prospective-study permission/symlink cases rather than silently skipped coverage.

These are current-main results, not a new npm release. The published package remains `v0.2.0` until a later release is cut.
