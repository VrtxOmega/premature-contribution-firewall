export const PCF_LANE_SCHEMA_VERSION = "2026-07-10";

export const PCF_LANE_GATE_ORDER = [
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
];

export const PCF_LANE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/VrtxOmega/premature-contribution-firewall/schemas/pcf-lane.schema.json",
  title: "PCF Contribution Lane",
  type: "object",
  additionalProperties: false,
  required: ["version", "id", "lane", "gates"],
  properties: {
    version: { const: PCF_LANE_SCHEMA_VERSION },
    id: { type: "string", minLength: 1 },
    status: { type: "string" },
    summary: { type: "string" },
    lane: {
      type: "object",
      additionalProperties: false,
      required: ["repository"],
      properties: {
        repository: { type: "string", pattern: "^[^/\\s]+/[^/\\s]+$" },
        issue: { type: "string" },
        branch: { type: "string" },
        pr: { type: "string" }
      }
    },
    gates: {
      type: "object",
      additionalProperties: { "$ref": "#/$defs/gate" }
    },
    artifacts: {
      type: "array",
      items: { "$ref": "#/$defs/artifact" }
    },
    decisions: {
      type: "array",
      items: { type: "string" }
    },
    nextSteps: {
      type: "array",
      items: { type: "string" }
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" }
  },
  $defs: {
    gate: {
      type: "object",
      additionalProperties: true,
      required: ["status"],
      properties: {
        status: {
          type: "string",
          enum: [
            "pending", "pass", "passed", "ready", "done", "merged", "accepted",
            "review", "warn", "warning", "partial", "unchecked",
            "blocked", "fail", "failed", "rejected", "closed", "error", "skipped"
          ]
        },
        reason: { type: "string" },
        evidence: {
          type: "array",
          items: { "$ref": "#/$defs/gateArtifact" }
        },
        updatedAt: { type: "string" }
      },
      allOf: [{
        if: { properties: { status: { enum: ["pass", "passed", "ready", "done", "merged", "accepted"] } } },
        then: { properties: { evidence: { minItems: 1 } }, required: ["evidence"] }
      }]
    },
    artifact: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        kind: { type: "string" },
        summary: { type: "string" }
      },
      anyOf: [
        { properties: { path: { minLength: 1 } }, required: ["path"] },
        { properties: { summary: { minLength: 1 } }, required: ["summary"] }
      ]
    },
    gateArtifact: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", minLength: 1 },
        kind: { type: "string" },
        summary: { type: "string" }
      }
    }
  }
};

export function laneSchemaResource() {
  return {
    version: PCF_LANE_SCHEMA_VERSION,
    gateOrder: PCF_LANE_GATE_ORDER,
    schema: PCF_LANE_SCHEMA,
    nonClaims: [
      "The lane schema records evidence and decisions; it does not prove the evidence is true.",
      "Public actions remain outside the MCP lane store."
    ]
  };
}
