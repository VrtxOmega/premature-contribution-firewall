# PCF MCP

Premature Contribution Firewall keeps the CLI for humans and scripts, and exposes a small MCP surface for agents.

The MCP server is intentionally boring:

- no GitHub writes
- no PR creation
- no comments or labels
- no shell execution
- no arbitrary filesystem reads
- local lane/evidence writes only under the fixed PCF data directory

Run it:

```bash
npm run mcp
```

or from an installed package:

```bash
pcf-mcp
```

## Tools

Read-only/default-safe analysis tools:

- `pcf_health`
- `pcf_evaluate`
- `pcf_preflight`
- `pcf_queue`
- `pcf_watchlist_report`
- `pcf_contributor_preflight`
- `pcf_scout`
- `pcf_repository_context`
- `pcf_duplicate_assist`
- `pcf_policy_profile`
- `pcf_policy_scan`
- `pcf_diff_shape`
- `pcf_lane_status`
- `pcf_pr_body_draft`
- `pcf_provenance_draft`
- `pcf_calibration_profile`

Local lane/evidence tools:

- `pcf_lane_save`
- `pcf_lane_read`
- `pcf_lane_list`
- `pcf_evidence_bundle_save`

The save tools write local evidence only. They do not contact maintainers or GitHub.

## Lane Store

Lane records live under:

```text
${PCF_DATA_DIR:-~/.local/share/pcf}/lanes/
```

The lane schema is available as an MCP resource:

```text
pcf://schemas/lane
```

Recommended gate order:

```text
scout -> overlap -> policy -> repro -> diffShape -> preflight -> pr -> provenance -> calibration
```

## Agent Rule

Use PCF MCP to decide whether a contribution lane is ready for public action. Do not use it to perform the public action.

Humans approve and execute PR opens, comments, labels, and other maintainer-facing work outside MCP.

For active cross-agent coordination, drain Omega Brain before state-changing work:

```bash
omsg-drain codex
```

## First Useful Flow

1. `pcf_scout` with supplied candidate issues.
2. `pcf_lane_save` to persist the selected lane.
3. `pcf_policy_scan` on touched files.
4. `pcf_diff_shape` on changed-file stats.
5. `pcf_evidence_bundle_save` for before/after repro and validation logs.
6. `pcf_preflight` on the final PR body or patch.
7. `pcf_pr_body_draft` from the evidence.
8. After merge only, `pcf_provenance_draft`.

## Non-Claims

PCF MCP does not prove correctness, acceptance, or maintainer endorsement. It packages evidence and prevents agents from skipping review-readiness gates.
