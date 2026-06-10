import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = new URL("..", import.meta.url);

test("preflight passes a ready PR payload with exit code 0", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "preflight", "fixtures/pr-ready.json"], { cwd });
  assert.match(stdout, /PCF contributor preflight: READY TO SUBMIT/);
  assert.match(stdout, /Status: ready-for-maintainer/);
  assert.match(stdout, /advisory/);
});

test("preflight fails an unready PR payload with exit code 1 and repair steps", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["src/cli.mjs", "preflight", "fixtures/pr-unready.json"], { cwd }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /PCF contributor preflight: NOT READY YET/);
      assert.match(error.stdout, /Fix before submitting:/);
      assert.match(error.stdout, /Failing checks:/);
      return true;
    }
  );
});

test("preflight --allow-repair lets needs-repair payloads pass", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["src/cli.mjs", "preflight", "fixtures/pr-ready.json", "--allow-repair"],
    { cwd }
  );
  assert.match(stdout, /Gate: ready-for-maintainer or needs-repair passes/);
});

test("preflight emits a machine-readable JSON gate verdict", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["src/cli.mjs", "preflight", "fixtures/pr-ready.json", "--format", "json"],
    { cwd }
  );
  const data = JSON.parse(stdout);
  assert.equal(data.ready, true);
  assert.equal(data.gate, "ready-only");
  assert.equal(data.evaluation.status, "ready-for-maintainer");
});

test("preflight auto-detects plain-text patch input and uses kernel-grade", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["src/cli.mjs", "preflight", "fixtures/patch-kernel-ready.patch", "--format", "json"],
    { cwd }
  );
  const data = JSON.parse(stdout);
  assert.equal(data.ready, true);
  assert.equal(data.evaluation.profile.id, "kernel-grade");
  assert.equal(data.evaluation.patchSeries.patchCount, 1);
});

test("preflight is listed in CLI help with exit-code contract", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.mjs", "--help"], { cwd });
  assert.match(stdout, /preflight <payload\.json\|patch-or-mbox>/);
  assert.match(stdout, /0 = ready to submit, 1 = not ready, 2 = usage error/);
});
