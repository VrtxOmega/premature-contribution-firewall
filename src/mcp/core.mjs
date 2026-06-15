import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiSpec } from "../core/api.mjs";
import { buildFeedbackCalibration } from "../core/calibration.mjs";
import { buildPrBodyDraft, buildProvenanceDraft } from "../core/contribution-drafts.mjs";
import {
  evaluateAiContributionPosture,
  parseAiContributionPostureIndex
} from "../core/ai-contribution-posture.mjs";
import { buildContributorPreflight } from "../core/contributor-preflight.mjs";
import { evaluateDiffShape } from "../core/diff-shape.mjs";
import { evaluateContribution } from "../core/evaluator.mjs";
import { buildLaneStatus } from "../core/lane-status.mjs";
import { laneSchemaResource } from "../core/lane-schema.mjs";
import { laneIdFor, listLaneRecords, readLaneRecord, saveEvidenceBundle, saveLaneRecord } from "../core/lane-store.mjs";
import {
  buildMcpServerCard,
  buildMcpSubmissionReadiness,
  reproEvidenceSchemaResource,
  safetyDoctrineResource
} from "../core/mcp-submission.mjs";
import { parsePatchSubmission } from "../core/patch.mjs";
import { buildPolicyProfile } from "../core/policy.mjs";
import { scanTouchedFilePolicy } from "../core/policy-scan.mjs";
import { buildMaintainerQueue } from "../core/queue.mjs";
import { analyzeRepositoryContext } from "../core/repository-context.mjs";
import { evaluateReproGate } from "../core/repro-gate.mjs";
import { buildContributorScout } from "../core/scout.mjs";
import { buildSemanticDuplicateAssist } from "../core/semantic-duplicate-assist.mjs";
import { buildWatchlistReport } from "../core/watchlist.mjs";
import { loadConfig } from "../config.mjs";

export const PCF_MCP_SERVER_NAME = "premature-contribution-firewall";
export const PCF_MCP_PROTOCOL_VERSION = "2026-06-11";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const LOCAL_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};

const TOOLS = [
  {
    name: "pcf_health",
    title: "PCF MCP Health",
    description: "Return PCF MCP health, package version, dry-run posture, known resources, and write-safety state. Performs no network, shell, filesystem traversal, or GitHub writes.",
    inputSchema: objectSchema({}),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_submission_readiness",
    title: "MCP Submission Readiness",
    description: "Run a local self-audit of PCF MCP registry readiness: package bin, Glama metadata, docs, smoke wiring, resources, prompts, and safe tool annotations. Does not submit anywhere.",
    inputSchema: objectSchema({}),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_evaluate",
    title: "Evaluate Contribution",
    description: "Evaluate one supplied issue or pull request payload using PCF review-readiness logic. Input is caller-supplied JSON only; this tool does not collect GitHub data or mutate anything.",
    inputSchema: objectSchema({
      input: { type: "object", description: "Normalized PCF issue or pull request payload." },
      profile: { type: "string", description: "Optional PCF profile override such as standard or kernel-grade." }
    }, ["input"]),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_preflight",
    title: "Contributor Preflight",
    description: "Run contributor preflight over a supplied normalized payload or patch text. Returns ready=false unless the evaluation is maintainer-ready, or allowRepair is true and it only needs repair.",
    inputSchema: objectSchema({
      input: { type: "object", description: "Normalized PCF payload. Use this or patchText." },
      patchText: { type: "string", description: "Plain-text patch or mbox content. Uses kernel-grade patch parsing." },
      repositoryFiles: { type: "array", items: { type: "object" }, description: "Optional policy files supplied alongside patchText." },
      profile: { type: "string", description: "Optional profile override." },
      allowRepair: { type: "boolean", default: false, description: "If true, needs-repair passes the caller's preflight gate." }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_queue",
    title: "Build Maintainer Queue",
    description: "Build a maintainer queue from supplied items. This is the deterministic queue step only; no repository collection, comments, labels, or GitHub writes are performed.",
    inputSchema: objectSchema({
      queue: { type: "object", description: "Queue payload with repository and items." },
      profile: { type: "string", description: "Optional profile override." }
    }, ["queue"]),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_watchlist_report",
    title: "Build Watchlist Report",
    description: "Render a watchlist report from supplied config and run proofs. This does not scan GitHub; agents must supply already-collected run evidence.",
    inputSchema: objectSchema({
      config: { type: "object", description: "Watchlist config object." },
      runs: { type: "array", items: { type: "object" }, description: "Already-collected per-repository run proofs." },
      generatedAt: { type: "string", description: "Optional ISO timestamp." }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_contributor_preflight",
    title: "Contributor Candidate Preflight",
    description: "Evaluate supplied review-now issue candidates and overlap-check results into candidate, blocked, or unchecked rows.",
    inputSchema: objectSchema({
      proof: { type: "object", description: "PCF public-pilot proof containing queue.items." },
      checks: { type: "array", items: { type: "object" }, description: "Overlap check evidence, usually open PR search results." },
      generatedAt: { type: "string", description: "Optional ISO timestamp." }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_ai_contribution_posture",
    title: "AI Contribution Posture Gate",
    description: "Classify AI-assisted contribution risk for a repository using the evidence-based posture index and optional caller-supplied policy/discussion text. Does not search GitHub.",
    inputSchema: objectSchema({
      repository: { type: "string", description: "owner/repo target." },
      aiAssisted: { type: "boolean", default: true, description: "If false, the gate is informational and returns skipped." },
      policyHits: {
        type: "array",
        items: { type: "string" },
        description: "Optional CONTRIBUTING/issue/PR excerpts mentioning AI, LLM, Copilot, or generated code."
      },
      indexMarkdown: { type: "string", description: "Optional posture-index markdown override. Defaults to the bundled docs index." },
      generatedAt: { type: "string" }
    }, ["repository"]),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_scout",
    title: "Contributor Scout",
    description: "Rank supplied contribution candidates by invitation, overlap, scope, platform fit, and maintainer-readiness signals. This tool does not search GitHub by itself.",
    inputSchema: objectSchema({
      candidates: { type: "array", items: { type: "object" }, description: "Candidate issues with repository, labels, body, overlap, and policy signals." },
      profile: { type: "string", default: "contributor" },
      minScore: { type: "integer", default: 0 },
      requireInvitation: { type: "boolean", default: true },
      generatedAt: { type: "string" }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_repository_context",
    title: "Analyze Repository Context",
    description: "Analyze supplied repository issue/PR/upstream context for duplicates, concurrent work, solved issues, and upstream-fixed signals. No GitHub collection is performed.",
    inputSchema: objectSchema({
      input: { type: "object", description: "Contribution payload with repositoryContext or repoContext already supplied." }
    }, ["input"]),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_duplicate_assist",
    title: "Semantic Duplicate Assist",
    description: "Run deterministic title/body token overlap over supplied duplicate candidates when full repository context is unavailable. Output is advisory and requires manual verification.",
    inputSchema: objectSchema({
      input: { type: "object", description: "Contribution payload plus duplicateAssist candidates or repositoryContext candidates." },
      repositoryTriage: { type: "object", description: "Optional repository triage result that disables degraded duplicate assist when concrete findings exist." }
    }, ["input"]),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_policy_profile",
    title: "Build Policy Profile",
    description: "Extract project policy requirements from supplied CONTRIBUTING, PR template, CODEOWNERS, manifest, and maintainer files. Does not read repository files from disk.",
    inputSchema: objectSchema({
      repositoryFiles: { type: "array", items: { type: "object" }, description: "Policy files as {path, content} objects." },
      files: { type: "array", items: { type: "object" }, description: "Optional changed files for CODEOWNERS/maintainer matching." },
      contributingText: { type: "string", description: "Optional direct CONTRIBUTING excerpt." }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_policy_scan",
    title: "TODO/FIXME Policy Scan",
    description: "Scan supplied touched file contents for TODO/FIXME/architecture signals that may conflict with a proposed contribution. This is the mvdan/sh TODO lesson as a reusable gate.",
    inputSchema: objectSchema({
      files: { type: "array", items: { type: "object" }, description: "Touched files as {path, content} objects." },
      touchedPaths: { type: "array", items: { type: "string" }, description: "Optional path filter." },
      changeSummary: { type: "string", description: "Short summary of the behavior being changed." },
      issueTitle: { type: "string" },
      issueBody: { type: "string" },
      strictTodoScan: { type: "boolean", default: false }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_diff_shape",
    title: "Diff Shape Gate",
    description: "Check supplied changed-file stats against reviewability limits, forbidden generated paths, lockfile churn, and issue-named path intersection.",
    inputSchema: objectSchema({
      files: { type: "array", items: { type: "object" }, description: "Changed files as {path|filename, additions, deletions}." },
      issuePaths: { type: "array", items: { type: "string" }, description: "Paths named by the issue or maintainer." },
      maxFiles: { type: "integer", default: 8 },
      maxLines: { type: "integer", default: 300 },
      forbiddenPathPatterns: { type: "array", items: { type: "string" } },
      allowLockfiles: { type: "boolean", default: false }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_repro_gate",
    title: "Repro Evidence Gate",
    description: "Classify caller-supplied before/after reproduction and validation evidence. This tool records no files and never executes commands.",
    inputSchema: objectSchema({
      before: { type: "object", description: "Before-fix evidence as {verdict, notes, commands}." },
      after: { type: "object", description: "After-fix validation evidence as {verdict, notes, commands}." },
      commands: { type: "array", items: { type: "object" }, description: "Optional phase-tagged command evidence supplied by the caller." },
      artifacts: { type: "array", items: { type: "object" } },
      generatedAt: { type: "string" }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_lane_status",
    title: "Contribution Lane Status",
    description: "Summarize supplied scout, overlap, policy, repro, diff, preflight, PR, and provenance gates into a lane status and next gate. Does not verify external state.",
    inputSchema: objectSchema({
      repository: { type: "string" },
      issue: { type: "string" },
      branch: { type: "string" },
      pr: { type: "string" },
      gates: { type: "object", description: "Gate status map." },
      artifacts: { type: "array", items: { type: "object" } },
      gateOrder: { type: "array", items: { type: "string" } }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_lane_resume",
    title: "Resume Contribution Lane",
    description: "Read a local lane record from the fixed PCF lane store and summarize the next gate. This does not verify external state.",
    inputSchema: objectSchema({
      laneId: { type: "string" },
      repository: { type: "string" },
      issue: { type: "string" },
      branch: { type: "string" },
      gateOrder: { type: "array", items: { type: "string" } }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_lane_save",
    title: "Save Lane Record",
    description: "Write a local PCF lane JSON record under the fixed PCF lane store. This is local evidence storage only and never performs public GitHub actions.",
    inputSchema: objectSchema({
      laneId: { type: "string" },
      repository: { type: "string" },
      issue: { type: "string" },
      branch: { type: "string" },
      pr: { type: "string" },
      status: { type: "string" },
      summary: { type: "string" },
      gates: { type: "object" },
      artifacts: { type: "array", items: { type: "object" } },
      decisions: { type: "array", items: { type: "string" } },
      nextSteps: { type: "array", items: { type: "string" } },
      record: { type: "object", description: "Optional complete lane record." }
    }),
    annotations: LOCAL_WRITE_ANNOTATIONS
  },
  {
    name: "pcf_lane_read",
    title: "Read Lane Record",
    description: "Read a local PCF lane record by sanitized lane id or repository/issue fields.",
    inputSchema: objectSchema({
      laneId: { type: "string" },
      repository: { type: "string" },
      issue: { type: "string" },
      branch: { type: "string" }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_lane_list",
    title: "List Lane Records",
    description: "List local PCF lane records from the fixed PCF lane store, optionally filtered by repository.",
    inputSchema: objectSchema({
      repository: { type: "string" },
      limit: { type: "integer", default: 25 }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_evidence_bundle_save",
    title: "Save Evidence Bundle",
    description: "Write a local evidence bundle for repro/preflight output under a lane. Records caller-supplied evidence only; it does not execute commands.",
    inputSchema: objectSchema({
      laneId: { type: "string" },
      repository: { type: "string" },
      issue: { type: "string" },
      kind: { type: "string", default: "repro" },
      verdict: { type: "string" },
      before: {},
      after: {},
      commands: { type: "array", items: { type: "object" } },
      artifacts: { type: "array", items: { type: "object" } },
      notes: { type: "string" }
    }),
    annotations: LOCAL_WRITE_ANNOTATIONS
  },
  {
    name: "pcf_pr_body_draft",
    title: "PR Body Draft",
    description: "Draft a maintainer-friendly PR body from supplied problem, change, risk, validation, and evidence. Draft-only: it never opens or updates a PR.",
    inputSchema: objectSchema({
      issue: { type: "string" },
      problem: { type: "string" },
      change: { type: "string" },
      risks: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }] },
      validation: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }] },
      evidence: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }] }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_provenance_draft",
    title: "Post-Merge Provenance Draft",
    description: "Draft one short project-centered PCF provenance comment for an already-merged PR. Draft-only: it never posts and explicitly avoids endorsement language.",
    inputSchema: objectSchema({
      contribution: { type: "string" },
      scope: { type: "string" },
      verification: { type: "string" }
    }),
    annotations: TOOL_ANNOTATIONS
  },
  {
    name: "pcf_calibration_profile",
    title: "Build Calibration Profile",
    description: "Build an auditable calibration profile from supplied maintainer feedback and promoted candidate fixtures. Does not read local data files or train a model.",
    inputSchema: objectSchema({
      feedbackEntries: { type: "array", items: { type: "object" } },
      candidates: { type: "array", items: { type: "object" } },
      repository: { type: "string" },
      generatedAt: { type: "string" }
    }),
    annotations: TOOL_ANNOTATIONS
  }
];

const RESOURCES = [
  {
    uri: "pcf://status",
    name: "PCF MCP Status",
    description: "Package version, dry-run posture, and MCP safety state.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://mcp/server-card",
    name: "PCF MCP Server Card",
    description: "Registry-oriented server metadata, install guidance, capabilities, and safety contract.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://api/spec",
    name: "PCF API Spec",
    description: "Sanitized local API and schema summary.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://schemas/lane",
    name: "PCF Lane JSON Schema",
    description: "Machine-readable contribution-lane schema and gate order.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://schemas/repro",
    name: "PCF Repro Evidence JSON Schema",
    description: "Machine-readable before/after reproduction evidence shape for pcf_repro_gate.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://doctrine/safety",
    name: "PCF MCP Safety Doctrine",
    description: "Non-claims, gate order, public-action boundary, and local-write boundary for agent use.",
    mimeType: "application/json"
  },
  {
    uri: "pcf://docs/watchlist",
    name: "Watchlist Contribution Radar",
    description: "Read-only watchlist operating model.",
    mimeType: "text/markdown"
  },
  {
    uri: "pcf://docs/upstream-ledger",
    name: "Upstream Contribution Learning Ledger",
    description: "Public wins, misses, blockers, and retained gates.",
    mimeType: "text/markdown"
  },
  {
    uri: "pcf://docs/ai-posture-index",
    name: "AI Contribution Posture Index",
    description: "Evidence-based repo compatibility index for AI-assisted contributions.",
    mimeType: "text/markdown"
  },
  {
    uri: "pcf://config/watchlist",
    name: "Default Watchlist Config",
    description: "Curated local watchlist configuration, when present.",
    mimeType: "application/json"
  }
];

const PROMPTS = [
  {
    name: "pcf_review_lane",
    description: "Guide an agent through a PCF-safe contribution lane review before coding.",
    arguments: [
      { name: "repository", description: "owner/repo", required: false },
      { name: "issue", description: "Issue number or URL", required: false }
    ]
  },
  {
    name: "pcf_prepare_pr",
    description: "Prepare evidence for a small, maintainer-friendly PR body.",
    arguments: [
      { name: "issue", description: "Related issue reference", required: false },
      { name: "summary", description: "One-line fix summary", required: false }
    ]
  },
  {
    name: "pcf_post_merge_provenance",
    description: "Draft a single short project-centered provenance note after merge.",
    arguments: [
      { name: "contribution", description: "What was merged", required: false }
    ]
  },
  {
    name: "pcf_submission_review",
    description: "Review PCF MCP before Glama or registry submission.",
    arguments: [
      { name: "target", description: "Registry or review target, e.g. Glama", required: false },
      { name: "notes", description: "Known reviewer concerns or local context", required: false }
    ]
  }
];

export function listPcfMcpTools() {
  return TOOLS.map((tool) => ({ ...tool, inputSchema: deepClone(tool.inputSchema), annotations: { ...tool.annotations } }));
}

export function listPcfMcpResources() {
  return RESOURCES.map((resource) => ({ ...resource }));
}

export function listPcfMcpPrompts() {
  return PROMPTS.map((prompt) => ({ ...prompt, arguments: prompt.arguments.map((arg) => ({ ...arg })) }));
}

export async function callPcfMcpTool(name, arguments_ = {}) {
  const args = arguments_ || {};
  switch (name) {
    case "pcf_health":
      return buildHealth();
    case "pcf_submission_readiness":
      return submissionReadiness();
    case "pcf_evaluate": {
      const input = args.input || {};
      return evaluateContribution(input, { profile: args.profile || input.profile });
    }
    case "pcf_preflight": {
      const input = args.patchText
        ? parsePatchSubmission(args.patchText, { profile: args.profile || "kernel-grade", repositoryFiles: args.repositoryFiles || [] })
        : { ...(args.input || {}), profile: args.profile || args.input?.profile };
      const evaluation = evaluateContribution(input, { profile: args.profile || input.profile });
      const ready = evaluation.status === "ready-for-maintainer" || (args.allowRepair === true && evaluation.status === "needs-repair");
      return {
        ready,
        gate: args.allowRepair === true ? "ready-for-maintainer or needs-repair passes" : "ready-for-maintainer only",
        evaluation
      };
    }
    case "pcf_queue":
      return buildMaintainerQueue(args.queue || {}, { profile: args.profile || args.queue?.profile || "" });
    case "pcf_watchlist_report":
      return buildWatchlistReport({ config: args.config || {}, runs: args.runs || [], generatedAt: args.generatedAt || new Date().toISOString() });
    case "pcf_contributor_preflight":
      return buildContributorPreflight({ proof: args.proof || {}, checks: args.checks || [], generatedAt: args.generatedAt || new Date().toISOString() });
    case "pcf_ai_contribution_posture":
      return evaluateAiContributionPostureGate(args);
    case "pcf_scout":
      return buildContributorScout(args);
    case "pcf_repository_context":
      return analyzeRepositoryContext(args.input || {});
    case "pcf_duplicate_assist":
      return buildSemanticDuplicateAssist(args.input || {}, args.repositoryTriage || null);
    case "pcf_policy_profile":
      return buildPolicyProfile({ repositoryFiles: args.repositoryFiles || [], files: args.files || args.changedFiles || [], contributingText: args.contributingText || "" });
    case "pcf_policy_scan":
      return scanTouchedFilePolicy(args);
    case "pcf_diff_shape":
      return evaluateDiffShape(args);
    case "pcf_repro_gate":
      return evaluateReproGate(args);
    case "pcf_lane_status":
      return buildLaneStatus(args);
    case "pcf_lane_resume":
      return resumeLaneRecord(args);
    case "pcf_lane_save":
      return saveLaneRecord(args);
    case "pcf_lane_read":
      return readLaneRecord(args);
    case "pcf_lane_list":
      return listLaneRecords(args);
    case "pcf_evidence_bundle_save":
      return saveEvidenceBundle(args);
    case "pcf_pr_body_draft":
      return buildPrBodyDraft(args);
    case "pcf_provenance_draft":
      return buildProvenanceDraft(args);
    case "pcf_calibration_profile":
      return buildFeedbackCalibration({
        feedbackEntries: args.feedbackEntries || [],
        candidates: args.candidates || [],
        repository: args.repository || "",
        generatedAt: args.generatedAt || new Date().toISOString()
      });
    default:
      throw new Error(`Unknown PCF MCP tool: ${name}`);
  }
}

async function resumeLaneRecord(args = {}) {
  let stored;
  try {
    stored = await readLaneRecord(args);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: false,
        id: laneIdFor(args),
        status: "missing",
        summary: "No local PCF lane record was found for the supplied lane id or repository/issue.",
        nextGate: {
          id: "lane_save",
          status: "blocked",
          reason: "Save or supply a lane record before resuming."
        },
        lane: {
          repository: args.repository || "",
          issue: args.issue || "",
          branch: args.branch || "",
          pr: args.pr || ""
        },
        gates: {},
        artifacts: [],
        nonClaims: [
          "Lane resume reads local PCF lane evidence only.",
          "A missing lane does not prove the contribution lane is invalid; it means this local store has no saved record."
        ]
      };
    }
    throw error;
  }
  const record = stored.record || {};
  const status = buildLaneStatus({
    lane: record.lane || {},
    repository: record.lane?.repository,
    issue: record.lane?.issue,
    branch: record.lane?.branch,
    pr: record.lane?.pr,
    gates: record.gates || {},
    artifacts: record.artifacts || [],
    gateOrder: args.gateOrder
  });
  return {
    ok: true,
    id: stored.id,
    path: stored.path,
    status: status.status,
    summary: status.summary,
    nextGate: status.nextGate,
    lane: status.lane,
    gates: status.gates,
    artifacts: status.artifacts,
    recordUpdatedAt: record.updatedAt || "",
    nonClaims: [
      "Lane resume reads local PCF lane evidence only.",
      "It does not contact GitHub, inspect local git state, execute commands, or verify whether evidence is current."
    ]
  };
}

export async function readPcfMcpResource(uri) {
  if (uri === "pcf://status") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(await buildHealth(), null, 2)
    };
  }
  if (uri === "pcf://mcp/server-card") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(await serverCard(), null, 2)
    };
  }
  if (uri === "pcf://api/spec") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(createApiSpec(loadConfig(REPO_ROOT)), null, 2)
    };
  }
  if (uri === "pcf://schemas/lane") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(laneSchemaResource(), null, 2)
    };
  }
  if (uri === "pcf://schemas/repro") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(reproEvidenceSchemaResource(), null, 2)
    };
  }
  if (uri === "pcf://doctrine/safety") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(safetyDoctrineResource(), null, 2)
    };
  }
  if (uri === "pcf://docs/watchlist") {
    return readKnownFileResource(uri, "docs/WATCHLIST.md", "text/markdown");
  }
  if (uri === "pcf://docs/upstream-ledger") {
    return readKnownFileResource(uri, "docs/UPSTREAM_CONTRIBUTION_LEDGER.md", "text/markdown");
  }
  if (uri === "pcf://docs/ai-posture-index") {
    return readKnownFileResource(uri, "docs/AI_CONTRIBUTION_POSTURE_INDEX.md", "text/markdown");
  }
  if (uri === "pcf://config/watchlist") {
    return readKnownFileResource(uri, "config/watchlist.json", "application/json");
  }
  throw new Error(`Unknown PCF MCP resource: ${uri}`);
}

export async function getPcfMcpPrompt(name, arguments_ = {}) {
  const args = arguments_ || {};
  if (name === "pcf_review_lane") {
    const repository = args.repository ? ` for ${args.repository}` : "";
    const issue = args.issue ? ` issue ${args.issue}` : "";
    return promptResult("PCF lane review", [
      `Review the contribution lane${repository}${issue} with PCF discipline before coding.`,
      "Check issue state, maintainer comments, duplicate/open PR overlap, AI-assisted contribution posture, contribution policy, TODO/FIXME signals, platform fit, local reproduction, and expected diff shape.",
      "Stop before public action unless every gate has evidence and the human approved the target."
    ].join("\n"));
  }
  if (name === "pcf_prepare_pr") {
    return promptResult("PCF PR preparation", [
      `Prepare a small PR body for ${args.issue || "the related issue"}.`,
      `Summary: ${args.summary || "narrow fix"}`,
      "Use evidence, exact validation commands that were actually run, risk/blast-radius notes, and no unrelated cleanup."
    ].join("\n"));
  }
  if (name === "pcf_post_merge_provenance") {
    return promptResult("PCF post-merge provenance", [
      "Draft exactly one short thank-you/provenance note for an already merged PR.",
      `Contribution: ${args.contribution || "the merged fix"}`,
      "Keep it project-centered: PCF helped keep scope narrow, check overlap, and verify behavior. Do not imply maintainer endorsement."
    ].join("\n"));
  }
  if (name === "pcf_submission_review") {
    return promptResult("PCF MCP submission review", [
      `Review PCF MCP for ${args.target || "registry submission"}.`,
      args.notes ? `Context: ${args.notes}` : "Context: local-only review before any public submission.",
      "Run pcf_submission_readiness first, then read pcf://mcp/server-card and pcf://doctrine/safety.",
      "Verify tool annotations, local-write boundaries, docs, smoke command, package bin, and glama.json.",
      "Do not submit, push, badge, or publish without explicit human approval."
    ].join("\n"));
  }
  throw new Error(`Unknown PCF MCP prompt: ${name}`);
}

async function evaluateAiContributionPostureGate(args = {}) {
  const markdown = args.indexMarkdown || await readFile(join(REPO_ROOT, "docs/AI_CONTRIBUTION_POSTURE_INDEX.md"), "utf8");
  const index = parseAiContributionPostureIndex(markdown);
  return evaluateAiContributionPosture({
    repository: args.repository,
    aiAssisted: args.aiAssisted,
    policyHits: args.policyHits || [],
    index,
    generatedAt: args.generatedAt || new Date().toISOString()
  });
}

async function buildHealth() {
  const pkg = await packageMetadata();
  return {
    ok: true,
    app: PCF_MCP_SERVER_NAME,
    protocolVersion: PCF_MCP_PROTOCOL_VERSION,
    packageVersion: pkg.version,
    packageName: pkg.name,
    repoRoot: REPO_ROOT,
    dryRunDefault: true,
    githubWriteToolsExposed: false,
    localArtifactWrites: "fixed PCF lane/evidence store only",
    localArtifactWriteTools: ["pcf_lane_save", "pcf_evidence_bundle_save"],
    submissionReadinessTool: "pcf_submission_readiness",
    serverCardResource: "pcf://mcp/server-card",
    githubWrites: "disabled",
    shellExecution: "not exposed",
    arbitraryFileRead: "not exposed",
    resources: RESOURCES.map((resource) => resource.uri),
    tools: TOOLS.map((tool) => tool.name),
    nonClaims: [
      "PCF MCP v1 is an agent-facing default-safe adapter with explicit local evidence-write tools.",
      "It does not open PRs, post comments, apply labels, push branches, or execute shell commands.",
      "Network collection remains a CLI/API/operator concern unless a future tool explicitly gates it."
    ]
  };
}

async function packageMetadata() {
  const text = await readFile(join(REPO_ROOT, "package.json"), "utf8");
  const parsed = JSON.parse(text);
  return {
    name: parsed.name || PCF_MCP_SERVER_NAME,
    version: parsed.version || "0.0.0",
    description: parsed.description || "",
    license: parsed.license || "",
    repository: parsed.repository || {},
    homepage: parsed.homepage || "",
    bin: parsed.bin || {},
    files: parsed.files || [],
    keywords: parsed.keywords || [],
    scripts: parsed.scripts || {}
  };
}

async function serverCard() {
  return buildMcpServerCard({
    packageInfo: await packageMetadata(),
    tools: listPcfMcpTools(),
    resources: listPcfMcpResources(),
    prompts: listPcfMcpPrompts()
  });
}

async function submissionReadiness() {
  return buildMcpSubmissionReadiness({
    packageInfo: await packageMetadata(),
    tools: listPcfMcpTools(),
    resources: listPcfMcpResources(),
    prompts: listPcfMcpPrompts(),
    files: {
      glamaJson: await readGlamaMetadata(),
      mcpDocs: await pathExists("docs/MCP.md"),
      mcpSmoke: await pathExists("scripts/mcp-smoke.mjs")
    }
  });
}

async function readGlamaMetadata() {
  try {
    const parsed = JSON.parse(await readFile(join(REPO_ROOT, "glama.json"), "utf8"));
    const maintainers = Array.isArray(parsed.maintainers) ? parsed.maintainers : [];
    const uniqueMaintainers = new Set(maintainers);
    return {
      exists: true,
      valid: parsed.$schema === "https://glama.ai/mcp/schemas/server.json"
        && maintainers.length > 0
        && maintainers.every((maintainer) => typeof maintainer === "string" && maintainer.trim())
        && uniqueMaintainers.size === maintainers.length,
      schema: parsed.$schema || "",
      maintainers
    };
  } catch (error) {
    return {
      exists: error?.code !== "ENOENT",
      valid: false,
      error: error?.message || String(error)
    };
  }
}

async function pathExists(relativePath) {
  try {
    await access(join(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readKnownFileResource(uri, relativePath, mimeType) {
  const filePath = join(REPO_ROOT, relativePath);
  await access(filePath);
  return {
    uri,
    mimeType,
    text: await readFile(filePath, "utf8")
  };
}

function promptResult(description, text) {
  return {
    description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text
        }
      }
    ]
  };
}

function objectSchema(properties = {}, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
