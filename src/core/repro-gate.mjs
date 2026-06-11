const PASS_VERDICTS = new Set([
  "pass",
  "passed",
  "fixed",
  "after-passes",
  "verified",
  "works",
  "success"
]);

const FAIL_VERDICTS = new Set([
  "fail",
  "failed",
  "before-fails",
  "reproduced",
  "bug-reproduced",
  "still-fails",
  "regression"
]);

const FAILURE_TEXT = /\b(fail(?:ed|ing)?|error|exception|repro(?:duced)?|regression|mismatch|broken)\b/i;
const FIXED_TEXT = /\b(pass(?:ed|es|ing)?|fixed|verified|works|success|ok)\b/i;

export function evaluateReproGate(input = {}) {
  const before = normalizeEvidence(input.before || input.baseline || {}, "before");
  const after = normalizeEvidence(input.after || input.validation || {}, "after");
  const combinedCommands = normalizeCommands(input.commands || []);
  const beforeCommands = [...before.commands, ...combinedCommands.filter((command) => command.phase === "before")];
  const afterCommands = [...after.commands, ...combinedCommands.filter((command) => command.phase === "after" || command.phase === "validation")];
  const beforeEvidence = { ...before, commands: beforeCommands };
  const afterEvidence = { ...after, commands: afterCommands };
  const blockers = [];
  const warnings = [];

  const beforeHasFailure = hasFailureEvidence(beforeEvidence);
  const beforeHasEvidence = hasAnyEvidence(beforeEvidence);
  const afterHasEvidence = hasAnyEvidence(afterEvidence);
  const afterFailures = afterCommands.filter((command) => command.exitCode !== null && command.exitCode !== 0);
  const unknownAfterCommands = afterCommands.filter((command) => command.exitCode === null);
  const afterVerdict = normalizeStatus(afterEvidence.verdict || afterEvidence.status);
  const afterPassed = afterHasEvidence
    && afterFailures.length === 0
    && !FAIL_VERDICTS.has(afterVerdict)
    && (PASS_VERDICTS.has(afterVerdict) || afterCommands.some((command) => command.exitCode === 0) || FIXED_TEXT.test(afterEvidence.notes));

  if (!beforeHasEvidence) {
    warnings.push({
      id: "missing-before-evidence",
      severity: "warning",
      reason: "No before-fix reproduction evidence was supplied."
    });
  } else if (!beforeHasFailure) {
    warnings.push({
      id: "before-not-reproduced",
      severity: "warning",
      reason: "Before-fix evidence does not clearly show the issue reproducing."
    });
  }

  if (!afterHasEvidence) {
    blockers.push({
      id: "missing-after-evidence",
      severity: "blocker",
      reason: "No after-fix validation evidence was supplied."
    });
  }

  for (const command of afterFailures) {
    blockers.push({
      id: "after-command-failed",
      severity: "blocker",
      command: command.command,
      exitCode: command.exitCode,
      reason: "An after-fix validation command has a non-zero exit code."
    });
  }

  if (FAIL_VERDICTS.has(afterVerdict)) {
    blockers.push({
      id: "after-verdict-failed",
      severity: "blocker",
      reason: "After-fix evidence is marked as failing."
    });
  }

  if (afterHasEvidence && !afterPassed && !blockers.length) {
    warnings.push({
      id: "after-not-explicitly-passing",
      severity: "warning",
      reason: "After-fix evidence exists, but it is not explicitly passing or fixed."
    });
  }

  for (const command of unknownAfterCommands) {
    warnings.push({
      id: "after-command-exit-unknown",
      severity: "warning",
      command: command.command,
      reason: "After-fix validation command is missing an exit code."
    });
  }

  const status = blockers.length ? "blocked" : warnings.length ? "review" : "pass";
  return {
    ok: status === "pass",
    status,
    summary: summarizeReproGate({ status, beforeHasFailure, afterPassed, blockers, warnings }),
    gate: {
      status,
      reason: summarizeReproGate({ status, beforeHasFailure, afterPassed, blockers, warnings }),
      evidence: normalizeArtifacts(input.artifacts || []),
      updatedAt: input.generatedAt || new Date().toISOString()
    },
    evidence: {
      before: beforeEvidence,
      after: afterEvidence
    },
    blockers,
    warnings,
    nonClaims: [
      "Repro gate evaluates caller-supplied evidence only.",
      "PCF MCP did not execute these commands.",
      "A passing repro gate does not prove correctness without code review and maintainer judgment."
    ]
  };
}

function normalizeEvidence(value, phase) {
  return {
    phase,
    verdict: normalizeStatus(value.verdict || value.status || ""),
    notes: String(value.notes || value.note || value.summary || value.output || "").slice(0, 2000),
    commands: normalizeCommands(value.commands || value.command || []).map((command) => ({ ...command, phase }))
  };
}

function normalizeCommands(values) {
  return (Array.isArray(values) ? values : [values])
    .map((command) => typeof command === "string"
      ? { command, exitCode: null, outputPath: "", phase: "" }
      : {
          command: String(command.command || command.cmd || ""),
          exitCode: normalizeExitCode(command.exitCode ?? command.code ?? command.status),
          outputPath: String(command.outputPath || command.path || command.log || ""),
          phase: normalizeStatus(command.phase || command.kind || "")
        })
    .filter((command) => command.command || command.outputPath);
}

function normalizeArtifacts(values) {
  return (Array.isArray(values) ? values : [values])
    .map((artifact) => ({
      path: String(artifact.path || artifact.uri || artifact.url || "").trim(),
      kind: String(artifact.kind || artifact.type || "evidence"),
      summary: String(artifact.summary || artifact.note || "")
    }))
    .filter((artifact) => artifact.path || artifact.summary);
}

function hasAnyEvidence(evidence) {
  return Boolean(evidence.verdict || evidence.notes || evidence.commands.length);
}

function hasFailureEvidence(evidence) {
  if (FAIL_VERDICTS.has(evidence.verdict)) return true;
  if (evidence.commands.some((command) => command.exitCode !== null && command.exitCode !== 0)) return true;
  return FAILURE_TEXT.test(evidence.notes);
}

function normalizeExitCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function summarizeReproGate({ status, beforeHasFailure, afterPassed, blockers, warnings }) {
  if (status === "blocked") return `Blocked: ${blockers.length} repro evidence blocker(s).`;
  if (status === "review") return `Review: ${warnings.length} repro evidence warning(s).`;
  if (beforeHasFailure && afterPassed) return "Pass: before evidence reproduces the issue and after evidence passes.";
  return "Pass: supplied repro evidence is complete.";
}
