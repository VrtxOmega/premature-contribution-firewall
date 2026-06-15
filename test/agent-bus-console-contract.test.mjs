import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = join(
  root,
  "packages/pcf-mcp-buildout/contracts/agent_bus_console_ui.yaml"
);

test("agent bus console UI contract scaffold exists with required sections", async () => {
  const text = await readFile(contractPath, "utf8");
  assert.match(text, /^schema_version:\s*"1"/m);
  assert.match(text, /^contract:\s*agent_bus_console_ui/m);
  assert.match(text, /views:/);
  assert.match(text, /api_routes:/);
  assert.match(text, /backlog:/);
  assert.match(text, /mission_bar:/);
  assert.match(text, /evidence_artifact_panel:/);
  assert.match(text, /combine_frontend/);
  assert.match(text, /pcf_bridge/);
  assert.match(text, /sse_send_ui/);
  assert.match(text, /systemd_unit/);
});