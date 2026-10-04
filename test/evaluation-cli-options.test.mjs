import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const cwd = new URL("..", import.meta.url);
const fixture = "fixtures/pr-ready.json";
async function usage(args, pattern) {
  await assert.rejects(execFileAsync(process.execPath, ["src/cli.mjs", ...args], { cwd }), error => {
    assert.equal(error.code, 2);
    assert.equal(error.stdout, "");
    assert.match(error.stderr, pattern);
    assert.doesNotMatch(error.stderr, /\n\s+at |ENOENT/);
    return true;
  });
}

for (const command of ["preflight", "evaluate", "evaluate-patch"]) {
  test(`${command} requires the input before options`, async () => {
    for (const option of ["--profile", "--profile=kernel-grade", "--format=json", "--policy=missing.json"]) {
      await usage([command, option], /Missing input file/);
    }
    await usage([command], /Missing input file/);
  });
  test(`${command} rejects an unknown profile before reading a file`, async () => {
    await usage([command, "missing-input.json", "--profile", "kernel-grdae", "--format", "json"], /profile.*kernel-grdae.*standard.*kernel-grade/);
  });
  test(`${command} rejects an unknown output format`, async () => {
    await usage([command, fixture, "--format", "jsno"], /format.*jsno.*pretty.*json.*markdown/);
  });
}

for (const [args, pattern] of [
  [["--profile"], /profile.*requires a value/],
  [["--profile", "--format", "json"], /profile.*requires a value/],
  [["--profile="], /profile.*requires a value/],
  [["--profile", " "], /profile.*requires a value/],
  [["--format"], /format.*requires a value/],
  [["--policy"], /policy.*requires a value/],
  [["--policy", "--profile", "kernel-grade"], /policy.*requires a value/],
  [["--proflie", "kernel-grade"], /Unknown option.*proflie/],
  [["--profile=kernel-grdae"], /profile.*kernel-grdae/],
  [["--format=jsno"], /format.*jsno/],
  [["--profile", "standard", "--profile", "kernel-grade"], /Duplicate option.*profile/],
  [["--format=json", "--format", "pretty"], /Duplicate option.*format/],
  [["--allow-repair=false"], /allow-repair.*does not accept a value/],
  [["--allow-repair", "false"], /Unexpected argument.*false/],
  [["--allow-repair", "--allow-repair"], /Duplicate option.*allow-repair/],
  [["second-input.json"], /Unexpected argument.*second-input/]
]) {
  test(`preflight rejects malformed option tokens: ${args.join(" ")}`, async () => {
    await usage(["preflight", fixture, ...args], pattern);
  });
}

test("evaluation does not accept preflight-only allow-repair", async () => {
  await usage(["evaluate", fixture, "--allow-repair"], /Unknown option.*allow-repair/);
});

test("profile selection keeps both valid preflight outcomes reachable", async () => {
  const ready = await execFileAsync(process.execPath, ["src/cli.mjs", "preflight", fixture, "--profile=standard", "--format=json"], { cwd });
  assert.equal(JSON.parse(ready.stdout).ready, true);
  await assert.rejects(execFileAsync(process.execPath, ["src/cli.mjs", "preflight", fixture, "--profile=kernel-grade", "--format=json"], { cwd }), error => {
    assert.equal(error.code, 1);
    const output = JSON.parse(error.stdout);
    assert.equal(output.ready, false);
    assert.equal(output.evaluation.profile.id, "kernel-grade");
    assert.ok(output.evaluation.labels.includes("needs-dco-signoff"));
    return true;
  });
});

test("valid patch options retain kernel defaults and markdown rendering", async () => {
  const output = await execFileAsync(process.execPath, ["src/cli.mjs", "preflight", "fixtures/patch-kernel-ready.patch", "--format=markdown"], { cwd });
  assert.match(output.stdout, /ready-for-maintainer/);
  assert.match(output.stdout, /Kernel-Grade/);
});

test("split and equals policy options load a path containing spaces and #", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pcf-policy # "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = join(directory, "required signoff.json");
  await writeFile(policy, JSON.stringify([{ path: "CONTRIBUTING.md", content: "DCO sign-off is required." }]), "utf8");
  for (const options of [["--policy", policy], [`--policy=${policy}`]]) {
    await assert.rejects(execFileAsync(process.execPath, ["src/cli.mjs", "preflight", fixture, ...options, "--profile", " standard ", "--format= json "], { cwd }), error => {
      assert.equal(error.code, 1);
      const output = JSON.parse(error.stdout);
      assert.equal(output.ready, false);
      assert.equal(output.evaluation.profile.id, "standard");
      assert.ok(output.evaluation.labels.includes("policy-failed"));
      const check = output.evaluation.checks.find(check => check.id === "policy");
      assert.equal(check.status, "fail");
      assert.match(check.reason, /DCO sign-off/);
      return true;
    });
  }
});

test("allow-repair is an intentional switch, not a false-valued softening of the gate", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pcf-options "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
  input.checks = [];
  const file = join(directory, "needs repair.json");
  await writeFile(file, JSON.stringify(input), "utf8");
  await assert.rejects(execFileAsync(process.execPath, ["src/cli.mjs", "preflight", file, "--format", "json"], { cwd }), error => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stdout).evaluation.score, 93);
    assert.equal(JSON.parse(error.stdout).ready, false);
    return true;
  });
  const allowed = await execFileAsync(process.execPath, ["src/cli.mjs", "preflight", file, "--allow-repair", "--format", "json"], { cwd });
  assert.equal(JSON.parse(allowed.stdout).ready, true);
  assert.equal(JSON.parse(allowed.stdout).evaluation.score, 93);
  await usage(["preflight", file, "--allow-repair", "false", "--format", "json"], /Unexpected argument.*false/);
});

test("invalid options fail before waiting on stdin", async () => {
  const child = spawn(process.execPath, ["src/cli.mjs", "preflight", "-", "--profile", "kernel-grdae"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 3000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    assert.equal(code, 2, "must exit with usage error while stdin is still open");
    assert.equal(stdout, "");
    assert.match(stderr, /kernel-grdae/);
  } finally {
    clearTimeout(timer);
    child.stdin.destroy();
    if (child.exitCode === null) child.kill();
  }
});
