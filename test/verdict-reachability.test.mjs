import test from "node:test";
import assert from "node:assert/strict";

import { evaluateClaimIntegrity } from "../src/core/claim-integrity.mjs";
import { evaluateDiffShape } from "../src/core/diff-shape.mjs";
import { buildLaneStatus } from "../src/core/lane-status.mjs";
import { scanTouchedFilePolicy } from "../src/core/policy-scan.mjs";
import { evaluateReproGate } from "../src/core/repro-gate.mjs";
import { evaluateResidueRegister } from "../src/core/residue-register.mjs";

const GATES = {
  repro: {
    pass: () => evaluateReproGate({
      before: { commands: [{ command: "before", exitCode: 1, outputPath: "before.log" }] },
      after: { commands: [{ command: "after", exitCode: 0, outputPath: "after.log" }] }
    }).status,
    review: () => evaluateReproGate({
      before: {},
      after: { commands: [{ command: "after", exitCode: 0, outputPath: "after.log" }] }
    }).status,
    blocked: () => evaluateReproGate({
      before: { commands: [{ command: "before", exitCode: 1, outputPath: "before.log" }] },
      after: { commands: [{ command: "after", exitCode: 1, outputPath: "after.log" }] }
    }).status
  },
  claimIntegrity: {
    pass: () => evaluateClaimIntegrity(claimInput()).status,
    review: () => {
      const input = claimInput();
      input.surface.state = "unknown";
      return evaluateClaimIntegrity(input).status;
    },
    blocked: () => {
      const input = claimInput();
      input.surface.state = "none";
      return evaluateClaimIntegrity(input).status;
    }
  },
  diffShape: {
    pass: () => evaluateDiffShape({ files: [{ path: "src/core/x.mjs", additions: 5, deletions: 1 }] }).status,
    review: () => evaluateDiffShape({
      files: [
        { path: "src/core/x.mjs", additions: 5, deletions: 1 },
        { path: "package-lock.json", additions: 1, deletions: 1 }
      ]
    }).status,
    blocked: () => evaluateDiffShape({ files: [] }).status
  },
  policyScan: {
    pass: () => scanTouchedFilePolicy({
      changeSummary: "parser validation",
      files: [{ path: "src/parser.mjs", content: "export function parse() {}" }]
    }).status,
    review: () => scanTouchedFilePolicy({
      changeSummary: "",
      files: [{ path: "src/parser.mjs", content: "// TODO: revisit parser architecture\nexport function parse() {}" }]
    }).status,
    blocked: () => scanTouchedFilePolicy({
      changeSummary: "parser validation",
      strictTodoScan: true,
      files: [{ path: "src/parser.mjs", content: "// TODO: parser validation ownership\nexport function parse() {}" }]
    }).status
  },
  lane: {
    ready: () => buildLaneStatus({ gates: allLaneGates(() => passGate()) }).status,
    review: () => buildLaneStatus({
      gates: { ...allLaneGates(() => passGate()), claimIntegrity: { status: "review", evidence: [{ path: "claim.json" }] } }
    }).status,
    blocked: () => buildLaneStatus({
      gates: { ...allLaneGates(() => passGate()), claimIntegrity: { status: "blocked", evidence: [{ path: "claim.json" }] } }
    }).status
  }
};

test("core decision gates preserve their declared reachable verdict poles", () => {
  const unreachable = [];

  for (const [gate, controls] of Object.entries(GATES)) {
    for (const [expected, run] of Object.entries(controls)) {
      const actual = run();
      if (actual !== expected) {
        unreachable.push({
          id: `${gate}:${expected}`,
          category: "unreachable-verdict-pole",
          reason: `Expected ${gate} to reach ${expected}, observed ${actual}.`
        });
      }
    }
  }

  const register = evaluateResidueRegister({
    name: "core-gate-unreachable-verdict-poles",
    declared: [],
    observed: unreachable
  });

  assert.equal(register.status, "pass", JSON.stringify(register, null, 2));
  assert.equal(register.counts.observed, 0);
});

test("binary shrink-only residue register is intentionally one-sided and pinned separately", () => {
  assert.equal(evaluateResidueRegister({ declared: [], observed: [] }).status, "pass");
  assert.equal(evaluateResidueRegister({ declared: [], observed: ["new-residue"] }).status, "blocked");
});

function claimInput() {
  return {
    generatedAt: "2026-09-26T17:00:00Z",
    claim: {
      id: "REACH",
      statement: "The gate recognizes the served control.",
      assertedVerdict: "pass",
      scope: "test fixture",
      risk: "security",
      twoSided: true
    },
    surface: {
      observable: "served execution evidence",
      state: "served",
      requiredEvidenceKinds: ["execution"]
    },
    controls: {
      positive: {
        description: "safe control",
        expectedVerdict: "pass",
        observedVerdict: "pass",
        executed: true,
        evidence: [{ path: "positive.json", kind: "execution", source: "observed" }]
      },
      negative: {
        description: "unsafe control",
        expectedVerdict: "fail",
        observedVerdict: "fail",
        executed: true,
        evidence: [{ path: "negative.json", kind: "execution", source: "observed" }]
      }
    },
    evidence: [{ key: "exitCode", kind: "execution", source: "observed", value: 0, path: "positive.json" }],
    rootCause: {
      symptom: "control behavior",
      reachability: "fixture reaches gate",
      invariant: "verdict must discriminate",
      patchMechanism: "gate preserves both poles"
    },
    routing: {
      intendedAction: "mainline",
      contributionOwner: "contributor",
      releaseOwner: "maintainer",
      backportOwner: "maintainer",
      catalogueEligibility: "not-applicable",
      checkedAt: "2026-09-26T16:30:00Z",
      evidencePath: "route.json"
    },
    freshness: {
      required: true,
      checkedAt: "2026-09-26T16:30:00Z",
      asOf: "2026-09-26T17:00:00Z",
      maxAgeHours: 24,
      failOnStale: true
    }
  };
}

function passGate() {
  return { status: "pass", evidence: [{ path: "gate.json" }] };
}

function allLaneGates(factory) {
  return Object.fromEntries([
    "scout", "aiPosture", "overlap", "policy", "repro", "claimIntegrity",
    "diffShape", "preflight", "pr", "provenance", "calibration"
  ].map((id) => [id, factory(id)]));
}
