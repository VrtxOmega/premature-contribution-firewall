import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
const patch = await readFile(new URL("../fixtures/patch-kernel-ready.patch", import.meta.url), "utf8");
const dcoFile = { path: "CONTRIBUTING.md", content: "Contributions must include a DCO sign-off." };
const signedFixture = { ...fixture, body: `${fixture.body}\n\nSigned-off-by: Example Contributor <contributor@example.com>` };
const errorCode = "PCF_INVALID_POLICY_FILES";

function assertPolicyError(output, expectCode = true) {
  assert.equal(output.ok, false);
  if (expectCode) assert.equal(output.code, errorCode);
  assert.match(output.error, /(?:repositoryFiles|policyFiles|policy.files).*array/i);
  assert.equal(output.evaluation, undefined);
  assert.equal(output.ready, undefined);
  assert.equal(output.score, undefined);
}

function assertEvaluation(output, score) {
  assert.equal(output.score, score);
  assert.equal(output.status, score === 100 ? "ready-for-maintainer" : "needs-repair");
}

function runCli(command, input, extraArgs = []) {
  return spawnSync(process.execPath, ["src/cli.mjs", command, "-", "--format", "json", ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    input: typeof input === "string" ? input : JSON.stringify(input),
    timeout: 10000
  });
}

function assertCliError(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /(?:repositoryFiles|policyFiles|--policy).*array/i);
}

test("CLI rejects malformed policy containers before returning readiness", { timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-policy-container-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const validPolicyPath = join(dir, "valid-policy.json");
  await writeFile(validPolicyPath, JSON.stringify([dcoFile]));

  for (const command of ["evaluate", "preflight"]) {
    await t.test(`${command}: malformed JSON payload containers`, () => {
      for (const fields of [
        { repositoryFiles: dcoFile },
        { policyFiles: false },
        { repositoryFiles: [], policyFiles: { "CONTRIBUTING.md": dcoFile.content } }
      ]) assertCliError(runCli(command, { ...fixture, ...fields }));
    });
    await t.test(`${command}: explicit valid policy cannot hide a malformed payload`, () => {
      assertCliError(runCli(command, { ...fixture, repositoryFiles: dcoFile }, ["--policy", validPolicyPath]));
    });
  }

  for (const [name, value] of [
    ["bare record", dcoFile],
    ["empty wrapper", {}],
    ["null document", null],
    ["false document", false],
    ["null-only wrapper", { repositoryFiles: null }],
    ["invalid lower-priority alias", { repositoryFiles: [dcoFile], policyFiles: "not an array" }]
  ]) {
    await t.test(`--policy rejects ${name}`, async () => {
      const policyPath = join(dir, "invalid-policy.json");
      await writeFile(policyPath, JSON.stringify(value));
      for (const command of ["evaluate", "preflight"]) {
        assertCliError(runCli(command, { ...fixture, repositoryFiles: [dcoFile] }, ["--policy", policyPath]));
      }
    });
  }

  await t.test("patch CLI commands reject malformed --policy containers", async () => {
    const policyPath = join(dir, "invalid-patch-policy.json");
    await writeFile(policyPath, JSON.stringify({ policyFiles: dcoFile }));
    for (const command of ["evaluate-patch", "preflight"]) {
      assertCliError(runCli(command, patch, ["--policy", policyPath]));
    }
  });

  await t.test("valid --policy array and wrapper forms preserve DCO discrimination", async () => {
    const policyPath = join(dir, "policy.json");
    for (const value of [
      [dcoFile],
      { repositoryFiles: [dcoFile] },
      { policyFiles: [dcoFile] },
      { repositoryFiles: null, policyFiles: [dcoFile] },
      { repositoryFiles: [{ filename: dcoFile.path, text: dcoFile.content }] }
    ]) {
      await writeFile(policyPath, JSON.stringify(value));
      const unsigned = runCli("preflight", fixture, ["--policy", policyPath]);
      assert.equal(unsigned.status, 1, unsigned.stderr);
      const unsignedOutput = JSON.parse(unsigned.stdout);
      assert.equal(unsignedOutput.ready, false);
      assertEvaluation(unsignedOutput.evaluation, 86);
      assert.equal(unsignedOutput.evaluation.policyProfile.requires.dco, true);
      const signed = runCli("preflight", signedFixture, ["--policy", policyPath]);
      assert.equal(signed.status, 0, signed.stderr);
      const signedOutput = JSON.parse(signed.stdout);
      assert.equal(signedOutput.ready, true);
      assertEvaluation(signedOutput.evaluation, 100);
    }
  });

  await t.test("valid payload aliases, optional nulls and empty-array precedence remain supported", async () => {
    for (const [fields, score] of [
      [{}, 100],
      [{ repositoryFiles: null, policyFiles: null }, 100],
      [{ policyFiles: [dcoFile] }, 86],
      [{ repositoryFiles: [], policyFiles: [dcoFile] }, 100],
      [{ repositoryFiles: null, policyFiles: [dcoFile] }, 86]
    ]) {
      const result = runCli("evaluate", { ...fixture, ...fields });
      assert.equal(result.status, 0, result.stderr);
      assertEvaluation(JSON.parse(result.stdout), score);
    }
    const policyPath = join(dir, "empty-policy.json");
    await writeFile(policyPath, JSON.stringify({ repositoryFiles: [], policyFiles: [dcoFile] }));
    const result = runCli("preflight", fixture, ["--policy", policyPath]);
    assert.equal(result.status, 0, result.stderr);
    assertEvaluation(JSON.parse(result.stdout).evaluation, 100);
  });
});

test("HTTP rejects malformed supplied policy containers and isolates batch failures", { timeout: 20000 }, async t => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PCF_HOST: "127.0.0.1", PCF_PORT: String(port), PCF_DRY_RUN: "true",
      PCF_POST_COMMENTS: "false", PCF_APPLY_LABELS: "false", PCF_FEEDBACK_ENABLED: "false",
      PCF_QUEUE_HISTORY_ENABLED: "false", PCF_COLLECT_REPOSITORY_CONTEXT: "false",
      GITHUB_TOKEN: "", GH_TOKEN: "", GITHUB_APP_ID: "", GITHUB_PRIVATE_KEY_PATH: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "", stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill();
      await closed;
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${stderr}`)), 10000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`Server exited: ${stderr}`)); });
    child.stdout.on("data", chunk => {
      stdout += chunk;
      if (stdout.includes("listening on")) { clearTimeout(timer); resolve(); }
    });
  });
  const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
  });

  for (const [name, path, body] of [
    ["single record", "/api/evaluate", { ...fixture, repositoryFiles: dcoFile }],
    ["falsy alias", "/api/evaluate", { ...fixture, policyFiles: false }],
    ["hidden alias", "/api/evaluate", { ...fixture, repositoryFiles: [], policyFiles: "invalid" }],
    ["nested input", "/api/evaluate", { input: { ...fixture, repositoryFiles: dcoFile } }],
    ["mixed single input", "/api/evaluate", { ...fixture, repositoryFiles: [], input: { policyFiles: 0 } }],
    ["patch record", "/api/evaluate-patch", { text: patch, repositoryFiles: dcoFile }],
    ["patch hidden alias", "/api/evaluate-patch", { text: patch, repositoryFiles: [], policyFiles: false }],
    ["mixed patch input", "/api/evaluate-patch", { text: patch, repositoryFiles: [], input: { repositoryFiles: dcoFile } }],
    ["supplied queue item", "/api/github/queue", { items: [{ ...fixture, repositoryFiles: dcoFile }] }],
    ["supplied nested queue item", "/api/github/queue", { items: [{ input: { ...fixture, policyFiles: false } }] }]
  ]) {
    await t.test(name, async () => {
      const response = await post(path, body);
      assert.equal(response.status, 400, path);
      assertPolicyError(await response.json());
    });
  }

  await t.test("batch retains valid result while rejecting malformed nested and envelope inputs", async () => {
    const response = await post("/api/evaluate-batch", { items: [
      { id: "valid", input: fixture },
      { id: "nested", input: { ...fixture, repositoryFiles: dcoFile } },
      { id: "envelope", input: fixture, policyFiles: false },
      { id: "mixed-patch", text: patch, input: { ...fixture, policyFiles: 0 } }
    ] });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.summary.evaluated, 1);
    assert.equal(result.summary.errors, 3);
    assertEvaluation(result.results[0].evaluation, 100);
    for (const row of result.results.slice(1)) assertPolicyError(row, false);
  });

  await t.test("valid requests remain reachable and preserve policy requirements", async () => {
    for (const [fields, score] of [
      [{ repositoryFiles: null, policyFiles: null }, 100],
      [{ repositoryFiles: [dcoFile] }, 86],
      [{ repositoryFiles: null, policyFiles: [dcoFile] }, 86],
      [{ repositoryFiles: [], policyFiles: [dcoFile] }, 100]
    ]) {
      const response = await post("/api/evaluate", { ...fixture, ...fields });
      assert.equal(response.status, 200);
      assertEvaluation((await response.json()).evaluation, score);
    }
    const signed = await post("/api/evaluate", { ...signedFixture, repositoryFiles: [dcoFile] });
    assert.equal(signed.status, 200);
    assertEvaluation((await signed.json()).evaluation, 100);
    const validPatch = await post("/api/evaluate-patch", { text: patch, repositoryFiles: [] });
    assert.equal(validPatch.status, 200);
    assertEvaluation((await validPatch.json()).evaluation, 100);
  });
});

test("MCP stdio reports policy tool errors and serves later valid calls", { timeout: 15000 }, async t => {
  const cases = [
    ["evaluate input", "pcf_evaluate", { input: { ...fixture, repositoryFiles: dcoFile } }],
    ["evaluate envelope", "pcf_evaluate", { input: fixture, policyFiles: false }],
    ["preflight input", "pcf_preflight", { input: { ...fixture, policyFiles: "invalid" } }],
    ["preflight patch", "pcf_preflight", { patchText: patch, repositoryFiles: 0 }],
    ["patch hidden alias", "pcf_preflight", { patchText: patch, repositoryFiles: [], policyFiles: dcoFile }],
    ["mixed patch input", "pcf_preflight", { patchText: patch, repositoryFiles: [], input: { repositoryFiles: dcoFile } }],
    ["policy profile", "pcf_policy_profile", { repositoryFiles: dcoFile }],
    ["policy profile hidden alias", "pcf_policy_profile", { repositoryFiles: [], policyFiles: false }]
  ];
  const validCases = [
    ["pcf_preflight", { input: { ...fixture, repositoryFiles: [dcoFile] } }],
    ["pcf_preflight", { input: { ...signedFixture, repositoryFiles: [dcoFile] } }],
    ["pcf_evaluate", { input: { ...fixture, repositoryFiles: null, policyFiles: null } }],
    ["pcf_preflight", { patchText: patch, repositoryFiles: [] }],
    ["pcf_policy_profile", { repositoryFiles: [{ name: dcoFile.path, body: dcoFile.content }] }]
  ];
  const calls = [...cases.map(([, name, args]) => [name, args]), ...validCases];
  const requests = calls.map(([name, args], index) => ({
    jsonrpc: "2.0", id: index + 1, method: "tools/call", params: { name, arguments: args }
  }));
  const child = spawnSync(process.execPath, ["src/mcp/server.mjs"], {
    cwd: repoRoot, encoding: "utf8", timeout: 10000, maxBuffer: 2_000_000,
    input: requests.map(request => JSON.stringify(request)).join("\n") + "\n"
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  const replies = child.stdout.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(replies.length, requests.length);
  for (const [index, [label]] of cases.entries()) {
    await t.test(label, () => {
      assert.equal(replies[index].id, index + 1);
      assert.equal(replies[index].result.isError, true);
      assertPolicyError(JSON.parse(replies[index].result.content[0].text), false);
    });
  }
  await t.test("valid later calls preserve unsigned, signed and patch decisions", () => {
    const valid = replies.slice(cases.length).map((reply, index) => {
      assert.equal(reply.id, cases.length + index + 1);
      assert.notEqual(reply.result.isError, true);
      return JSON.parse(reply.result.content[0].text);
    });
    assert.equal(valid[0].ready, false);
    assertEvaluation(valid[0].evaluation, 86);
    assert.equal(valid[1].ready, true);
    assertEvaluation(valid[1].evaluation, 100);
    assertEvaluation(valid[2], 100);
    assert.equal(valid[3].ready, true);
    assertEvaluation(valid[3].evaluation, 100);
    assert.equal(valid[4].requires.dco, true);
  });
});
