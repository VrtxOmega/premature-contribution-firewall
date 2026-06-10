# Maintainer Stack

PCF's maintainer stack composes review-readiness checks with optional maintainer-context layers. It is designed to sit above raw GitHub traffic and below maintainer judgment.

## Layers

| Layer | Module | Purpose |
| --- | --- | --- |
| Shielded posture | `shielded-posture.mjs` | Opt-in activation, assurance level, dry-run contract |
| Behavioral signals | `behavioral-signals.mjs` | Slop, rapid submission, PR volume, placeholder patterns |
| Author context | `author-context.mjs` | Trust band from association, account age, merged PR history |
| Vouch context | `vouch-context.mjs` | Optional `VOUCHED.td` participation list |
| Issue form validator | `issue-form-validator.mjs` | Required template sections under high assurance |
| Semantic duplicate assist | `semantic-duplicate-assist.mjs` | Deterministic title/body overlap when repository context is missing |
| Linked issue policy | `maintainer-stack.mjs` | `missing-linked-issue` when policy requires issue links |

## Output fields

Evaluations with the stack enabled add:

- `shieldedPosture`
- `maintainerStack`
- `readinessComment` (contributor-facing draft)

Queue items inherit these through `evaluation`.

## Labels and routing

New stack labels route through `ask-reporter-for-evidence` unless they are maintainer-context only:

- `behavioral-risk`
- `rapid-submission`
- `high-pr-volume`
- `issue-form-incomplete`
- `missing-linked-issue`

## Companion tools (not bundled)

| Tool | Role |
| --- | --- |
| Good Egg | Long-horizon author trust |
| Maintainer Shield / anti-slop | Behavioral enforcement |
| Vouch | Participation gate |
| issue-ops/validator | Issue form enforcement at platform level |
| Danger / Sonar | Code-quality and policy automation |

PCF remains the readiness and routing layer. Projects compose companions explicitly.

## Adoption path

1. Run standard PCF dry-run queue
2. Enable `shielded: true` on a shadow workflow
3. Inspect `readinessComment` and `maintainerStack` in artifacts
4. Map trust bands and vouch status to enforcement only if the project wants that policy

See [SHIELDED_POSTURE.md](SHIELDED_POSTURE.md) for activation and assurance settings.