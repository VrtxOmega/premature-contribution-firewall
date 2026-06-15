export const PCF_REPRO_EVIDENCE_SCHEMA_VERSION = "2026-06-11";
export const PCF_SAFETY_DOCTRINE_VERSION = "2026-06-11";

export const PCF_REPRO_EVIDENCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/VrtxOmega/premature-contribution-firewall/schemas/pcf-repro-evidence.schema.json",
  title: "PCF Repro Evidence",
  type: "object",
  additionalProperties: false,
  required: ["before", "after"],
  properties: {
    before: { "$ref": "#/$defs/evidencePhase" },
    after: { "$ref": "#/$defs/evidencePhase" },
    commands: {
      type: "array",
      items: { "$ref": "#/$defs/commandEvidence" }
    },
    artifacts: {
      type: "array",
      items: { "$ref": "#/$defs/artifact" }
    },
    generatedAt: { type: "string" }
  },
  $defs: {
    evidencePhase: {
      type: "object",
      additionalProperties: false,
      properties: {
        verdict: { type: "string" },
        status: { type: "string" },
        notes: { type: "string" },
        commands: {
          type: "array",
          items: { "$ref": "#/$defs/commandEvidence" }
        }
      }
    },
    commandEvidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: { type: "string" },
        exitCode: { type: ["integer", "null"] },
        outputPath: { type: "string" },
        phase: { type: "string" }
      }
    },
    artifact: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        kind: { type: "string" },
        summary: { type: "string" }
      }
    }
  }
};

export const PCF_SAFETY_DOCTRINE = {
  version: PCF_SAFETY_DOCTRINE_VERSION,
  boundary: "PCF MCP packages evidence and readiness decisions for agents; public maintainer-facing actions stay outside MCP.",
  publicActionsOutsideMcp: [
    "opening pull requests",
    "posting comments",
    "applying labels",
    "pushing branches",
    "closing or reopening issues",
    "executing arbitrary shell commands"
  ],
  localWriteBoundary: {
    allowed: "fixed PCF lane/evidence store only",
    tools: ["pcf_lane_save", "pcf_evidence_bundle_save"],
    reason: "Local evidence continuity lets agents resume work without gaining maintainer-facing authority."
  },
  gateOrder: [
    "scout",
    "aiPosture",
    "overlap",
    "policy",
    "repro",
    "diffShape",
    "preflight",
    "pr",
    "provenance",
    "calibration"
  ],
  agentRule: "Use PCF MCP to decide whether a contribution lane is ready for public action. Do not use it to perform the public action.",
  nonClaims: [
    "PCF MCP does not prove correctness, acceptance, mergeability, or maintainer endorsement.",
    "PCF MCP does not collect live GitHub state unless a caller supplies that state as evidence.",
    "PCF MCP does not execute commands or inspect arbitrary repository files."
  ]
};

const LOCAL_WRITE_TOOLS = new Set(["pcf_lane_save", "pcf_evidence_bundle_save"]);
const PUBLIC_WRITE_TOOL_NAME = /(?:comment|label|merge|push|open_?pr|create_?pr|post_?comment|close_?issue|reopen_?issue)/i;

export function reproEvidenceSchemaResource() {
  return {
    version: PCF_REPRO_EVIDENCE_SCHEMA_VERSION,
    schema: PCF_REPRO_EVIDENCE_SCHEMA,
    acceptedVerdicts: {
      before: ["before-fails", "reproduced", "bug-reproduced", "failed"],
      after: ["pass", "passed", "fixed", "verified", "works", "success"]
    },
    nonClaims: [
      "The schema describes caller-supplied evidence; it does not prove the commands were run.",
      "Use pcf_repro_gate to classify the evidence before saving it to a lane."
    ]
  };
}

export function safetyDoctrineResource() {
  return PCF_SAFETY_DOCTRINE;
}

export function buildMcpServerCard({ packageInfo, tools, resources, prompts }) {
  const toolSummaries = tools.map((tool) => ({
    name: tool.name,
    title: tool.title || tool.name,
    readOnly: Boolean(tool.annotations?.readOnlyHint),
    localWrite: LOCAL_WRITE_TOOLS.has(tool.name),
    destructive: Boolean(tool.annotations?.destructiveHint),
    openWorld: Boolean(tool.annotations?.openWorldHint),
    description: tool.description
  }));

  return {
    name: "Premature Contribution Firewall MCP",
    packageName: packageInfo.name,
    version: packageInfo.version,
    description: packageInfo.description,
    license: packageInfo.license,
    repository: packageInfo.repository?.url || "",
    homepage: packageInfo.homepage || "",
    categories: ["Developer Tools", "Coding Agents", "Version Control", "CI/CD & DevOps"],
    keywords: packageInfo.keywords || [],
    transport: {
      type: "stdio",
      protocol: "JSON-RPC 2.0",
      command: "pcf-mcp"
    },
    install: {
      npmPackage: packageInfo.name,
      localCommand: "npm run mcp",
      smokeCommand: "npm run mcp:smoke",
      clientConfig: {
        command: "npx",
        args: ["-y", "-p", packageInfo.name, "pcf-mcp"]
      }
    },
    capabilities: {
      tools: toolSummaries,
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        mimeType: resource.mimeType,
        description: resource.description
      })),
      prompts: prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description
      }))
    },
    safety: {
      githubWrites: "disabled",
      shellExecution: "not exposed",
      arbitraryFileRead: "not exposed",
      localArtifactWrites: "fixed PCF lane/evidence store only",
      localArtifactWriteTools: [...LOCAL_WRITE_TOOLS],
      publicActionsOutsideMcp: PCF_SAFETY_DOCTRINE.publicActionsOutsideMcp
    },
    submissionNotes: [
      "Glama can index this repository from GitHub after a maintainer submits it.",
      "The repo includes glama.json with schema-valid maintainer metadata.",
      "pcf_submission_readiness returns a local self-audit before submission.",
      "No Glama badge should be added until a public Glama listing exists."
    ],
    nonClaims: PCF_SAFETY_DOCTRINE.nonClaims
  };
}

export function buildMcpSubmissionReadiness({ packageInfo, tools, resources, prompts, files }) {
  const resourceUris = new Set(resources.map((resource) => resource.uri));
  const promptNames = new Set(prompts.map((prompt) => prompt.name));
  const toolNames = new Set(tools.map((tool) => tool.name));
  const checks = [
    check(
      "glama-metadata",
      files.glamaJson?.valid === true,
      "glama.json exists at repo root and matches the live Glama schema requirement.",
      files.glamaJson || {}
    ),
    check(
      "package-bin-pcf-mcp",
      packageInfo.bin?.["pcf-mcp"] === "src/mcp/server.mjs",
      "package.json exposes the pcf-mcp stdio server bin."
    ),
    check(
      "package-files-include-mcp",
      Array.isArray(packageInfo.files)
        && packageInfo.files.includes("src")
        && packageInfo.files.includes("docs/MCP.md")
        && packageInfo.files.includes("scripts/mcp-smoke.mjs")
        && packageInfo.files.includes("glama.json"),
      "npm package files include MCP source, docs, smoke script, and Glama metadata."
    ),
    check(
      "smoke-script",
      files.mcpSmoke === true && packageInfo.scripts?.["mcp:smoke"] === "node scripts/mcp-smoke.mjs",
      "npm run mcp:smoke is wired to a deterministic stdio smoke test."
    ),
    check(
      "mcp-docs",
      files.mcpDocs === true,
      "docs/MCP.md exists for agent setup, safety, and tool reference."
    ),
    check(
      "no-public-write-tools",
      tools.every((tool) => !PUBLIC_WRITE_TOOL_NAME.test(tool.name)),
      "No MCP tool name exposes public GitHub write actions."
    ),
    check(
      "local-write-tools-declared",
      [...LOCAL_WRITE_TOOLS].every((name) => toolNames.has(name))
        && tools.every((tool) => !LOCAL_WRITE_TOOLS.has(tool.name) || tool.annotations?.readOnlyHint === false),
      "Only lane/evidence save tools are marked as local-write tools."
    ),
    check(
      "safe-annotations",
      tools.every((tool) => tool.annotations?.destructiveHint === false && tool.annotations?.openWorldHint === false),
      "Every tool declares non-destructive and closed-world annotation hints."
    ),
    check(
      "server-card-resource",
      resourceUris.has("pcf://mcp/server-card"),
      "MCP server-card resource is exposed for registry and agent review."
    ),
    check(
      "schema-and-doctrine-resources",
      ["pcf://schemas/lane", "pcf://schemas/repro", "pcf://doctrine/safety"].every((uri) => resourceUris.has(uri)),
      "Lane schema, repro schema, and safety doctrine resources are exposed."
    ),
    check(
      "submission-review-prompt",
      promptNames.has("pcf_submission_review"),
      "Submission review prompt is available for pre-registry audit."
    )
  ];

  const status = checks.some((entry) => entry.status === "blocked")
    ? "blocked"
    : checks.some((entry) => entry.status === "review")
      ? "review"
      : "pass";

  return {
    ok: status === "pass",
    status,
    summary: summarizeChecks(status, checks),
    generatedAt: new Date().toISOString(),
    checks,
    counts: {
      tools: tools.length,
      resources: resources.length,
      prompts: prompts.length,
      localWriteTools: [...LOCAL_WRITE_TOOLS].length
    },
    nextActions: status === "pass"
      ? [
          "Run npm run mcp:smoke and full repo verification before commit.",
          "Submit to Glama only after the human approves the public GitHub action."
        ]
      : checks.filter((entry) => entry.status !== "pass").map((entry) => entry.summary),
    nonClaims: [
      "Submission readiness is a local self-audit, not Glama approval.",
      "It does not submit to Glama, push to GitHub, or run a remote registry scan.",
      "It does not prove maintainer acceptance, correctness, or security."
    ]
  };
}

function check(id, passed, summary, details = {}) {
  return {
    id,
    status: passed ? "pass" : "blocked",
    summary,
    details
  };
}

function summarizeChecks(status, checks) {
  if (status === "pass") return `Pass: ${checks.length} MCP submission-readiness checks passed.`;
  const blocked = checks.filter((entry) => entry.status === "blocked").length;
  return `Blocked: ${blocked} MCP submission-readiness check(s) failed.`;
}
