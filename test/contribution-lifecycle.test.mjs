import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ContributionLifecycleError,
  assessContributionLifecycle,
  renderContributionLifecycleMarkdown,
  renderContributionLifecycleSummary
} from "../src/core/contribution-lifecycle.mjs";

const execFileAsync = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL("../fixtures/contribution-lifecycle-cases.json", import.meta.url), "utf8"));

test("lifecycle fixtures exercise every deterministic classification", () => {
  const observed = new Set();
  for (const item of fixture.cases) {
    const result = assessContributionLifecycle(item.input);
    observed.add(result.classification);
    assert.equal(result.classification, item.expected.classification, item.id);
    assert.equal(result.nextAction.id, item.expected.nextAction, item.id);
    assert.deepEqual(result.claimUnits.map((claim) => claim.lifecycleState), item.expected.claimStates, item.id);
    assert.equal(result.nextAction.publicWriteAuthorized, false, item.id);
    assert.equal(result.boundaries.outcomeUsedForClassification, false, item.id);
    assert.match(result.assessmentSha256, /^[a-f0-9]{64}$/, item.id);
  }
  assert.deepEqual(observed, new Set([
    "CURRENT_AND_APPLICABLE",
    "DRIFTED_BUT_REBASEABLE",
    "SALVAGEABLE_INVARIANT",
    "PARTIALLY_SUPERSEDED",
    "SUPERSEDED_EQUIVALENT",
    "INVALIDATED",
    "NEEDS_MAINTAINER_DECISION"
  ]));
});

test("Hermes case separates the observation-time decision from the later outcome", () => {
  const item = fixture.cases.find((entry) => entry.id === "hermes-two-claim-refactor-salvage");
  const result = assessContributionLifecycle(item.input);
  const withoutOutcome = structuredClone(item.input);
  delete withoutOutcome.outcome;
  const replay = assessContributionLifecycle(withoutOutcome);

  assert.equal(result.classification, "PARTIALLY_SUPERSEDED");
  assert.equal(result.nextAction.id, "extract-surviving-claim");
  assert.equal(result.salvagePacket.survivingClaims[0].id, "per-entry-key-env");
  assert.equal(result.salvagePacket.supersededClaims[0].id, "provider-model-pairing");
  assert.equal(result.outcome.state, "partially-salvaged");
  assert.equal(result.outcome.credit, "commit-author");
  assert.equal(result.outcome.usedForClassification, false);
  assert.equal(result.assessmentSha256, replay.assessmentSha256);
  assert.equal(result.classification, replay.classification);
  assert.match(result.publicProof.guidance, /do not describe the original contribution as directly merged/i);
});

test("contradictory evidence fails closed to maintainer decision", () => {
  const input = structuredClone(fixture.cases.find((entry) => entry.id === "current-and-applicable").input);
  input.claimUnits[0].defectState = "resolved";
  const result = assessContributionLifecycle(input);
  assert.equal(result.classification, "NEEDS_MAINTAINER_DECISION");
  assert.equal(result.nextAction.id, "request-maintainer-decision");
});

test("invalid schemas fail closed before assessment", () => {
  const base = fixture.cases.find((entry) => entry.id === "current-and-applicable").input;

  const unsupported = structuredClone(base);
  unsupported.callerClassification = "CURRENT_AND_APPLICABLE";
  assert.throws(
    () => assessContributionLifecycle(unsupported),
    (error) => error instanceof ContributionLifecycleError && /unsupported field/i.test(error.message)
  );

  const duplicate = structuredClone(base);
  duplicate.claimUnits.push(structuredClone(duplicate.claimUnits[0]));
  assert.throws(
    () => assessContributionLifecycle(duplicate),
    (error) => error instanceof ContributionLifecycleError && /duplicated/i.test(error.message)
  );

  const emptyEvidence = structuredClone(base);
  emptyEvidence.claimUnits[0].evidence = [];
  assert.throws(
    () => assessContributionLifecycle(emptyEvidence),
    (error) => error instanceof ContributionLifecycleError && /at least one observation-time evidence/i.test(error.message)
  );

  const futureCheck = structuredClone(base);
  futureCheck.currentUpstream.checkedAt = "2026-07-20T00:00:00.000Z";
  assert.throws(
    () => assessContributionLifecycle(futureCheck),
    (error) => error instanceof ContributionLifecycleError && /cannot be later than observedAt/i.test(error.message)
  );
});

test("renderers expose claim decisions, provenance boundary, and non-claims", () => {
  const item = fixture.cases.find((entry) => entry.id === "hermes-two-claim-refactor-salvage");
  const result = assessContributionLifecycle(item.input);
  const markdown = renderContributionLifecycleMarkdown(result);
  const summary = renderContributionLifecycleSummary(result);

  assert.match(markdown, /PARTIALLY_SUPERSEDED/);
  assert.match(markdown, /per-entry-key-env/);
  assert.match(markdown, /Used for classification: no/);
  assert.match(markdown, /does not prove correctness, mergeability/i);
  assert.match(summary, /extract-surviving-claim/);
  assert.match(summary, /Outcome excluded from classification: yes/);
});

test("CLI emits lifecycle JSON and fails closed on invalid evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pcf-lifecycle-"));
  try {
    const validPath = join(directory, "valid.json");
    const invalidPath = join(directory, "invalid.json");
    const input = fixture.cases.find((entry) => entry.id === "hermes-two-claim-refactor-salvage").input;
    await writeFile(validPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
    await writeFile(invalidPath, "{not-json\n", "utf8");

    const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "lifecycle", validPath, "--format", "json"], {
      cwd: new URL("..", import.meta.url)
    });
    const result = JSON.parse(stdout);
    assert.equal(result.classification, "PARTIALLY_SUPERSEDED");
    assert.equal(result.nextAction.id, "extract-surviving-claim");

    await assert.rejects(
      () => execFileAsync(process.execPath, ["src/cli.mjs", "lifecycle", invalidPath], {
        cwd: new URL("..", import.meta.url)
      }),
      (error) => error.code === 1 && /contains invalid JSON/i.test(error.stderr)
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
