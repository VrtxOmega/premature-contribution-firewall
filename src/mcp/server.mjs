#!/usr/bin/env node
import {
  PCF_MCP_PROTOCOL_VERSION,
  PCF_MCP_SERVER_NAME,
  callPcfMcpTool,
  getPcfMcpPrompt,
  listPcfMcpPrompts,
  listPcfMcpResources,
  listPcfMcpTools,
  readPcfMcpResource
} from "./core.mjs";

const SERVER_INFO = {
  name: PCF_MCP_SERVER_NAME,
  version: PCF_MCP_PROTOCOL_VERSION
};

export async function handleMcpRequest(message) {
  if (message.method === "initialize") {
    return result(message.id, {
      protocolVersion: message.params?.protocolVersion || "2025-06-18",
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: SERVER_INFO
    });
  }
  if (message.method === "notifications/initialized") return null;
  if (message.method === "ping") return result(message.id, {});
  if (message.method === "tools/list") return result(message.id, { tools: listPcfMcpTools() });
  if (message.method === "tools/call") {
    try {
      const output = await callPcfMcpTool(message.params?.name || "", message.params?.arguments || {});
      return result(message.id, {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
      });
    } catch (error) {
      return result(message.id, {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }, null, 2) }]
      });
    }
  }
  if (message.method === "resources/list") return result(message.id, { resources: listPcfMcpResources() });
  if (message.method === "resources/read") {
    const resource = await readPcfMcpResource(message.params?.uri || "");
    return result(message.id, {
      contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }]
    });
  }
  if (message.method === "prompts/list") return result(message.id, { prompts: listPcfMcpPrompts() });
  if (message.method === "prompts/get") {
    return result(message.id, await getPcfMcpPrompt(message.params?.name || "", message.params?.arguments || {}));
  }
  return errorResult(message.id, -32601, `Method not found: ${message.method}`);
}

export async function runPcfMcpServer({ input = process.stdin, output = process.stdout } = {}) {
  const reader = new JsonRpcStreamReader(input);
  for await (const message of reader.messages()) {
    let response = null;
    try {
      response = await handleMcpRequest(message);
    } catch (error) {
      response = errorResult(message.id, -32603, error.message);
    }
    if (response) writeJsonRpc(output, response, reader.lastMode || "header");
  }
}

class JsonRpcStreamReader {
  constructor(input) {
    this.input = input;
    this.buffer = Buffer.alloc(0);
    this.lastMode = "header";
  }

  async *messages() {
    for await (const chunk of this.input) {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      while (true) {
        const parsed = this.readOne();
        if (!parsed) break;
        this.lastMode = parsed.mode;
        yield parsed.message;
      }
    }
  }

  readOne() {
    if (this.buffer.length === 0) return null;
    const prefix = this.buffer.subarray(0, Math.min(this.buffer.length, 15)).toString("ascii").toLowerCase();
    if (prefix.startsWith("content-length:")) return this.readHeaderFramed();
    return this.readLineDelimited();
  }

  readHeaderFramed() {
    let separator = this.buffer.indexOf("\r\n\r\n");
    let separatorLength = 4;
    if (separator < 0) {
      separator = this.buffer.indexOf("\n\n");
      separatorLength = 2;
    }
    if (separator < 0) return null;
    const header = this.buffer.subarray(0, separator).toString("ascii");
    const match = /^content-length:\s*(\d+)/im.exec(header);
    if (!match) throw new Error("Missing Content-Length header");
    const length = Number(match[1]);
    const bodyStart = separator + separatorLength;
    const bodyEnd = bodyStart + length;
    if (this.buffer.length < bodyEnd) return null;
    const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
    this.buffer = this.buffer.subarray(bodyEnd);
    return { mode: "header", message: JSON.parse(body) };
  }

  readLineDelimited() {
    const newline = this.buffer.indexOf("\n");
    if (newline < 0) return null;
    const line = this.buffer.subarray(0, newline).toString("utf8").trim();
    this.buffer = this.buffer.subarray(newline + 1);
    if (!line) return this.readOne();
    return { mode: "line", message: JSON.parse(line) };
  }
}

function writeJsonRpc(output, payload, mode) {
  const text = JSON.stringify(payload);
  if (mode === "line") {
    output.write(`${text}\n`);
    return;
  }
  output.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function errorResult(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPcfMcpServer().catch((error) => {
    console.error(`[${PCF_MCP_SERVER_NAME}] MCP server failed`, error);
    process.exitCode = 1;
  });
}
