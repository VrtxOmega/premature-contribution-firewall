# Maintainer Feedback Tracker

This tracker exists to keep the first PCF maintainer feedback pass small, specific, and evidence-driven.

## Rules

- Pick five maintainers, not fifty.
- Post outreach only in `VrtxOmega/premature-contribution-firewall`.
- Do not open issues or comments in target repositories.
- Ask for artifact-shape feedback, not adoption.
- Do not ask anyone to install PCF, grant write access, enable labels, or accept a bot.
- Treat silence as neutral evidence.

## Tiny Ask

Would this artifact save you time, annoy you, or need a different shape?

## Selected Maintainers

Live repository signals were checked on 2026-05-31.

| Maintainer / repo | Activity signal | Why this repo | PCF lesson from pilot work | Outreach |
| --- | --- | --- | --- | --- |
| `@make-all` / `make-all/tuya-local` | 117 open issues, pushed 2026-05-31 | Active Home Assistant device-support queue with repeated evidence-quality pressure. | New-device reports can be reviewable even when evidence appears in project-specific template language. | [#1](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1) |
| `@marcelklehr` / `floccusaddon/floccus` | 177 open issues, pushed 2026-05-31 | Browser-sync queue with bugs, feature requests, and environmental variance. | Feature requests need use-case/requested-behavior recognition instead of bug-report-only telemetry checks. | [#2](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2) |
| `@knadh` / `knadh/listmonk` | 92 open issues, pushed 2026-05-31 | Newsletter/server queue with active questions, bugs, feature requests, and duplicate references. | Current-workflow feature requests and issue-comment duplicate references both affect review routing. | [#3](https://github.com/VrtxOmega/premature-contribution-firewall/issues/3) |
| `@henrygd` / `henrygd/beszel` | 289 open issues, pushed 2026-05-30 | Monitoring stack with hub/agent issues, container variance, auth, and infrastructure feature requests. | Security or SSL monitoring feature requests must not be treated as vulnerability reports requiring a reproducer. | [#4](https://github.com/VrtxOmega/premature-contribution-firewall/issues/4) |
| `@advplyr` / `advplyr/audiobookshelf` | 1040 open issues, pushed 2026-05-30 | Large self-hosted media queue with enhancement/API/media metadata pressure. | Enhancement templates and "What happened?" bug templates need project-specific section recognition while duplicate context stays active. | [#5](https://github.com/VrtxOmega/premature-contribution-firewall/issues/5) |

## Response Evidence

| Maintainer / repo | Response | Signal | Action |
| --- | --- | --- | --- |
| `@make-all` / `make-all/tuya-local` | No response yet on [#1](https://github.com/VrtxOmega/premature-contribution-firewall/issues/1). | Neutral. | No change, no re-ping in this pass. |
| `@marcelklehr` / `floccusaddon/floccus` | No response yet on [#2](https://github.com/VrtxOmega/premature-contribution-firewall/issues/2). | Neutral. | No change, no re-ping in this pass. |
| `@knadh` / `knadh/listmonk` | No response yet on [#3](https://github.com/VrtxOmega/premature-contribution-firewall/issues/3). | Neutral. | Await artifact-shape feedback; no target-repo post. |
| `@henrygd` / `henrygd/beszel` | No response yet on [#4](https://github.com/VrtxOmega/premature-contribution-firewall/issues/4). | Neutral. | Await artifact-shape feedback; no target-repo post. |
| `@advplyr` / `advplyr/audiobookshelf` | No response yet on [#5](https://github.com/VrtxOmega/premature-contribution-firewall/issues/5). | Neutral. | Await artifact-shape feedback; no target-repo post. |

## Message Template

```text
Hi @maintainer,

I built PCF v0.1.0, a read-only maintainer queue pilot. It is not an AI detector and it does not write to issues or PRs. The GitHub Action runs manually and emits one markdown artifact.

I am looking for maintainer feedback on the artifact shape, not adoption. Would this save review time, create noise, or need a different layout?

Release:
Sample artifact:
Read-only Action:

I picked `owner/repo` because a private read-only shadow pilot exposed a specific queue-shape lesson there. No writes were made to `owner/repo`, and I am not asking to install anything there.
```
