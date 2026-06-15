# AI-Assisted Contribution Posture Index

Public calibration data for contributors deciding where AI-assisted upstream work is likely to be reviewed on **merit** vs blocked on **provenance/trust**.

This is **not** a maintainer blacklist. It is an evidence-based compatibility index: what a repo's *observed review posture* toward AI-assisted contributions appears to be, based on policy text and maintainer actions.

PCF does not try to detect whether code was written by AI. Maintainers sometimes do. Contributors need that signal **before** donating time.

## Posture Labels

| Label | Meaning |
| --- | --- |
| `ai-friendly` | Explicitly accepts AI-assisted contributions when human-reviewed, or merged examples exist with disclosed assistance. |
| `ai-conditional` | No blanket ban found; maintainer may accept if scope, tests, and ownership are clear. Ask first when unsure. |
| `ai-unclear` | No policy and no observed maintainer stance yet. |
| `ai-resistant` | Observed closure or maintainer comment rejecting AI-assisted work despite technical artifacts, or blanket discomfort with AI-generated contributions. |
| `unknown` | Not yet calibrated. |

## Risk Levels

| Risk | Contributor guidance |
| --- | --- |
| `low` | Proceed with normal PCF gates; disclose assistance if asked. |
| `medium` | Ask maintainers before opening an AI-assisted PR, or contribute without AI on the diff surface. |
| `high` | Avoid AI-assisted public PRs unless policy changes or explicit approval is recorded. |

## Index (evidence-based)

Entries are neutral, dated, and link to primary sources. Wording describes **observed posture**, not character judgments.

### `Xarlos89/Eos` — `ai-resistant` — risk: `high`

- **Date observed:** 2026-06-13
- **Evidence:**
  - PR <https://github.com/Xarlos89/Eos/pull/151> closed after maintainer comments that the contribution "reads as AI-generated code" and that "AI-generated low-quality code is not acceptable for this project."
  - Contributor had supplied scoped fix, tests, validation commands, and PR-template compliance after maintainer request; closure followed AI/provenance disclosure, not a cited technical failure.
  - Ledger: [UPSTREAM_CONTRIBUTION_LEDGER.md](UPSTREAM_CONTRIBUTION_LEDGER.md) (`Xarlos89/Eos#151`).
- **Contributor guidance:** Do not open AI-assisted PRs here without explicit maintainer pre-approval. If engaging, ask about AI/tooling policy before implementation.
- **Notes:** Rejection class = maintainer trust/provenance posture. Useful PCF negative calibration case.

### `karakeep-app/karakeep` — `ai-conditional` — risk: `medium`

- **Date observed:** 2026-06-13
- **Evidence:**
  - PR <https://github.com/karakeep-app/karakeep/pull/2863> merged with an explicit LLM disclosure section (Codex-assisted patch prep; human review and validation listed).
  - Linked issue <https://github.com/karakeep-app/karakeep/issues/2766> had `status/approved`; closure followed merge, not a provenance rejection.
  - Ledger: [UPSTREAM_CONTRIBUTION_LEDGER.md](UPSTREAM_CONTRIBUTION_LEDGER.md) (`karakeep-app/karakeep#2863`).
- **Contributor guidance:** Disclose assistance in the PR body; keep fixes narrow, tested, and validation-listed. No observed blanket AI ban on this lane.
- **Notes:** Contrast case vs `Xarlos89/Eos`: review-the-work when issue signal and evidence are strong.

### `ansvisor/ansvisor` — `ai-conditional` — risk: `medium`

- **Date observed:** 2026-06-11
- **Evidence:**
  - PRs <https://github.com/ansvisor/ansvisor/pull/235> (merged) and <https://github.com/ansvisor/ansvisor/pull/237> (opened on maintainer invitation) accepted narrow, test-backed display-layer fixes.
  - No project-wide AI ban located in the contribution path for these lanes; review focused on scope and tests.
  - Ledger: [UPSTREAM_CONTRIBUTION_LEDGER.md](UPSTREAM_CONTRIBUTION_LEDGER.md) (`ansvisor/ansvisor#235`, `#237`).
- **Contributor guidance:** Strong invitation + overlap gates still required. AI assistance not observed as the blocking axis in accepted lane.
- **Notes:** Contrast case: review-the-work posture when issue signal and scope are strong.

## How PCF Should Use This

Before cloning or coding for an AI-assisted lane:

1. Read `CONTRIBUTING.md`, PR/issue templates, and README contribution sections.
2. Search issues and PRs (open **and** closed) for: `AI`, `ChatGPT`, `Claude`, `Copilot`, `LLM`, `generated`, `assisted`.
3. Check this index and the [upstream ledger](UPSTREAM_CONTRIBUTION_LEDGER.md) for prior outcomes on the same repo.
4. Classify posture (`ai-friendly` … `ai-resistant`).
5. If posture is `ai-resistant` or `high` risk, **stop before implementation** unless explicit approval is on record.

### Example gate output (target shape)

```text
AI-assisted contribution risk: HIGH

Evidence:
- Maintainer closed prior PR after stating discomfort with AI-assisted code.
- No project policy clarifies acceptable AI-assisted workflow.
- Contributor supplied tests/validation; provenance remained the blocker.

Recommendation:
Do not submit AI-assisted PR without asking first.
```

## Non-Claims

- This index does not prove a maintainer's private views beyond cited public actions.
- A `ai-friendly` label does not guarantee merge; technical and scope gates still apply.
- A `ai-resistant` label is not permanent; repos can update policy or maintainer stance.
- PCF records posture to reduce **contributor time waste**, not to shame maintainers.

## Adding Entries

Add a row only when there is:

- A primary link (PR, issue comment, or policy doc), and
- A short neutral summary of what was observed, and
- Contributor guidance that helps the next person decide **before** coding.

Prefer "observed closure after provenance concern" over subjective labels.