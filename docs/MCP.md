# PCF MCP

Premature Contribution Firewall keeps the CLI for humans and scripts, and exposes a small MCP surface for agents.

The MCP server is intentionally boring and explicit:

- no GitHub writes
- no PR creation
- no comments or labels
- no shell execution
- no arbitrary filesystem reads
- local lane/evidence writes only under the fixed PCF data directory
- registry submission is a human-approved public action, not an MCP action

Run it:

```bash
npm run mcp
```

Smoke-check the stdio server before wiring an agent:

```bash
npm run mcp:smoke
```

or from an installed package:

```bash
pcf-mcp
```

For an installed npm package, clients that need an executable command can use:

```json
{
  "command": "npx",
  "args": ["-y", "-p", "premature-contribution-firewall", "pcf-mcp"]
}
```

## Submission Readiness

PCF MCP exposes a self-audit tool for registry review:

```text
pcf_submission_readiness
```

It checks package bin wiring, `glama.json`, MCP docs, smoke-script wiring, tool annotations, local-write boundaries, schema resources, and submission-review prompt coverage. It does not submit to Glama, push to GitHub, run a remote registry scan, or prove approval.

The registry-oriented server card is available as:

```text
pcf://mcp/server-card
```

`glama.json` is intentionally minimal because the live Glama schema currently requires only `maintainers`. Richer review metadata lives in `pcf://mcp/server-card`, where MCP clients can read it without risking invalid registry metadata.

## Tools

| Tool | Access | Purpose |
| --- | --- | --- |
| `pcf_health` | read-only | Report MCP package, safety, resource, and tool state. |
| `pcf_submission_readiness` | read-only | Self-audit Glama/registry readiness before public submission. |
| `pcf_evaluate` | read-only | Evaluate a supplied normalized issue or PR payload. |
| `pcf_preflight` | read-only | Gate a supplied payload or patch before submission. |
| `pcf_queue` | read-only | Build a maintainer queue from supplied items. |
| `pcf_watchlist_report` | read-only | Render a watchlist report from supplied run proofs. |
| `pcf_contributor_preflight` | read-only | Classify supplied contributor candidates and overlap checks. |
| `pcf_scout` | read-only | Rank supplied contribution candidates by PCF gates. |
| `pcf_repository_context` | read-only | Analyze supplied duplicate/concurrent/upstream context. |
| `pcf_duplicate_assist` | read-only | Run deterministic duplicate-assist token overlap. |
| `pcf_policy_profile` | read-only | Extract policy requirements from supplied policy file contents. |
| `pcf_policy_scan` | read-only | Scan supplied touched-file contents for TODO/FIXME policy conflicts. |
| `pcf_diff_shape` | read-only | Check changed-file stats against reviewability limits. |
| `pcf_repro_gate` | read-only | Classify caller-supplied before/after repro evidence. |
| `pcf_lane_status` | read-only | Summarize supplied lane gates into status and next gate. |
| `pcf_lane_resume` | read-only | Read one local lane record and summarize the next gate. |
| `pcf_lane_read` | read-only | Read one local lane record from the fixed lane store. |
| `pcf_lane_list` | read-only | List local lane records from the fixed lane store. |
| `pcf_pr_body_draft` | read-only | Draft a maintainer-friendly PR body from supplied evidence. |
| `pcf_provenance_draft` | read-only | Draft one post-merge provenance note. |
| `pcf_calibration_profile` | read-only | Build a calibration profile from supplied feedback/candidates. |
| `pcf_lane_save` | local write | Save a local lane record under the fixed PCF data directory. |
| `pcf_evidence_bundle_save` | local write | Save caller-supplied evidence under a local lane. |

The save tools write local evidence only. They do not contact maintainers or GitHub.

## Resources

| Resource | Purpose |
| --- | --- |
| `pcf://status` | Health and safety state. |
| `pcf://mcp/server-card` | Registry-oriented metadata, install config, capability summary, and safety posture. |
| `pcf://api/spec` | Local PCF API and schema summary. |
| `pcf://schemas/lane` | Contribution-lane schema and recommended gate order. |
| `pcf://schemas/repro` | Before/after repro-evidence schema for `pcf_repro_gate`. |
| `pcf://doctrine/safety` | Agent safety doctrine, public-action boundary, and non-claims. |
| `pcf://docs/watchlist` | Watchlist operating model. |
| `pcf://docs/upstream-ledger` | Public upstream contribution learning ledger. |
| `pcf://config/watchlist` | Default local watchlist config when present. |

## Prompts

| Prompt | Purpose |
| --- | --- |
| `pcf_review_lane` | Review a contribution lane before coding. |
| `pcf_prepare_pr` | Prepare evidence for a small PR body. |
| `pcf_post_merge_provenance` | Draft a project-centered provenance note after merge. |
| `pcf_submission_review` | Review PCF MCP before Glama or registry submission. |

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

`pcf_lane_resume` reads one saved lane from this store and returns the current status plus next gate. It does not verify live GitHub state, local git state, or command output freshness.

`pcf_evidence_bundle_save` does not automatically merge the saved evidence back into a lane status. Agents should call `pcf_lane_save` or `pcf_lane_status` after saving a bundle when the lane status should change.

## Agent Config Snippet

After review, an agent can point at the repo-local stdio server without adding public-write powers:

```json
{
  "mcpServers": {
    "pcf": {
      "command": "node",
      "args": ["/home/rage/apps/premature-contribution-firewall/src/mcp/server.mjs"]
    }
  }
}
```

Replace `/home/rage/apps/premature-contribution-firewall` with the local checkout path on non-Raider machines.

Run `npm run mcp:smoke` from the repo before relying on the config.

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
4. `pcf_repro_gate` on caller-supplied before/after repro and validation logs.
5. `pcf_evidence_bundle_save` for the proof bundle after commands have actually been run elsewhere.
6. `pcf_diff_shape` on changed-file stats.
7. `pcf_preflight` on the final PR body or patch.
8. `pcf_pr_body_draft` from the evidence.
9. `pcf_lane_resume` when another agent or later session picks up the lane.
10. After merge only, `pcf_provenance_draft`.

## Safety and Threat Model

PCF MCP is a local stdio server for agent decision support. Its threat model is narrower than the CLI or a future hosted service:

- It does not expose GitHub mutation tools.
- It does not execute shell commands.
- It does not perform arbitrary filesystem reads.
- It does not claim that supplied evidence is true.
- It does not make network-egress claims for Node itself, package installation, or the surrounding MCP client; it claims only that PCF MCP tools do not perform live collection or public writes.
- Local write tools are limited to the PCF lane/evidence store and are annotated as non-destructive but not read-only.

Use `pcf_submission_readiness`, `pcf://mcp/server-card`, and `pcf://doctrine/safety` before registry submission or agent rollout.

## Glama Preparation

Current Glama submission is a public, maintainer-approved action from a GitHub repository. Before submitting:

1. Run `npm run mcp:smoke`.
2. Run `pcf_submission_readiness` and require `status: "pass"`.
3. Inspect `pcf://mcp/server-card`.
4. Verify `glama.json` matches the live schema.
5. Run full repo verification.
6. Submit only after explicit human approval.

Do not add a Glama badge until a public Glama listing exists.

## Non-Claims

PCF MCP does not prove correctness, acceptance, or maintainer endorsement. It packages evidence and prevents agents from skipping review-readiness gates.
