import { createHash } from "node:crypto";
import { CLAIM_INTEGRITY_VERSION, evaluateClaimIntegrity } from "./claim-integrity.mjs";

export const FALSIFICATION_PACKET_VERSION = "2026-09-26";

export function buildFalsificationPacket(input = {}) {
  input = plainObject(input);
  const integrityInput = plainObject(input.claimIntegrity || input.integrity || input);
  const integrity = evaluateClaimIntegrity(integrityInput);
  const target = normalizeTarget(input.target || integrityInput.target || {});
  const commands = normalizeCommands(input.commands || input.reproductionCommands || []);
  const parserRules = strings(input.parserRules || input.classificationRules);
  const exceptions = normalizeExceptions(input.exceptions || []);
  const adjacentShapes = strings(input.adjacentShapes || integrity.claim.generalization?.untestedShapes || []);
  const artifacts = normalizeArtifacts(input.artifacts || integrityInput.artifacts || []);
  const claim = {
    id: integrity.claim.id,
    statement: integrity.claim.statement,
    scope: integrity.claim.scope,
    assertedVerdict: integrity.claim.assertedVerdict,
    generalizedInvariant: integrity.claim.generalization?.statement || ""
  };

  const packetCore = {
    artifact: "pcf-falsification-packet",
    version: FALSIFICATION_PACKET_VERSION,
    claimIntegrityVersion: CLAIM_INTEGRITY_VERSION,
    repository: text(input.repository || input.repo),
    target,
    claim,
    evidenceSurface: integrity.surface,
    controls: integrity.controls,
    rootCause: integrity.rootCause,
    routing: integrity.routing,
    commands,
    parserRules,
    exceptions,
    adjacentShapes,
    artifacts,
    expected: {
      positiveControl: integrity.controls.positive.expectedVerdict || "pass",
      negativeControl: integrity.controls.negative.expectedVerdict || "fail",
      decisiveWithoutSurface: "not-allowed"
    },
    boundaries: strings(input.boundaries || [
      "Reproducing the narrow claim does not establish the broader generalized invariant.",
      "A disagreement is a useful result and should be reported without rounding it off.",
      "This packet authorizes reproduction only; it does not authorize public writes or upstream changes."
    ])
  };

  return {
    ...packetCore,
    packetSha256: sha256(stableObject(packetCore)),
    integrityStatus: integrity.status,
    readyToPublish: integrity.status === "pass",
    integrity,
    publicationBlockers: integrity.status === "pass"
      ? []
      : [
          {
            id: "claim-integrity-not-passed",
            reason: `Falsification packet is a draft because claim integrity is ${integrity.status}.`
          }
        ],
    nonClaims: [
      "The packet does not execute its commands or prove that target hashes, refs, or artifacts exist.",
      "It packages a falsifiable claim so another implementation or operator can try to break it.",
      "A ready packet is not a correctness, security, mergeability, or endorsement certificate."
    ]
  };
}

function normalizeTarget(value) {
  const target = plainObject(value);
  return {
    repository: text(target.repository || target.repo),
    ref: text(target.ref || target.commit || target.tag),
    artifact: text(target.artifact || target.package || target.file),
    sha256: text(target.sha256 || target.digest || target.hash),
    environment: text(target.environment || target.runtime)
  };
}

function normalizeCommands(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => {
      const command = typeof value === "string" ? { command: value } : plainObject(value);
      return {
        command: text(command.command || command.cmd),
        expectedExitCode: normalizeExitCode(command.expectedExitCode ?? command.exitCode),
        purpose: text(command.purpose || command.summary),
        outputPath: text(command.outputPath || command.path)
      };
    })
    .filter((entry) => entry.command || entry.outputPath);
}

function normalizeArtifacts(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => {
      const artifact = plainObject(value);
      return {
        path: text(artifact.path || artifact.uri || artifact.url),
        sha256: text(artifact.sha256 || artifact.digest || artifact.hash),
        kind: text(artifact.kind || artifact.type || "evidence"),
        summary: text(artifact.summary || artifact.note)
      };
    })
    .filter((entry) => entry.path || entry.sha256 || entry.summary);
}

function normalizeExceptions(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => {
      const entry = typeof value === "string" ? { id: value } : plainObject(value);
      return {
        id: text(entry.id || entry.testId || entry.name),
        condition: text(entry.condition || entry.when),
        verdict: text(entry.verdict || entry.outcome),
        reason: text(entry.reason || entry.summary),
        regressionPath: text(entry.regressionPath || entry.testPath || entry.path)
      };
    })
    .filter((entry) => entry.id || entry.condition || entry.reason);
}

function strings(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function normalizeExitCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
