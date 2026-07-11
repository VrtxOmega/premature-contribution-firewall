const DEFAULT_GATE_ORDER = [
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

const PASS_STATUSES = new Set(["pass", "passed", "ready", "done", "merged", "accepted"]);
const BLOCK_STATUSES = new Set(["blocked", "fail", "failed", "rejected", "closed", "error"]);
const REVIEW_STATUSES = new Set(["review", "warn", "warning", "partial", "unchecked"]);

export function buildLaneStatus(input = {}) {
  input = plainObject(input);
  const suppliedGates = plainObject(input.gates);
  const order = normalizeGateOrder(input.gateOrder, Object.keys(suppliedGates));
  const gates = Object.fromEntries(order.map((gate) => [gate, normalizeGate(gate, input.gates?.[gate] || input[gate])]));
  const blockers = Object.values(gates).filter((gate) => gate.classification === "blocked");
  const reviews = Object.values(gates).filter((gate) => gate.classification === "review");
  const pending = Object.values(gates).filter((gate) => gate.classification === "pending");
  const nextGate = Object.values(gates).find((gate) => gate.classification !== "passed") || null;
  const status = blockers.length ? "blocked" : reviews.length ? "review" : pending.length ? "not-ready" : "ready";

  return {
    ok: status === "ready",
    status,
    lane: {
      repository: String(input.repository || input.lane?.repository || ""),
      issue: String(input.issue || input.issueNumber || input.lane?.issue || ""),
      branch: String(input.branch || input.lane?.branch || ""),
      pr: String(input.pr || input.pullRequest || input.lane?.pr || "")
    },
    summary: summarizeLaneStatus({ status, blockers, reviews, pending, nextGate }),
    nextGate: nextGate ? { id: nextGate.id, status: nextGate.status, reason: nextGate.reason } : null,
    gates,
    artifacts: normalizeArtifacts(input.artifacts || []),
    nonClaims: [
      "Lane status is an operator checklist over supplied evidence.",
      "It does not contact GitHub, inspect local git state, or verify commands unless those artifacts are supplied."
    ]
  };
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeGateOrder(values, discovered = []) {
  const requested = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const supplied = (Array.isArray(discovered) ? discovered : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set([...requested, ...supplied, ...DEFAULT_GATE_ORDER])];
}

function normalizeGate(id, raw) {
  if (raw === true) return gate(id, "review", "A boolean true does not include structured gate evidence.");
  if (raw === false) return gate(id, "pending", "Gate has not passed yet.");
  if (typeof raw === "string") {
    if (PASS_STATUSES.has(raw.toLowerCase())) {
      return gate(id, "review", `Bare string '${raw}' does not include structured gate evidence.`);
    }
    return gate(id, raw, "");
  }
  if (!raw || typeof raw !== "object") return gate(id, "pending", "No evidence supplied.");
  const status = String(raw.status || raw.verdict || raw.state || "pending").toLowerCase();
  if (PASS_STATUSES.has(status) && !hasStructuredGateEvidence(raw)) {
    return gate(id, "review", "A structured pass without a concrete evidence path cannot satisfy this gate.", raw);
  }
  return gate(id, status, raw.reason || raw.summary || "", raw);
}

function hasStructuredGateEvidence(raw) {
  return gateEvidence(raw).some((artifact) => artifact.path);
}

function gate(id, status, reason = "", raw = {}) {
  const normalizedStatus = String(status || "pending").toLowerCase();
  return {
    id,
    status: normalizedStatus,
    classification: classifyStatus(normalizedStatus),
    reason: reason || defaultReason(id, normalizedStatus),
    evidence: gateEvidence(raw),
    updatedAt: raw.updatedAt || raw.timestamp || ""
  };
}

function gateEvidence(raw) {
  return normalizeArtifacts([
    ...(Array.isArray(raw.evidence) ? raw.evidence : []),
    ...(Array.isArray(raw.artifacts) ? raw.artifacts : [])
  ]);
}

function classifyStatus(status) {
  if (PASS_STATUSES.has(status)) return "passed";
  if (BLOCK_STATUSES.has(status)) return "blocked";
  if (REVIEW_STATUSES.has(status)) return "review";
  return "pending";
}

function normalizeArtifacts(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => {
      const artifact = plainObject(value);
      return ({
        path: String(artifact.path || artifact.uri || artifact.url || "").trim(),
        kind: String(artifact.kind || artifact.type || "evidence"),
        summary: String(artifact.summary || artifact.note || "")
      });
    })
    .filter((artifact) => artifact.path || artifact.summary);
}

function defaultReason(id, status) {
  if (status === "pending") return `${id} evidence has not been supplied yet.`;
  return `${id} is ${status}.`;
}

function summarizeLaneStatus({ status, blockers, reviews, pending, nextGate }) {
  if (status === "blocked") return `Blocked by ${blockers.length} gate(s); next useful gate is ${nextGate?.id || "none"}.`;
  if (status === "review") return `Needs review on ${reviews.length} gate(s); next useful gate is ${nextGate?.id || "none"}.`;
  if (status === "not-ready") return `Not ready; ${pending.length} gate(s) still need evidence.`;
  return "Ready: all supplied lane gates passed.";
}
