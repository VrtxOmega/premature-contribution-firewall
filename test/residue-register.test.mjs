import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { evaluateResidueRegister } from "../src/core/residue-register.mjs";
import { evaluateResidueRegisterSubmission } from "../src/core/api.mjs";

const execFileAsync = promisify(execFile);
const cwd = new URL("..", import.meta.url);

test("shrink-only register passes only when declared and observed residue match", () => {
  const result = evaluateResidueRegister({
    name: "known-false-ready",
    declared: [
      { id: "A", reason: "known" },
      { id: "B", reason: "known" }
    ],
    observed: ["B", "A"]
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.counts, {
    declared: 2,
    observed: 2,
    matched: 2,
    new: 0,
    stale: 0,
    duplicates: 0
  });
});

test("new undeclared residue fails immediately", () => {
  const result = evaluateResidueRegister({
    declared: ["A"],
    observed: ["A", "B"]
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.newResidue.map((entry) => entry.id), ["B"]);
  assert.ok(result.blockers.some((entry) => entry.id === "new-undeclared-residue"));
});

test("fixed residue also fails until the stale register declaration is removed", () => {
  const result = evaluateResidueRegister({
    declared: ["A", "B"],
    observed: ["A"]
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.staleResidue.map((entry) => entry.id), ["B"]);
  assert.ok(result.blockers.some((entry) => entry.id === "stale-register-entry"));
  assert.match(result.nextActions.join("\n"), /Remove 'B'/);
});

test("duplicate register ids fail closed instead of silently deduplicating authority", () => {
  const result = evaluateResidueRegister({
    declared: ["A", "A"],
    observed: ["A"]
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.counts.duplicates, 1);
  assert.ok(result.blockers.some((entry) => entry.id === "duplicate-register-entry"));
});

test("empty register is a zero-residue guard and new residue breaks it", () => {
  assert.equal(evaluateResidueRegister({ declared: [], observed: [] }).status, "pass");
  const result = evaluateResidueRegister({ declared: [], observed: ["first-regression"] });
  assert.equal(result.status, "blocked");
  assert.equal(result.counts.new, 1);
});

test("API helper preserves shrink-only semantics", () => {
  const pass = evaluateResidueRegisterSubmission({ input: { declared: ["A"], observed: ["A"] } });
  const blocked = evaluateResidueRegisterSubmission({ input: { declared: ["A"], observed: ["A", "B"] } });
  assert.equal(pass.status, "pass");
  assert.equal(blocked.status, "blocked");
});

test("CLI uses pass/fail exit codes for exact register reconciliation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-residue-register-"));
  try {
    const good = join(dir, "good.json");
    const bad = join(dir, "bad.json");
    await writeFile(good, JSON.stringify({ name: "x", declared: ["A"], observed: ["A"] }), "utf8");
    await writeFile(bad, JSON.stringify({ name: "x", declared: ["A"], observed: ["A", "B"] }), "utf8");

    const pass = await execFileAsync(process.execPath, ["src/cli.mjs", "residue-register", good, "--format", "json"], { cwd });
    assert.equal(JSON.parse(pass.stdout).status, "pass");

    await assert.rejects(
      execFileAsync(process.execPath, ["src/cli.mjs", "residue-register", bad, "--format", "json"], { cwd }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /"status"\s*:\s*"blocked"/);
        return true;
      }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
