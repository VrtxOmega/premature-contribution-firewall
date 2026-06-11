# Changelog

## Unreleased

### MCP V1.2 Submission Layer

- Added `glama.json` with schema-valid maintainer metadata for future Glama submission.
- Added `pcf_submission_readiness`, a read-only self-audit for MCP registry readiness.
- Added `pcf://mcp/server-card`, `pcf://schemas/repro`, and `pcf://doctrine/safety` resources.
- Added `pcf_submission_review` prompt and deterministic `npm run mcp:smoke` coverage.
- Documented the MCP tool table, resources, prompts, safety/threat model, and Glama preparation path.
- Kept MCP public-action boundaries intact: no GitHub writes, no shell execution, no arbitrary filesystem reads.
