import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleMcpRequest } from "../src/mcp/server.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const notifications = [
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 0, reason: "Already completed" } },
  { jsonrpc: "2.0", method: "notifications/roots/list_changed" },
  { jsonrpc: "2.0", method: "notifications/unknown" },
  { jsonrpc: "2.0", method: "ping" },
  { jsonrpc: "2.0", method: "tools/call", params: { name: "unknown-tool" } },
  { jsonrpc: "2.0", method: "resources/read", params: { uri: "pcf://unknown-resource" } }
];

test("MCP handler ignores notifications before dispatching request handlers", async () => {
  for (const notification of notifications) {
    assert.equal(await handleMcpRequest(notification), null, notification.method);
  }
});

test("MCP handler preserves falsey request IDs and correlates unknown-method errors", async () => {
  for (const id of [0, ""]) {
    assert.deepEqual(await handleMcpRequest({ jsonrpc: "2.0", id, method: "ping" }), {
      jsonrpc: "2.0", id, result: {}
    });
  }
  for (const method of ["unknown-method", "notifications/initialized"]) {
    const response = await handleMcpRequest({ jsonrpc: "2.0", id: 7, method });
    assert.equal(response?.id, 7);
    assert.equal(response.error.code, -32601);
  }
});

for (const mode of ["line", "header"]) {
  test(`MCP ${mode} stdio emits no frames for notifications`, () => {
    assert.deepEqual(runStdio(notifications, mode), []);
  });

  test(`MCP ${mode} stdio remains usable after notifications and correlates only requests`, () => {
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      notifications[0],
      { jsonrpc: "2.0", id: 0, method: "ping" },
      ...notifications.slice(1),
      { jsonrpc: "2.0", id: "", method: "ping" },
      { jsonrpc: "2.0", id: 7, method: "unknown-method" },
      { jsonrpc: "2.0", id: 8, method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 9, method: "tools/list" }
    ];
    const responses = runStdio(messages, mode);
    assert.deepEqual(responses.map((response) => response.id), [1, 0, "", 7, 8, 9]);
    assert.equal(responses[0].result.protocolVersion, "2025-06-18");
    assert.deepEqual(responses[1].result, {});
    assert.deepEqual(responses[2].result, {});
    assert.equal(responses[3].error.code, -32601);
    assert.equal(responses[4].error.code, -32601);
    assert.ok(responses[5].result.tools.some((tool) => tool.name === "pcf_health"));
  });
}

function runStdio(messages, mode) {
  const input = messages.map((message) => {
    const body = JSON.stringify(message);
    return mode === "line" ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  }).join("");
  const child = spawnSync(process.execPath, ["src/mcp/server.mjs"], {
    cwd: repoRoot, input, encoding: "utf8", timeout: 10_000
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  if (mode === "line") return child.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));

  const responses = [];
  let remaining = Buffer.from(child.stdout);
  while (remaining.length) {
    const separator = remaining.indexOf("\r\n\r\n");
    assert.notEqual(separator, -1, "Response header must be complete");
    const header = remaining.subarray(0, separator).toString("ascii");
    const match = /^Content-Length: (\d+)$/.exec(header);
    assert.ok(match, `Unexpected response header: ${header}`);
    const end = separator + 4 + Number(match[1]);
    assert.ok(end <= remaining.length, "Response body must be complete");
    responses.push(JSON.parse(remaining.subarray(separator + 4, end).toString("utf8")));
    remaining = remaining.subarray(end);
  }
  return responses;
}
