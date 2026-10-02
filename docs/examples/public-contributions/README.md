# Public contribution replay: useful signals and misses

This is an author-run, purposive evaluation captured on **2026-10-02, starting
17:09 UTC**. It uses three VrtxOmega contribution cases: an unresolved overlap,
a rejected patch, and an accepted narrow fix. The latter two are retrospective.
They were selected to expose different failure modes, not estimate accuracy.
None counts as outside adoption, independent validation, endorsement, or proof
that PCF predicted or caused a historical outcome.

## What actually happened

The four standard preflight inputs produce the same decisions on source commit
`95aaa4edc1fd260a302f1a00cee59ac12d03ce29` and the published npm **0.2.0** artifact
(`gitHead` `8739108af4055c9ac72b033a7da4df770aa43272`). Both manifests say 0.2.0;
they are different code. [versions.json](versions.json) records the registry URL,
tarball integrity verified locally, and exact identities. Runs used Node 24.19.0
on Windows. The lifecycle schema comparison deliberately keeps the input fixed.
The synthetic unready control keeps its 0/100, exit-1 decision across versions,
but its accountability reason and label differ; full projections preserve that
difference rather than claiming all output is identical.

| Public input | PCF result on both versions | Observed facts and useful decision |
| --- | --- | --- |
| [Tokio #8376](https://github.com/tokio-rs/tokio/pull/8376), without context | `needs-repair`, 61/100, exit 1; context `unchecked` | No overlap search occurred. Supply repository context before using the output for routing. |
| Same PR, with selected #8366 and #8185 context | `needs-repair`, 51/100, exit 1; two `concurrent-work` matches | Inspect the listed work before investing further. This identifies overlap in supplied records; it does not discover records or settle equivalence. |
| [Rask #469](https://github.com/rask-lang/rask/pull/469) | `needs-repair`, 93/100, exit 1; only `ci-missing` | Closed unmerged July 30, 2026. PCF did **not** identify the recorded symptom/root-cause objection. A high score does not establish correctness. |
| [Karakeep #2864](https://github.com/karakeep-app/karakeep/pull/2864) | `needs-repair`, 67/100, exit 1; `needs-tests`, `needs-human-verification`, `ci-missing` | Merged July 26, 2026. The body already contains a filtered pnpm test command and before/after narrative. Preserve this as a command-recognition miss, not evidence that the contributor omitted testing. |

CI results and repository policy files were deliberately not collected for these
inputs. Thus `ci-missing` means **missing from this input**, not failed or absent
upstream CI. These are limited metadata replays, not complete audits of those PRs.
No external code or reported test commands were executed.

## Why the lifecycle facts matter

**Tokio remains unresolved.** At capture, #8376, #8366, and #8185 were all open
and unmerged. #8376 has a September 25 approval, a September 28
[duplication question](https://github.com/tokio-rs/tokio/pull/8376#pullrequestreview-5340792495),
and an October 1 [reply distinguishing the scopes](https://github.com/tokio-rs/tokio/pull/8376#issuecomment-5926459092).
#8366 separately has a September 17 [overlap question about #8185](https://github.com/tokio-rs/tokio/pull/8366#issuecomment-5714011102).
These public statements warrant comparison, not automatic closure or a claim
that all work is equivalent. The current #8366 body includes later revisions;
this capture cannot reconstruct what PCF would have seen before #8376 opened.

The [lifecycle input](8376-lifecycle-input.json) deliberately encodes defect,
patch applicability, and upstream coverage as `unknown`: this evaluation did
not reproduce Tokio behavior. It records the checked master identity, not a
claim that the patch applies there. Source PCF returns
`NEEDS_MAINTAINER_DECISION`, exit 0, with `publicWriteAuthorized: false`. Exit 0
means an assessment was produced, not permission to act. This is an
**analyst-coded reduction of supplied evidence**, not an independent finding.

The identical lifecycle input fails on published npm 0.2.0, exit 1:

```text
PCF contribution lifecycle failed: Lifecycle input version must be '2026.07.19'.
```

Source expects `2026.09.26`. The replay retains the failure rather than rewriting
the input to make the versions appear interchangeable. Use documentation and
input schema matching the installed revision; see [installation guidance](../../INSTALL.md).

**Rask is an unfavorable result, with nuance.** The PR closed unmerged at
16:34:13 UTC on July 30. The [16:34:33 closing explanation](https://github.com/rask-lang/rask/pull/469#issuecomment-5133606097)
says the patch addresses the symptom rather than the mangling collision.
However, the same participant's earlier [issue reproduction](https://github.com/rask-lang/rask/issues/258#issuecomment-5089262508)
describes a separate case without a name collision. Do not turn the closure into
a claim that every reported improvement was false. The recorded tests remain
author-reported, and the replay cannot adjudicate either code-level claim.

**Karakeep is accepted work with an observable PCF miss.** The one-line
scroll-container fix merged at 12:02:15 UTC on July 26 as
`595392a9e706a7b93951cb9a7deea70ba00cadb4`. Its unchanged input body includes:

```sh
TZ=UTC pnpm --filter @karakeep/web run test -- --run
```

PCF's tests check reports no test file, command, or rationale. Its verification
check also warns despite the supplied before/after narrative. This is a
reproducible evidence-extraction limitation. A merge is an acceptance fact, not
proof that every readiness warning is wrong or that PCF has been adopted by the
project.

## Reproduce without network access

From this repository checkout, with Node 22 or later:

```sh
node docs/examples/public-contributions/replay.mjs
node src/cli.mjs preflight docs/examples/public-contributions/8376-context-input.json --format json
node src/cli.mjs preflight docs/examples/public-contributions/2864-input.json --format json
node src/cli.mjs lifecycle docs/examples/public-contributions/8376-lifecycle-input.json --format json
```

The individual public preflight commands intentionally exit 1. The replay
accepts those decisions and verifies the existing synthetic ready/unready
fixtures exit 0/1 respectively. These controls only establish that the CLI was
exercised; they do not validate accuracy on the public sample. A recognized
lifecycle schema rejection is recorded as an error row; other execution errors
fail the replay. The replay's own successful exit does not mean every case passed.

To compare an already downloaded/extracted version, pass its CLI path:

```sh
node docs/examples/public-contributions/replay.mjs --cli /path/to/package/src/cli.mjs
```

[source-results.json](source-results.json) and
[npm-0.2.0-results.json](npm-0.2.0-results.json) retain actual decisions, all
check reasons, repairs, exit codes, and input hashes. Verbose generated comments
are omitted from these projections. Run an individual command for full output.
Text hashes normalize CRLF to LF so checkout line-ending settings do not change
the evidence identity.
The runner does not fetch data, execute input commands, post comments, or apply
labels. It does not assert that future PCF versions must preserve today's misses.

## Input provenance and boundaries

[sources.json](sources.json) contains only public GitHub fields: exact PR heads,
file patches, captured title/body, issue comments, and submitted reviews. PR
bodies and comments are mutable; the timestamp and hashes freeze this observed
snapshot, not the original submission-time text. Files/comments/reviews were
fetched with `per_page=100`; a next-page response would have stopped capture.
Inline review comments were not collected in this artifact. Review summaries
alone do not represent the full #8185 discussion.

The preflight inputs map title, body, author association, file counts, and files
directly from their matching snapshots. The contextual Tokio variant adds only
the two explicitly named PRs, using their public title/body/state/path lists.
No outcomes, reviews, comments, or invented successful checks are fed into
preflight. No context collection is claimed complete. No decision thresholds
were tuned to these outcomes. The lifecycle input separately uses analyst-coded
unknowns and links, with its limitations stated in the input itself.

## Concrete follow-up work

1. Promote the Karakeep command-recognition miss into a feedback candidate before
   changing behavior. Cover filtered pnpm commands, environment prefixes, and
   explicit no-run statements; do not solve it by assuming every mention of
   `test` proves execution.
2. For root-cause claims such as Rask, require a served reproduction addressing
   the named invariant. A narrative readiness score cannot replace that work.
3. For a first adopter, run this offline comparison, inspect the warning reasons,
   and then supply current policy, checks, and repository context for their own
   contribution. Keep execution success separate from the actual verdict.

This evidence is a starting point for technical evaluation, not an accuracy
benchmark, time-savings claim, or new outside-adoption count.
