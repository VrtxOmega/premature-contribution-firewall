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

test("preflight cannot call an otherwise-ready contribution ready when claim integrity is blocked", async () => {
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "pcf-preflight-claim-"));
  try {
    const payload = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
    payload.claimIntegrity = {
      generatedAt: "2026-09-26T17:00:00Z",
      claim: {
        statement: "Ready PR proof establishes the change.",
        assertedVerdict: "pass",
        risk: "normal",
        twoSided: true
      },
      surface: {
        observable: "No target surface was actually exercised.",
        state: "none"
      },
      controls: {
        positive: {
          description: "claimed positive",
          expectedVerdict: "pass",
          observedVerdict: "pass",
          executed: true,
          evidence: [{ path: "after.json", kind: "execution", source: "observed" }]
        },
        negative: {
          description: "claimed negative",
          expectedVerdict: "fail",
          observedVerdict: "fail",
          executed: true,
          evidence: [{ path: "before.json", kind: "execution", source: "observed" }]
        }
      },
      evidence: [],
      rootCause: {},
      routing: {},
      freshness: {}
    };
    const file = join(dir, "payload.json");
    await writeFile(file, JSON.stringify(payload), "utf8");

    await assert.rejects(
      execFileAsync(process.execPath, ["src/cli.mjs", "preflight", file, "--format", "json"], { cwd }),
      (error) => {
        assert.equal(error.code, 1);
        const data = JSON.parse(error.stdout);
        assert.equal(data.evaluation.status, "ready-for-maintainer");
        assert.equal(data.claimIntegrity.status, "blocked");
        assert.equal(data.ready, false);
        return true;
      }
    );

    await assert.rejects(
      execFileAsync(process.execPath, ["src/cli.mjs", "preflight", file, "--format", "markdown"], { cwd }),
      (error) => error.code === 1 && /PCF Claim Integrity/.test(error.stdout) && /verdict-without-surface/.test(error.stdout)
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
