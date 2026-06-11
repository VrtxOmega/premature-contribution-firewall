#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pcf-smoke", version: "1" } }
  },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "pcf://status" } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "pcf_health", arguments: {} } },
  { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "pcf://mcp/server-card" } },
  { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "pcf_submission_readiness", arguments: {} } },
  {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "pcf_repro_gate",
      arguments: {
        before: {
          verdict: "before-fails",
          commands: [{ command: "npm test -- before", exitCode: 1, outputPath: "artifacts/before.txt" }]
        },
        after: {
          verdict: "passed",
          commands: [{ command: "npm test -- after", exitCode: 0, outputPath: "artifacts/after.txt" }]
        }
      }
    }
  }
];

const child = spawn(process.execPath, ["src/mcp/server.mjs"], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "inherit"]
});

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

for (const request of requests) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}
child.stdin.end();

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

assert.equal(exitCode, 0, "pcf-mcp server exited cleanly");

const responses = stdout
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const byId = new Map(responses.map((response) => [response.id, response]));
assert.equal(byId.get(1)?.result?.serverInfo?.name, "premature-contribution-firewall");

const toolNames = byId.get(2).result.tools.map((tool) => tool.name);
assert.ok(toolNames.includes("pcf_health"));
assert.ok(toolNames.includes("pcf_submission_readiness"));
assert.ok(toolNames.includes("pcf_repro_gate"));
assert.ok(toolNames.includes("pcf_lane_resume"));
assert.equal(toolNames.some((name) => /comment|label|merge|push|open_pr/i.test(name)), false);

const statusResource = JSON.parse(byId.get(3).result.contents[0].text);
assert.equal(statusResource.githubWriteToolsExposed, false);
assert.equal(statusResource.shellExecution, "not exposed");
assert.equal(statusResource.arbitraryFileRead, "not exposed");

const health = JSON.parse(byId.get(4).result.content[0].text);
assert.equal(health.githubWrites, "disabled");
assert.equal(health.submissionReadinessTool, "pcf_submission_readiness");
assert.ok(health.tools.includes("pcf_repro_gate"));
assert.ok(health.tools.includes("pcf_lane_resume"));

const serverCard = JSON.parse(byId.get(5).result.contents[0].text);
assert.equal(serverCard.transport.type, "stdio");
assert.equal(serverCard.safety.githubWrites, "disabled");

const readiness = JSON.parse(byId.get(6).result.content[0].text);
assert.equal(readiness.status, "pass");
assert.ok(readiness.checks.some((check) => check.id === "glama-metadata"));

const repro = JSON.parse(byId.get(7).result.content[0].text);
assert.equal(repro.status, "pass");
assert.match(repro.nonClaims.join("\n"), /PCF MCP did not execute/);

console.log("PASS pcf-mcp smoke: health, server card, readiness, repro gate, and no public-write tools verified.");
