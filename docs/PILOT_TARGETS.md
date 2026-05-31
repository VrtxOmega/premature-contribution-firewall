# Pilot Target Bench

This bench tracks candidate repositories for future read-only PCF shadow pilots.

It is not an outreach list, endorsement list, or claim that these projects need PCF. It is a research snapshot of public GitHub queues that look useful for learning where PCF is wrong, where repository context helps, and where maintainers might benefit from queue compression.

GitHub API snapshot: `2026-05-31T00:21:27+00:00`

## Selection Rules

- Prefer active public repositories with visible recent intake.
- Prefer queues with enough open issues or PRs to make triage pressure real.
- Prefer maintainers or teams that appear to handle a concrete support shape, not generic popularity.
- Prefer issue templates, labels, or repeated report patterns that PCF can evaluate reproducibly.
- Keep pilots read-only unless a maintainer explicitly opts in.
- Do not approach a maintainer just because a pilot is clean.
- Approach only when PCF got something wrong, the miss was fixed narrowly, and the fix is locked into tests, benchmark cases, red-test residue, or replay candidates.

## Primary Ten

| Repository | Maintainer surface | Open issues | Open PRs | Queue signal | PCF learning value | Pilot stance |
| --- | --- | ---: | ---: | --- | --- | --- |
| [`henrygd/beszel`](https://github.com/henrygd/beszel) | `henrygd` / project maintainers | 227 | 63 | Recent bugs cover Podman CPU accounting, SSH-pull agents, WebSocket auth, and OIDC logout. Templates include bug and feature forms. | Agent-vs-hub topology, container/runtime variance, auth and network diagnostics, and "needs current repro" routing. | Run first. Strong small-maintainer fit with manageable but real pressure. |
| [`karakeep-app/karakeep`](https://github.com/karakeep-app/karakeep) | `karakeep-app` maintainers | 572 | 64 | Recent queue includes Android connection failures, inference errors, TikTok capture problems, and feature requests. Labels include `status/untriaged` and `status/pending_clarification`. | Self-hosted deployment evidence, browser/mobile edge cases, AI/crawler failures, and clarification-vs-review routing. | Run early. Good mix of user support and engineering issues. |
| [`keymapperorg/KeyMapper`](https://github.com/keymapperorg/KeyMapper) | `keymapperorg` maintainers | 188 | 2 | Recent issues include boot timing, UX requests, bug-reporting improvements, and several `needs triage` labels. Templates include bug, feature, and UX issue forms. | Android device/input variance, accessibility-adjacent workflows, thin feature requests, and UX-vs-bug classification. | Run early. Good smaller-queue outreach candidate. |
| [`jarnedemeulemeester/findroid`](https://github.com/jarnedemeulemeester/findroid) | `jarnedemeulemeester` / Findroid maintainers | 251 | 32 | Recent issues cover downloads, Chromecast, Jellyfin sessions, background playback, and media performance. Templates include bug and feature request forms. | Client/server version evidence, media playback reproduction, Android background behavior, and duplicate feature routing. | Run early. Useful contrast against larger Jellyfin server queues. |
| [`FreeTubeApp/FreeTube`](https://github.com/FreeTubeApp/FreeTube) | `FreeTubeApp` maintainers | 302 | 15 | Recent issues include YouTube SABR/content-loading failures, Wayland tray behavior, keyboard shortcuts, and reproduced bugs. Templates include bug and feature forms. | External upstream breakage, desktop environment variance, duplicate bursts after provider changes, and current-workaround evidence. | Run early. Strong for upstream-change context. |
| [`photoprism/photoprism`](https://github.com/photoprism/photoprism) | PhotoPrism maintainers | 433 | 17 | Recent issues include indexing, hidden files, FFmpeg/hardware transcoding, and `please-test` labels. Templates include bug and feature forms. | Media indexing evidence, hardware acceleration details, "please test current build" routing, and stale-vs-current regression separation. | Run after one smaller target. Good evidence-rich queue. |
| [`advplyr/audiobookshelf`](https://github.com/advplyr/audiobookshelf) | `advplyr` / Audiobookshelf maintainers | 922 | 117 | Recent intake is dominated by enhancements and API/media metadata requests, plus active PRs and translations. Templates include bug and feature forms. | Feature-request compression, API evidence quality, media metadata edge cases, and enhancement backlog prioritization. | Run after feature-request calibration is stable. High backlog, high learning value. |
| [`termux/termux-app`](https://github.com/termux/termux-app) | Termux maintainers | 471 | 77 | Recent issues include Android feature requests, incomplete bug reports, font/config behavior, and command/display requests. Templates include bug and feature forms. | Android OS/version evidence, command-line environment details, thin reports, and version/current-state repair prompts. | Calibration first, outreach later. Strong but sensitive queue. |
| [`esphome/esphome`](https://github.com/esphome/esphome) | ESPHome maintainers and component owners | 194 | 402 | Recent issues include device crashes, Tuya datapoints, build failures, ESP8266 drops, and many component PRs. Template surface includes bug reports. | Issue-to-PR concurrency, component ownership, firmware/device logs, crash evidence, and solved-adjacent routing. | Calibration target. Useful but PR-heavy, so run with context collection on. |
| [`yt-dlp/yt-dlp`](https://github.com/yt-dlp/yt-dlp) | yt-dlp maintainers | 1,941 | 602 | Recent issues include site bugs, questions, duplicate enhancements, plugin requests, and extractor PRs. Templates cover broken site, site support, site feature, bug, feature, and question reports. | High-volume duplicate detection, strict template adherence, upstream website breakage, and current extractor/PR context. | Heavyweight stress test. Do not approach until PCF proves itself on smaller queues. |

## Recommended Order

1. `henrygd/beszel`
2. `karakeep-app/karakeep`
3. `keymapperorg/KeyMapper`
4. `jarnedemeulemeester/findroid`
5. `FreeTubeApp/FreeTube`
6. `photoprism/photoprism`
7. `advplyr/audiobookshelf`
8. `termux/termux-app`
9. `esphome/esphome`
10. `yt-dlp/yt-dlp`

The first five are the best next read-only pilots because they combine real queue pressure with maintainers who may plausibly value a concise "here is what PCF got wrong and fixed" brief. The last two are intentionally hard stress tests, not immediate outreach targets.

## Close Alternates

| Repository | Open issues | Open PRs | Why keep it nearby |
| --- | ---: | ---: | --- |
| [`ArchiveBox/ArchiveBox`](https://github.com/ArchiveBox/ArchiveBox) | 199 | 8 | Browser extension, web archiving, docs, and pipeline-resilience reports. Good if we want a smaller self-hosted tooling queue. |
| [`commons-app/apps-android-commons`](https://github.com/commons-app/apps-android-commons) | 692 | 129 | Volunteer Android app with bug, feature, feedback, and need-help templates. Useful for permission/network/media upload issues. |
| [`syncthing/syncthing`](https://github.com/syncthing/syncthing) | 368 | 15 | Mature sync project with `needs-triage` labels, protocol/systemd issues, and careful maintainer expectations. |
| [`caddyserver/caddy`](https://github.com/caddyserver/caddy) | 194 | 53 | High-standard maintainer culture, config/protocol issues, and upstream-adjacent reports. Good later credibility target. |
| [`Kareadita/Kavita`](https://github.com/Kareadita/Kavita) | 164 | 23 | Reading server with `needs-triage` labels, OIDC, Kindle, token, and media-library issues. |
| [`LizardByte/Sunshine`](https://github.com/LizardByte/Sunshine) | 81 | 32 | Lower issue count but intense hardware, Wayland, Windows, encoder, and network variance. |
| [`go-vikunja/vikunja`](https://github.com/go-vikunja/vikunja) | 199 | 39 | CalDAV, email, UX, recurring tasks, and shared-instance edge cases. |
| [`jellyfin/jellyfin`](https://github.com/jellyfin/jellyfin) | 485 | 186 | Large media server queue with metadata, subtitles, plugins, and upgrade failures. Better as calibration than early outreach. |
| [`immich-app/immich`](https://github.com/immich-app/immich) | 514 | 162 | Extremely active photo/video project. Useful stress test, but the team is larger and the issue flow is fast. |
| [`renovatebot/renovate`](https://github.com/renovatebot/renovate) | 908 | 254 | Dependency automation creates excellent config/package-manager edge cases, but the project has a more institutional support surface. |

## Pilot Evidence To Capture

For every target that graduates from this bench into the pilot ledger, capture:

- snapshot timestamp and GitHub API counts
- issue-template filenames inspected
- initial queue split
- final queue split if PCF changes
- the first concrete PCF miss
- the wrong assumption that caused the miss
- the narrow fix made
- test, benchmark, red-test, or replay-candidate lock-in
- artifact hashes
- public/private status
- confirmation that no writes were made to the target repository

## Outreach Rule

Do not contact any target from this bench until there is a maintainer-readable story:

- PCF ran read-only.
- PCF got one or more items wrong.
- The miss was fixed.
- The fix is reproducible.
- The brief leads with the artifact and includes non-claims.
- The outreach happens from PCF-owned infrastructure, not by opening noise in the target repository.
