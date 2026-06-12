# Changelog

## Unreleased

### Release Hygiene

- Keep future changes here until they are assigned to a versioned release.

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
