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
  const order = normalizeGateOrder(input.gateOrder || DEFAULT_GATE_ORDER);
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

function normalizeGateOrder(values) {
  const order = (Array.isArray(values) ? values : DEFAULT_GATE_ORDER)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(order.length ? order : DEFAULT_GATE_ORDER)];
}

function normalizeGate(id, raw) {
  if (raw === true) return gate(id, "pass", "Gate was marked true.");
  if (raw === false) return gate(id, "pending", "Gate has not passed yet.");
  if (typeof raw === "string") return gate(id, raw, "");
  if (!raw || typeof raw !== "object") return gate(id, "pending", "No evidence supplied.");
  return gate(id, raw.status || raw.verdict || raw.state || "pending", raw.reason || raw.summary || "", raw);
}

function gate(id, status, reason = "", raw = {}) {
  const normalizedStatus = String(status || "pending").toLowerCase();
  return {
    id,
    status: normalizedStatus,
    classification: classifyStatus(normalizedStatus),
    reason: reason || defaultReason(id, normalizedStatus),
    evidence: raw.evidence || raw.artifacts || [],
    updatedAt: raw.updatedAt || raw.timestamp || ""
  };
}

function classifyStatus(status) {
  if (PASS_STATUSES.has(status)) return "passed";
  if (BLOCK_STATUSES.has(status)) return "blocked";
  if (REVIEW_STATUSES.has(status)) return "review";
  return "pending";
}

function normalizeArtifacts(values) {
  return (Array.isArray(values) ? values : [])
    .map((artifact) => ({
      path: String(artifact.path || artifact.uri || artifact.url || "").trim(),
      kind: String(artifact.kind || artifact.type || "evidence"),
      summary: String(artifact.summary || artifact.note || "")
    }))
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
