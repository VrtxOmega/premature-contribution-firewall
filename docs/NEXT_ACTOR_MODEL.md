# PCF Next Actor Model

Premature Contribution Firewall compresses a maintainer queue by identifying who can usefully act next. The score and coarse queue bucket matter, but the operational question is simpler:

Who should do the next useful thing, and why?

PCF answers that through `nextAction`. This is not authorship detection. It is not a merge decision. It is a dry-run routing model for maintainer attention.

## Action Lanes

| `nextAction.id` | Owner | Target | Meaning | Maintainer action |
| --- | --- | --- | --- | --- |
| `review-now` | `maintainer` | `maintainer` | Ready for maintainer review. | Start normal review now. |
| `ask-reporter-for-evidence` | `reporter` | `reporter` | Ask the submitter for missing evidence, verification, or clearer reproduction details. | Send a focused repair request to the submitter. |
| `check-duplicate-or-fixed-first` | `maintainer` | `maintainer` | Check related, duplicate, solved, concurrent, or upstream-fixed work before spending fresh review time. | Check related, solved, concurrent, or upstream-fixed work before fresh review. |
| `route-to-subsystem-or-process` | `process` | `maintainer/process` | Route through the repository's subsystem, policy, ownership, or project process before normal review. | Route through the right owner, subsystem, policy, or contribution process. |
| `needs-maintainer-decision` | `maintainer` | `maintainer` | Requires maintainer judgment because the next step is not obvious from reporter evidence alone. | Make a judgment call; PCF cannot reduce the next move further. |
| `not-actionable-yet` | `external-state` | `external-state` | No useful maintainer action is available until external state changes. | Wait or leave parked until the external blocker changes. |

The target is deliberately explicit. A maintainer should be able to scan a queue and separate work for the reporter, work for the maintainer, work for repository context lookup, work for project process, and work blocked on outside state.

Each queue item carries the same public contract:

- `owner`: who owns the next useful move.
- `maintainerAction`: the concrete thing a maintainer should do with the item.
- `reason`: why PCF chose that actor.
- `evidence.labels`, `evidence.checks`, and `evidence.reasons`: the labels and checks that caused the route.

Queue responses also include `nextActionGroups`: one lane summary per exported action, with counts, item ids, owner, target, maintainer action copy, and review-budget totals. The browser UI and CLI use the same shape as the API.

## Coarse Buckets

PCF keeps the older coarse actions for compatibility:

- `review-now`: the item is ready enough to spend maintainer attention.
- `send-repair-request`: the item is not ready, but may become useful if the right actor supplies the missing piece.
- `do-not-review-yet`: the item should stay out of active review for now.

`nextAction` refines those buckets. A `send-repair-request` item can mean very different things:

- The reporter must add reproduction steps.
- The maintainer should check a likely duplicate first.
- The repository process needs a subsystem or policy route.
- Maintainer judgment is needed because PCF cannot reduce the next step further.

That distinction is the product. Without it, maintainers have to re-triage the triage.

## Precedence

When labels collide, PCF chooses the next action by maintainer cost:

1. Feedback calibration conflict wins first.
   If prior maintainer feedback conflicts with the current heuristic result, the next action is `needs-maintainer-decision`.
2. Ready work stays ready.
   `ready-for-maintainer` maps to `review-now`.
3. Repository context beats reporter evidence.
   Duplicate, solved, concurrent, linked-closed, or upstream-fixed signals route to `check-duplicate-or-fixed-first` even if the item also lacks some reporter evidence.
4. Repository routing beats reporter evidence.
   Wrong repository, policy, ownership, drive-by, kernel subject, or series-split signals route to `route-to-subsystem-or-process`.
5. Wait states beat reporter evidence.
   Backlog, pending clarification, and draft signals route to `not-actionable-yet`.
6. Maintainer-owned work beats reporter evidence.
   `maintainer-authored` and `maintainer-approved` route to `needs-maintainer-decision` before generic reporter evidence requests.
7. Reporter evidence comes after higher-cost maintainer-side checks.
   Missing reproducer, logs, environment, expected/actual behavior, tests, feature scope, or verification route to `ask-reporter-for-evidence`.
8. Low-value fallback waits.
   Low-review-value items without a better actor route to `not-actionable-yet`.

The ordering matters because it prevents actor confusion. A context conflict should not be hidden behind "please add logs." A maintainer-owned item should not be sent back to a generic reporter. A parked issue should not re-enter active repair flow just because it still lacks ideal evidence.

## Evidence Trail

The current model is covered by:

- `test/queue.test.mjs`: checks selected `nextAction` reason families and maintainer-owned routing.
- `test/next-action-output-contract.test.mjs`: captures and replays fixture queue payloads to keep the API/UI/CLI-facing next-action shape stable.
- `test/adversary.test.mjs`: keeps replay residue in the adversarial corpus.
- `docs/adversarial-red-team-results.md`: publishes the current red-test result.
- `docs/LARGE_MAINTAINER_BENCH.md`: records replay-captured next-action distribution without publishing raw issue bodies.

The replay residue that shaped this model exposed two classes of bug:

- Queue explanation drift: PCF selected the right action but explained it with the wrong label family.
- Queue actor confusion: PCF routed maintainer-owned work back to a generic reporter.

Both are now locked as synthetic tests.

## Non-Claims

- PCF does not decide whether a human or AI wrote a contribution.
- PCF does not replace maintainer judgment.
- PCF does not certify correctness, security, mergeability, or project endorsement.
- PCF does not need GitHub writes to produce this queue. The safe pilot path is dry-run/read-only.
- Replay captures may contain third-party issue or pull-request bodies and must stay private unless the relevant maintainer consents.
