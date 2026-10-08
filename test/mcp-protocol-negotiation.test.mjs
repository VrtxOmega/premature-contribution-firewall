import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleMcpRequest } from "../src/mcp/server.mjs";
import { PCF_MCP_PROTOCOL_VERSION, PCF_MCP_SERVER_NAME } from "../src/mcp/core.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const wireVersion = "2025-06-18";
const client = { capabilities: {}, clientInfo: { name: "protocol-control", version: "1" } };
const cases = [
  ...[wireVersion, "2025-11-25", "2024-11-05", "2099-01-01", "not-a-version", "", " 2025-06-18 "]
    .map((version) => ({ label: `string ${JSON.stringify(version)}`, params: { ...client, protocolVersion: version }, valid: true })),
  ...[null, true, false, 0, 1, {}, [], [wireVersion]]
    .map((version) => ({ label: `non-string ${JSON.stringify(version)}`, params: { ...client, protocolVersion: version }, valid: false })),
  { label: "missing version", params: client, valid: false },
  { label: "missing params", valid: false },
  { label: "null params", params: null, valid: false },
  { label: "array params", params: [], valid: false },
  { label: "string params", params: wireVersion, valid: false }
];

function requestFor(entry, id) {
  return { jsonrpc: "2.0", id, method: "initialize", ...("params" in entry ? { params: entry.params } : {}) };
}

function assertNegotiation(response, entry, id) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, id);
  if (entry.valid) {
    assert.equal(response.error, undefined);
    assert.equal(response.result.protocolVersion, wireVersion);
    assert.deepEqual(response.result.capabilities, { tools: {}, resources: {}, prompts: {} });
    assert.deepEqual(response.result.serverInfo, { name: PCF_MCP_SERVER_NAME, version: PCF_MCP_PROTOCOL_VERSION });
  } else {
    assert.equal(response.result, undefined);
    assert.equal(response.error.code, -32602);
    assert.match(response.error.message, /protocolVersion.*string/);
  }
}

for (const [index, entry] of cases.entries()) {
  test(`MCP initialize negotiation: ${entry.label}`, async () => {
    const id = index % 2 ? "" : 0;
    assertNegotiation(await handleMcpRequest(requestFor(entry, id)), entry, id);
  });
}

function frame(message, mode) {
  const body = JSON.stringify(message);
  return mode === "newline" ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function decode(output, mode) {
  if (mode === "newline") return output.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const messages = [];
  let bytes = Buffer.from(output);
  while (bytes.length) {
    const separator = bytes.indexOf("\r\n\r\n");
    assert.notEqual(separator, -1, "response header must be complete");
    const header = /^Content-Length: (\d+)$/.exec(bytes.subarray(0, separator).toString());
    assert.ok(header, "unexpected response header");
    const start = separator + 4;
    const end = start + Number(header[1]);
    assert.ok(end <= bytes.length, "response body must be complete");
    messages.push(JSON.parse(bytes.subarray(start, end).toString()));
    bytes = bytes.subarray(end);
  }
  return messages;
}

for (const mode of ["newline", "content-length"]) {
  test(`MCP stdio initialize negotiation (${mode})`, async (t) => {
    for (const [index, entry] of cases.entries()) {
      await t.test(entry.label, () => {
        const id = index % 2 ? "" : 0;
        // Each case starts a fresh session. Ping is allowed during initialization
        // and proves that a rejected request does not crash or poison the stream.
        const input = frame(requestFor(entry, id), mode)
          + frame({ jsonrpc: "2.0", id: "ping", method: "ping" }, mode);
        const child = spawnSync(process.execPath, ["src/mcp/server.mjs"], {
          cwd: repoRoot, input, encoding: "utf8", timeout: 10_000, windowsHide: true
        });
        assert.ifError(child.error);
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stderr, "");
        const responses = decode(child.stdout, mode);
        assert.equal(responses.length, 2);
        assertNegotiation(responses[0], entry, id);
        assert.deepEqual(responses[1], { jsonrpc: "2.0", id: "ping", result: {} });
      });
    }
  });
}
