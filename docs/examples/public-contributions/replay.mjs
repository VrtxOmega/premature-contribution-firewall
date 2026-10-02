// Offline replay of fixed public inputs through the actual PCF CLI.
// No GitHub requests, contribution writes, or execution of submitted code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--cli"), "Usage: node docs/examples/public-contributions/replay.mjs [--cli path/to/src/cli.mjs]");
const cli = args.length ? resolve(args[1]) : resolve(root, "src/cli.mjs");
const packageRoot = resolve(dirname(cli), "..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
assert.equal(manifest.name, "premature-contribution-firewall");
assert.ok(!existsSync(resolve(here, ".env")), "Run with no .env in the example directory.");
const sha256 = (bytes) => createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PCF_|GITHUB_|GH_|NODE_OPTIONS$)/i.test(key)));
Object.assign(env, { PCF_DRY_RUN: "true", PCF_POST_COMMENTS: "false", PCF_APPLY_LABELS: "false" });
const cases = [
  { id: "tokio-without-context", input: "8376-input.json", kind: "public-current-self-evaluation", command: "preflight" },
  { id: "tokio-with-selected-context", input: "8376-context-input.json", kind: "public-current-self-evaluation", command: "preflight" },
  { id: "rask-closed-unmerged", input: "469-input.json", kind: "public-retrospective-self-evaluation", command: "preflight" },
  { id: "karakeep-merged", input: "2864-input.json", kind: "public-retrospective-self-evaluation", command: "preflight" },
  { id: "tokio-lifecycle-unknowns", input: "8376-lifecycle-input.json", kind: "analyst-coded-public-evidence", command: "lifecycle" },
  { id: "synthetic-ready", input: "../../../fixtures/pr-ready.json", kind: "existing-synthetic-control", command: "preflight" },
  { id: "synthetic-unready", input: "../../../fixtures/pr-unready.json", kind: "existing-synthetic-control", command: "preflight" }
];
const results = cases.map(({ id, input, kind, command }) => {
  const path = resolve(here, input);
  const flags = [command, path, "--format", "json"];
  const run = spawnSync(process.execPath, [cli, ...flags], { cwd: here, env, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
  assert.ifError(run.error);
  assert.equal(run.signal, null, `${id}: terminated`);
  assert.ok([0, 1].includes(run.status), `${id}: CLI execution failed (${run.status}): ${run.stderr}`);
  if (command === "lifecycle" && run.status === 1 && !run.stdout.trim() && /^PCF contribution lifecycle failed: Lifecycle input version must be '[\d.]+'.\r?\n$/.test(run.stderr)) {
    return { id, kind, command: `pcf ${command} ${input} --format json`, inputSha256: sha256(readFileSync(path)), exitCode: run.status, error: run.stderr.trim(), classification: null };
  }
  assert.equal(run.stderr, "", `${id}: unexpected stderr`);
  const output = JSON.parse(run.stdout);
  const e = output.evaluation;
  return {
    id, kind, command: `pcf ${command} ${input} --format json`,
    inputSha256: sha256(readFileSync(path)), exitCode: run.status,
    ...(e ? {
      ready: output.ready, gate: output.gate, status: e.status, score: e.score,
      labels: e.labels, repairSteps: e.repairSteps,
      checks: e.checks.map(({ id, status, reason }) => ({ id, status, reason })),
      contextStatus: e.repositoryContext.status,
      concurrentPullRequests: e.repositoryContext.concurrentPullRequests.map(({ number, url, title }) => ({ number, url, title }))
    } : {
      classification: output.classification, nextAction: output.nextAction,
      boundaries: output.boundaries, nonClaims: output.nonClaims
    })
  };
});
// Controls validate the replay's execution contract, not accuracy on public cases.
const ready = results.find(r => r.id === "synthetic-ready");
const unready = results.find(r => r.id === "synthetic-unready");
assert.equal(ready.exitCode, 0);
assert.equal(ready.ready, true);
assert.equal(unready.exitCode, 1);
assert.equal(unready.ready, false);
console.log(JSON.stringify({
  artifact: "pcf-public-contribution-replay", schemaVersion: 1,
  hashEncoding: "SHA-256 of UTF-8 text with CRLF normalized to LF",
  packageVersion: manifest.version, nodeVersion: process.version,
  cliSha256: sha256(readFileSync(cli)), sourcesSha256: sha256(readFileSync(resolve(here, "sources.json"))),
  outputProjection: "Decision, checks, repairs, context matches and lifecycle boundaries; verbose generated comment omitted. Re-run individual commands for full output.",
  results
}, null, 2));
