# Changelog

## v0.1.3 - Unreleased

### AI-Assisted Contribution Posture Gate

- Added an evidence-based AI-assisted contribution posture index so PCF can stop high-friction lanes before implementation instead of discovering maintainer provenance objections after code is written.
- Added the read-only `pcf_ai_contribution_posture` MCP tool and `pcf://docs/ai-posture-index` resource, with tests covering indexed resistant and conditional repositories.
- Added `aiPosture` to lane gate ordering and scout scoring so AI-resistant/high-risk repos become blockers and conditional/medium-risk repos require review before coding.

### Agent Bus Contract Scaffold

- Added the Agent Bus console UI contract scaffold under `packages/pcf-mcp-buildout/contracts/` with regression coverage for required mission-control sections and backlog hooks.

### Adversarial Authority Hardening

- Expanded the breakage-residue corpus from 15 to 29 cases across Unicode/control-text evasion, scout authority, overlap ownership, repository-context vacuum, lane-gate omission, repro laundering, and malformed batch members.
- Made serious-scout automation fail closed when collection integrity is missing/incomplete or required open-PR overlap is failed, unchecked, incomplete, or truncated, while preserving serious agent/runtime issues and negated ownership language.
- Changed empty repository context from a false duplicate-search pass to `unchecked`.
- Prevented custom lane gate order, bare pass strings, evidence-free pass objects, placeholder arrays, and caller-controlled verified timestamps from omitting or laundering mandatory evidence gates.
- Recomputed persisted lane status from mandatory gates instead of storing caller-asserted ready authority.
- Added collision-resistant scoped lane IDs with legacy read fallback and blocked verdict-only repro claims without tangible evidence.
- Bounded MCP stdio frames and headers, removed recursive blank-frame parsing, recoverably reports malformed JSON, and hardened public core APIs against null/primitive JSON shapes.
- Canonicalized analysis text with NFKC and invisible-control removal so zero-width and bidirectional controls cannot hide prompt-injection or reporter-claimed work.
- Kept lane schema and persistence behavior aligned: descriptive top-level artifacts can remain summary-only, proof-bearing gate evidence still requires a path, and custom audit gates survive authoritative recomputation.
- Rendered unchecked and future check states literally in maintainer markdown instead of leaking an `undefined` status label.

### Release Hygiene

- Bumped local package metadata to `0.1.3` because npm already serves `0.1.2`; do not publish, tag, or push this release surface until final approval.
- Included the AI posture index and Agent Bus contract scaffold in the package dry-run surface.

## v0.1.2

### MCP V1.2 Submission Layer

- Completed the npm-facing MCP package surface by versioning a patch release that exposes the `pcf-mcp` stdio server bin alongside `pcf` and `premature-contribution-firewall`.
- Fixed the MCP server entrypoint guard so npm-style bin shims and symlinks start the stdio server instead of silently exiting.
- Updated launch documentation to verify `npm pack`, `pcf-mcp`, and `npm view premature-contribution-firewall version bin` before public claims.
- Added repository hygiene coverage for package bin/file metadata so the MCP server cannot silently fall out of the publish surface.

## v0.1.1

- Added `glama.json` with schema-valid maintainer metadata for future Glama submission.
- Added `pcf_submission_readiness`, a read-only self-audit for MCP registry readiness.
- Added `pcf://mcp/server-card`, `pcf://schemas/repro`, and `pcf://doctrine/safety` resources.
- Added `pcf_submission_review` prompt and deterministic `npm run mcp:smoke` coverage.
- Documented the MCP tool table, resources, prompts, safety/threat model, and Glama preparation path.
- Kept MCP public-action boundaries intact: no GitHub writes, no shell execution, no arbitrary filesystem reads.
