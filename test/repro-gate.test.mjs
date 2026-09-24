import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReproGate } from "../src/core/repro-gate.mjs";

const notes = ["", "   ", "Observed behavior", "No error or regression reproduced", "failed mismatch", "not fixed", "passed verified works success ok"];
const artifacts = [
  { path: "before.log", kind: "before-repro" },
  { path: "after.log", kind: "after-validation" }
];
const before = { commands: [{ command: "test-before", exitCode: 1 }] };
const after = { commands: [{ command: "test-after", exitCode: 0 }] };
const decision = (result) => ({ status: result.status, blockers: result.blockers, warnings: result.warnings });

test("repro notes cannot replace before failure evidence even with artifact paths", () => {
  const baseline = evaluateReproGate({ before: {}, after, artifacts });
  assert.equal(baseline.status, "review");
  for (const note of notes) {
    const result = evaluateReproGate({ before: { notes: note }, after, artifacts });
    assert.deepEqual(decision(result), decision(baseline));
    assert.equal(result.evidence.before.notes, note);
  }
});

test("repro notes cannot replace after success evidence even with artifact paths", () => {
  const baseline = evaluateReproGate({ before, after: {}, artifacts });
  assert.equal(baseline.status, "blocked");
  for (const note of notes) {
    const result = evaluateReproGate({ before, after: { notes: note }, artifacts });
    assert.deepEqual(decision(result), decision(baseline));
    assert.equal(result.evidence.after.notes, note);
  }
});

test("narrative wording cannot change explicit command results", () => {
  for (const exitCode of [0, 1, null]) {
    const evidence = { ...after, commands: [{ command: "test-after", exitCode, outputPath: "after.log" }] };
    const baseline = evaluateReproGate({ before, after: evidence, artifacts });
    assert.equal(baseline.status, exitCode === 0 ? "pass" : exitCode === null ? "review" : "blocked");
    for (const note of notes) {
      const result = evaluateReproGate({
        before: { ...before, notes: note },
        after: { ...evidence, notes: note },
        artifacts
      });
      assert.deepEqual(decision(result), decision(baseline));
    }
  }
});

test("structured verdicts with tangible evidence retain their existing meaning", () => {
  const result = evaluateReproGate({
    before: { verdict: "before-fails", notes: "no failure keywords needed" },
    after: { verdict: "passed", notes: "error is still mentioned as context" },
    artifacts
  });
  assert.equal(result.status, "pass");
  assert.equal(evaluateReproGate({
    before: { verdict: "before-fails" }, after: { verdict: "passed" }
  }).status, "blocked");
});

test("narrative aliases cannot supply baseline or validation evidence", () => {
  const generatedAt = "2026-01-01T00:00:00.000Z";
  for (const alias of ["notes", "note", "summary", "output"]) {
    for (const note of notes) {
      for (const phase of ["baseline", "validation"]) {
        const input = { baseline: before, validation: after, artifacts, generatedAt, [phase]: {} };
        const baseline = evaluateReproGate(input);
        const result = evaluateReproGate({ ...input, [phase]: { [alias]: note } });
        assert.deepEqual(decision(result), decision(baseline));
        assert.equal(result.evidence[phase === "baseline" ? "before" : "after"].notes, note);
      }
    }
  }
});

test("notes cannot override contradictory structured after results", () => {
  for (const evidence of [
    { verdict: "failed", commands: [{ command: "test-after", exitCode: 0 }] },
    { verdict: "passed", commands: [{ command: "test-after", exitCode: 1 }] }
  ]) {
    const baseline = evaluateReproGate({ before, after: evidence, artifacts });
    assert.equal(baseline.status, "blocked");
    for (const note of notes) {
      assert.deepEqual(decision(evaluateReproGate({ before, after: { ...evidence, notes: note }, artifacts })), decision(baseline));
    }
  }
});
