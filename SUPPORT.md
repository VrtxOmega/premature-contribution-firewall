# Support

Premature Contribution Firewall is intended for maintainers evaluating review readiness for GitHub issues, pull requests, patch text, and maintainer feedback loops.

## Supported Requests

- Reproducible evaluator bugs.
- False positives where reviewable work is blocked too harshly.
- False negatives where risky or low-value work is treated as reviewable.
- Missed duplicate, concurrent work, solved issue, or upstream-fix context.
- API, CLI, benchmark, red-test, feedback-candidate, and CI proof-gate issues.
- Documentation gaps that affect maintainer adoption.

## Unsupported Requests

- Claims that PCF should identify whether text was written by AI.
- Requests to enable GitHub comments or labels by default.
- Requests that require private repository data without permission.
- Hosted production support without an agreed deployment security model.
- Broad rewrites that do not come with a specific maintainer problem and verification plan.

## Best First Step

Use the GitHub issue templates. They ask for the evidence maintainers need: input, expected result, actual result, repository context, verification, and whether the report should become a benchmark, red-test, or feedback candidate.

For security issues, follow [SECURITY.md](SECURITY.md).
