# Security Policy

Premature Contribution Firewall is a local-first maintainer tool. Treat every deployment as sensitive because it may process pull request bodies, issue bodies, patch text, repository context, maintainer feedback, and generated evidence artifacts.

## Supported Version

The supported version is the current `main` branch plus the latest release tag, once releases exist.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting when it is enabled for the repository. If private reporting is not available, open a minimal public issue that says a private security report is needed and do not include exploit details, secrets, payloads, or private repository data in the public issue.

Please include:

- A short summary of the risk.
- Affected component: API, webhook, evaluator, CLI, browser UI, GitHub integration, storage, or CI.
- Reproduction steps with harmless sample data.
- Expected behavior and actual behavior.
- Impact and any known workaround.

## Do Not Include

- Real tokens, private keys, webhook secrets, cookies, session IDs, or credentials.
- Private repository payloads without permission.
- Exploit payloads that could be copied directly into public abuse.
- Maintainer feedback records from a private project.

## Security Boundaries

- Dry-run mode must remain the default.
- GitHub comments and labels must stay disabled unless a deployment owner explicitly enables them.
- Webhooks must use HMAC verification before public exposure.
- Public hosting needs authentication, rate limits, request logging, storage policy, and operational alerting before it is considered production-ready.
- Local `data/` files are runtime evidence and should not be committed.

## Response Expectations

Security reports should be acknowledged before any public fix notes are published. Fixes should include tests or reproducible evidence and should avoid disclosing exploit details until maintainers have had a reasonable window to update.
