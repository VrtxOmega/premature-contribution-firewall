import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { evaluateClaimIntegrity } from "../src/core/claim-integrity.mjs";
import { buildFalsificationPacket } from "../src/core/falsification-packet.mjs";
import { evaluateReproGate } from "../src/core/repro-gate.mjs";
import { buildFalsificationSubmission, evaluateClaimIntegritySubmission } from "../src/core/api.mjs";

const execFileAsync = promisify(execFile);
const cwd = new URL("..", import.meta.url);

function readyInput(overrides = {}) {
  return {
    generatedAt: "2026-09-26T17:00:00Z",
    claim: {
      id: "CI-001",
      statement: "The patch prevents the reproduced use-after-free without disabling valid submissions.",
      assertedVerdict: "pass",
      scope: "The pinned io_uring submission path only.",
      risk: "security",
      twoSided: true,
      generalization: {
        statement: "Transient submission pressure must not free state still referenced by the kernel.",
        testedShapes: ["EAGAIN retry", "successful served control"],
        untestedShapes: []
      }
    },
    surface: {
      observable: "A submitted operation remains alive until the kernel no longer references it.",
      state: "served",
      requiredEvidenceKinds: ["execution"]
    },
    controls: {
      positive: {
        description: "Patched build keeps the operation alive and completes successfully.",
        expectedVerdict: "pass",
        observedVerdict: "pass",
        executed: true,
        evidence: [{ path: "artifacts/after.json", kind: "execution", source: "observed" }]
      },
      negative: {
        description: "Unpatched build reproduces the lifetime violation.",
        expectedVerdict: "fail",
        observedVerdict: "fail",
        executed: true,
        evidence: [{ path: "artifacts/before.json", kind: "execution", source: "observed" }]
      }
    },
    evidence: [
      { key: "exitCode", kind: "execution", source: "observed", value: 0, path: "artifacts/after.json" },
      { key: "exitCode", kind: "execution", source: "claimed", value: 0, summary: "author report" }
    ],
    rootCause: {
      symptom: "Queued work could outlive the userspace state backing it.",
      reachability: "submit() returns EAGAIN while the SQE remains queued.",
      invariant: "Backing state must remain alive while the kernel may reference the operation.",
      patchMechanism: "Treat EAGAIN as retryable and preserve the operation until completion."
    },
    routing: {
      intendedAction: "mainline",
      contributionOwner: "contributor",
      releaseOwner: "maintainer",
      backportOwner: "maintainer",
      catalogueEligibility: "not-applicable",
      checkedAt: "2026-09-26T16:30:00Z",
      evidencePath: "artifacts/routing.json"
    },
    freshness: {
      required: true,
      checkedAt: "2026-09-26T16:30:00Z",
      asOf: "2026-09-26T17:00:00Z",
      maxAgeHours: 24,
      failOnStale: true
    },
    ...overrides
  };
}

test("claim integrity passes a two-sided high-risk claim with a real surface and controls", () => {
  const result = evaluateClaimIntegrity(readyInput());
  assert.equal(result.status, "pass");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.match(result.assessmentSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.authority.exitCode.source, "observed");
});

test("claim integrity blocks a decisive verdict when there is no surface", () => {
  const input = readyInput();
  input.surface.state = "none";
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "verdict-without-surface"));
});

test("observed evidence outranks and blocks a contradictory caller claim", () => {
  const input = readyInput();
  input.evidence = [
    { key: "exitCode", kind: "execution", source: "observed", value: 1, path: "actual.json" },
    { key: "exitCode", kind: "execution", source: "claimed", value: 0, summary: "claimed pass" }
  ];
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.equal(result.authority.exitCode.value, 1);
  assert.ok(result.blockers.some((entry) => entry.id === "observed-claim-conflict"));
});

test("control paths do not count when the control evidence is caller-claimed only", () => {
  const input = readyInput();
  input.controls.positive.evidence = [{ path: "claimed-after.json", kind: "execution", source: "claimed" }];
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "positive-control-unsubstantiated"));
});

test("two-sided controls must be reachable and discriminating", () => {
  const input = readyInput();
  input.controls.negative.observedVerdict = "pass";
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "negative-verdict-unreachable"));
  assert.ok(result.blockers.some((entry) => entry.id === "controls-do-not-discriminate"));
});

test("high-risk claims require symptom, reachability, invariant, and patch mechanism", () => {
  const input = readyInput();
  input.rootCause.reachability = "";
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "root-cause-chain-incomplete"));
});

test("stale ownership evidence and maintainer-owned backports fail closed", () => {
  const input = readyInput();
  input.routing.intendedAction = "backport";
  input.routing.backportOwner = "maintainer";
  input.routing.checkedAt = "2026-09-20T00:00:00Z";
  input.freshness.checkedAt = input.routing.checkedAt;
  input.freshness.maxAgeHours = 24;
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "backport-owned-by-maintainer"));
  assert.ok(result.blockers.some((entry) => entry.id === "context-evidence-stale"));
});

test("required freshness fails closed when its clock or age bound is unusable", () => {
  const missingAsOf = readyInput({ generatedAt: "" });
  missingAsOf.freshness.asOf = "";
  let result = evaluateClaimIntegrity(missingAsOf);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "freshness-asof-missing"));

  const badAge = readyInput();
  badAge.freshness.maxAgeHours = "not-a-number";
  result = evaluateClaimIntegrity(badAge);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "freshness-max-age-invalid"));

  const future = readyInput();
  future.freshness.checkedAt = "2026-09-26T17:00:01Z";
  result = evaluateClaimIntegrity(future);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "freshness-time-from-future"));
});

test("declared evaluator labels cannot satisfy a required independence claim", () => {
  const input = readyInput();
  input.independence = {
    required: true,
    requiredGroups: 2,
    supportedGroups: 2,
    basis: "declared",
    evidence: [{ kind: "provenance", source: "claimed", path: "declared-groups.json" }]
  };
  let result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "independence-declared-only"));
  assert.ok(result.blockers.some((entry) => entry.id === "independence-evidence-missing"));

  input.independence.basis = "external";
  input.independence.evidence = [{
    kind: "provenance",
    source: "external",
    path: "external/provenance.json",
    digest: "b".repeat(64)
  }];
  result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "pass");
  assert.equal(result.independence.supportedGroups, 2);
});

test("asserted generalized invariants cannot hide named untested shapes", () => {
  const input = readyInput();
  input.claim.generalization.asserted = true;
  input.claim.generalization.untestedShapes = ["redirect loop"];
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "generalization-has-untested-shapes"));
});

test("a one-sided contract needs a pinned reason and tangible control", () => {
  const input = readyInput();
  input.claim.twoSided = false;
  input.controls.oneSidedReason = "";
  const result = evaluateClaimIntegrity(input);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "one-sided-contract-unjustified"));
});

test("falsification packet packages a publish-ready claim without pretending to execute it", () => {
  const result = buildFalsificationPacket({
    repository: "owner/repo",
    target: {
      repository: "owner/repo",
      ref: "abc1234",
      artifact: "package-1.0.0.whl",
      sha256: "a".repeat(64),
      environment: "Python 3.13 / Linux"
    },
    claimIntegrity: readyInput(),
    commands: [{ command: "tool test --url http://127.0.0.1:9000", expectedExitCode: 2, purpose: "no-surface control" }],
    parserRules: ["PASS and FAIL are decisive; INCONCLUSIVE exits 2"],
    exceptions: [{ id: "X-001", condition: "404", verdict: "FAIL", reason: "contract-pinned", regressionPath: "test_x.py" }],
    adjacentShapes: ["redirect loop", "empty 500"]
  });
  assert.equal(result.readyToPublish, true);
  assert.equal(result.integrityStatus, "pass");
  assert.match(result.packetSha256, /^[a-f0-9]{64}$/);
  assert.match(result.nonClaims.join("\n"), /does not execute/i);
});

test("source-only falsification packets require an immutable commit rather than a moving branch label", () => {
  const base = {
    repository: "owner/repo",
    claimIntegrity: readyInput(),
    commands: [{ command: "node reproduce.mjs", expectedExitCode: 0 }],
    parserRules: ["exit 0 means the named control reached its expected verdict"]
  };

  const moving = buildFalsificationPacket({
    ...base,
    target: { repository: "owner/repo", ref: "main" }
  });
  assert.equal(moving.readyToPublish, false);
  assert.ok(moving.publicationBlockers.some((entry) => entry.id === "immutable-source-pin-missing"));

  const frozen = buildFalsificationPacket({
    ...base,
    target: { repository: "owner/repo", ref: "c".repeat(40) }
  });
  assert.equal(frozen.readyToPublish, true);
  assert.equal(frozen.target.commitSha, "c".repeat(40));
});

test("repro gate composes claim-integrity blockers instead of accepting an otherwise green before/after pair", () => {
  const bad = readyInput();
  bad.surface.state = "none";
  const result = evaluateReproGate({
    before: { commands: [{ command: "before", exitCode: 1, outputPath: "before.log" }] },
    after: { commands: [{ command: "after", exitCode: 0, outputPath: "after.log" }] },
    claimIntegrity: bad
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.id === "claim-integrity-blocked"));
});

test("API helpers expose the same deterministic claim-integrity and packet behavior", () => {
  assert.equal(evaluateClaimIntegritySubmission({ input: readyInput() }).status, "pass");
  const packet = buildFalsificationSubmission({
    input: {
      repository: "owner/repo",
      target: {
        repository: "owner/repo",
        ref: "abc1234",
        artifact: "release.tgz",
        sha256: "a".repeat(64)
      },
      claimIntegrity: readyInput(),
      commands: [{ command: "node repro.mjs", expectedExitCode: 0 }],
      parserRules: ["exit 0 means the named control reached its expected verdict"]
    }
  });
  assert.equal(packet.readyToPublish, true);
});

test("falsification packet fails closed without exact target identity or classification rules", () => {
  const packet = buildFalsificationPacket({
    repository: "owner/repo",
    target: { artifact: "release.tgz" },
    claimIntegrity: readyInput()
  });
  assert.equal(packet.readyToPublish, false);
  assert.ok(packet.publicationBlockers.some((entry) => entry.id === "target-ref-missing"));
  assert.ok(packet.publicationBlockers.some((entry) => entry.id === "artifact-digest-missing"));
  assert.ok(packet.publicationBlockers.some((entry) => entry.id === "reproduction-command-missing"));
  assert.ok(packet.publicationBlockers.some((entry) => entry.id === "classification-rule-missing"));
});

test("CLI exposes claim-integrity and falsify with fail-closed exit codes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-claim-integrity-"));
  try {
    const ready = join(dir, "ready.json");
    const blocked = join(dir, "blocked.json");
    const falsify = join(dir, "falsify.json");
    await writeFile(ready, JSON.stringify(readyInput()), "utf8");
    const blockedInput = readyInput();
    blockedInput.surface.state = "none";
    await writeFile(blocked, JSON.stringify(blockedInput), "utf8");
    await writeFile(falsify, JSON.stringify({
      repository: "owner/repo",
      target: {
        repository: "owner/repo",
        ref: "abc1234",
        artifact: "release.tgz",
        sha256: "a".repeat(64)
      },
      claimIntegrity: readyInput(),
      commands: [{ command: "node repro.mjs", expectedExitCode: 0 }],
      parserRules: ["exit 0 means the named control reached its expected verdict"]
    }), "utf8");

    const pass = await execFileAsync(process.execPath, ["src/cli.mjs", "claim-integrity", ready, "--format", "json"], { cwd });
    assert.equal(JSON.parse(pass.stdout).status, "pass");

    await assert.rejects(
      execFileAsync(process.execPath, ["src/cli.mjs", "claim-integrity", blocked, "--format", "json"], { cwd }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /"status"\s*:\s*"blocked"/);
        return true;
      }
    );

    const packet = await execFileAsync(process.execPath, ["src/cli.mjs", "falsify", falsify, "--format", "json"], { cwd });
    assert.equal(JSON.parse(packet.stdout).readyToPublish, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
