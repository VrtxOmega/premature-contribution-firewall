#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packageName = "premature-contribution-firewall";
const bins = { pcf: "src/cli.mjs", [packageName]: "src/cli.mjs", "pcf-mcp": "src/mcp/server.mjs" };
const newTools = ["pcf_claim_integrity", "pcf_falsification_packet", "pcf_residue_register"];

function run(command, args, options, expectedExit = 0) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000, ...options });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `Process terminated: ${result.signal}`);
  assert.equal(result.status, expectedExit, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

// Install only local artifacts, using an empty consumer directory and cache.
// The callback also lets regression tests remove installed files, without
// changing the checkout or the original tarball.
export async function withInstalledPackage({ tarball = "", sourceRoot = repoRoot } = {}, inspect = verifyInstalledPackage) {
  const npmCli = process.env.npm_execpath || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  assert.ok(existsSync(npmCli), "Run this verifier through npm run package:verify (npm is required).");
  const temporary = await mkdtemp(join(tmpdir(), "pcf package # "));
  try {
    const consumerRoot = join(temporary, "consumer");
    await mkdir(consumerRoot);
    await writeFile(join(consumerRoot, "package.json"), '{"name":"pcf-install-check","private":true}\n');
    const env = { ...process.env, npm_config_cache: join(temporary, "cache"), npm_config_update_notifier: "false" };
    let artifact = tarball ? resolve(tarball) : "";
    if (!artifact) {
      const packed = JSON.parse(run(process.execPath, [npmCli, "pack", "--offline", "--ignore-scripts", "--json", "--pack-destination", temporary], { cwd: sourceRoot, env }));
      assert.equal(packed.length, 1, "Expected exactly one local package tarball");
      artifact = join(temporary, packed[0].filename);
    }
    const integrity = `sha512-${createHash("sha512").update(await readFile(artifact)).digest("base64")}`;
    run(process.execPath, [npmCli, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", artifact], { cwd: consumerRoot, env });
    const result = await inspect(consumerRoot);
    return { ...result, integrity, origin: tarball ? "supplied-tarball" : "local-checkout-pack" };
  } finally {
    // temporary is the directory returned by mkdtemp, never a supplied path.
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyInstalledPackage(consumerRoot, { contract = "current" } = {}) {
  assert.ok(["current", "v0.2.0"].includes(contract), "Contract must be current or v0.2.0");
  const installedRoot = join(consumerRoot, "node_modules", packageName);
  const manifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, packageName);
  for (const [name, target] of Object.entries(bins)) assert.equal(manifest.bin[name], target, `Missing bin: ${name}`);
  if (contract === "v0.2.0") assert.equal(manifest.version, "0.2.0");

  const blocker = join(consumerRoot, "deny-network.mjs");
  await writeFile(blocker, `import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { process.stderr.write("Unexpected network attempt in package smoke test\\n"); process.exit(97); };
globalThis.fetch = deny;
http.get = http.request = https.get = https.request = net.connect = net.createConnection = tls.connect = deny;
syncBuiltinESMExports();
`);
  const env = {
    ...process.env,
    PATH: `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`,
    NODE_OPTIONS: `--import=${pathToFileURL(blocker).href}`,
    PCF_DRY_RUN: "true", PCF_POST_COMMENTS: "false", PCF_APPLY_LABELS: "false"
  };
  const runBin = (name, args, { input, expectedExit = 0 } = {}) => {
    const executable = join("node_modules", ".bin", name);
    // Only fixed bin names, flags and generated basenames enter cmd.exe.
    // The consumer cwd deliberately contains spaces and #; no shell is used
    // on POSIX, and no absolute/user-supplied path enters the Windows command.
    const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : join(consumerRoot, executable);
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", `${executable}.cmd`, ...args] : args;
    return run(command, commandArgs, { cwd: consumerRoot, env, input }, expectedExit);
  };

  for (const alias of ["pcf", packageName]) {
    const help = runBin(alias, ["--help"]);
    assert.match(help, /preflight/);
    assert.match(help, /lifecycle/);
    assert.equal(help.includes("claim-integrity"), contract === "current", `${alias} help does not match the ${contract} feature contract (claim-integrity availability)`);
  }
  for (const [fixture, ready, expectedExit] of [["pr-ready.json", true, 0], ["pr-unready.json", false, 1]]) {
    await copyFile(join(installedRoot, "fixtures", fixture), join(consumerRoot, fixture));
    const preflight = JSON.parse(runBin("pcf", ["preflight", fixture, "--format", "json"], { expectedExit }));
    assert.equal(preflight.ready, ready, `Preflight ${fixture}`);
  }
  runBin("pcf", ["not-a-command"], { expectedExit: 2 });

  const lifecycleCase = JSON.parse(await readFile(join(installedRoot, "fixtures", "contribution-lifecycle-cases.json"), "utf8")).cases[0];
  await writeFile(join(consumerRoot, "lifecycle.json"), JSON.stringify(lifecycleCase.input));
  const lifecycle = JSON.parse(runBin("pcf", ["lifecycle", "lifecycle.json", "--format", "json"]));
  assert.equal(lifecycle.classification, lifecycleCase.expected.classification);
  assert.match(lifecycle.assessmentSha256, /^[a-f0-9]{64}$/);
  assert.equal(lifecycle.nextAction.publicWriteAuthorized, false);

  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pcf-package-check", version: "1" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "pcf_health", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "pcf_submission_readiness", arguments: {} } },
    { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "pcf://mcp/server-card" } }
  ];
  const messages = runBin("pcf-mcp", [], { input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n" })
    .trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(messages.length, requests.length, "MCP must respond to every request");
  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const request of requests) {
    const response = byId.get(request.id);
    assert.ok(response?.result && !response.error && !response.result.isError, `MCP request ${request.id} failed`);
  }
  assert.equal(byId.get(1).result.serverInfo.name, packageName);
  const toolNames = byId.get(2).result.tools.map((tool) => tool.name);
  for (const name of newTools) assert.equal(toolNames.includes(name), contract === "current", `${contract}: ${name}`);
  assert.equal(toolNames.some((name) => /comment|label|merge|push|open_pr/i.test(name)), false);
  const health = JSON.parse(byId.get(3).result.content[0].text);
  assert.equal(health.githubWrites, "disabled");
  const readiness = JSON.parse(byId.get(4).result.content[0].text);
  assert.equal(readiness.status, "pass", `Installed MCP readiness: ${JSON.stringify(readiness.checks)}`);
  const serverCard = JSON.parse(byId.get(5).result.contents[0].text);
  assert.equal(serverCard.packageName, manifest.name);
  assert.equal(serverCard.version, manifest.version);
  assert.equal(serverCard.safety.githubWrites, "disabled");

  return { ok: true, contract, package: `${manifest.name}@${manifest.version}`, node: process.version, platform: process.platform, bins: Object.keys(bins), preflightExitCodes: [0, 1, 2], lifecycle: lifecycle.classification, mcpTools: toolNames.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      assert.ok(["--tarball", "--contract"].includes(args[i]) && args[i + 1], "Usage: npm run package:verify -- [--tarball local.tgz] [--contract current|v0.2.0]");
      options[args[i].slice(2)] = args[i + 1];
    }
    assert.ok([undefined, "current", "v0.2.0"].includes(options.contract), "Contract must be current or v0.2.0");
    const result = await withInstalledPackage(options, (root) => verifyInstalledPackage(root, options));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Package install verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
