import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

test("HTTP profile errors are 400 responses and leave valid evaluation reachable", { timeout: 20000 }, async t => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/pr-ready.json", import.meta.url), "utf8"));
  const patch = await readFile(new URL("../fixtures/patch-kernel-ready.patch", import.meta.url), "utf8");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PCF_HOST: "127.0.0.1", PCF_PORT: String(port), PCF_DRY_RUN: "true", PCF_POST_COMMENTS: "false", PCF_APPLY_LABELS: "false", PCF_FEEDBACK_ENABLED: "false", PCF_QUEUE_HISTORY_ENABLED: "false", PCF_COLLECT_REPOSITORY_CONTEXT: "false", GITHUB_TOKEN: "", GH_TOKEN: "", GITHUB_APP_ID: "", GITHUB_PRIVATE_KEY_PATH: "" },
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
  const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  for (const [path, body] of [
    ["/api/evaluate", { ...fixture, profile: "kernel-grdae" }],
    ["/api/evaluate", { ...fixture, reviewProfile: false }],
    ["/api/evaluate-patch", { text: patch, profile: 0 }],
    ["/api/github/queue", { items: [fixture], profile: "constructor" }]
  ]) {
    const response = await post(path, body);
    assert.equal(response.status, 400, path);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.code, "PCF_INVALID_PROFILE");
    assert.equal(result.evaluation, undefined);
    assert.match(result.error, /profile.*standard.*kernel-grade/i);
  }
  const batchResponse = await post("/api/evaluate-batch", { items: [{ input: fixture }, { input: fixture, profile: false }] });
  assert.equal(batchResponse.status, 400);
  const batch = await batchResponse.json();
  assert.equal(batch.summary.evaluated, 1);
  assert.equal(batch.summary.errors, 1);
  for (const profile of ["standard", "kernel-grade"]) {
    const response = await post("/api/evaluate", { ...fixture, profile });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.evaluation.profile.id, profile);
    assert.equal(result.evaluation.score, profile === "standard" ? 100 : 11);
  }
  const patchResponse = await post("/api/evaluate-patch", { text: patch });
  assert.equal(patchResponse.status, 200);
  assert.equal((await patchResponse.json()).evaluation.profile.id, "kernel-grade");
});
