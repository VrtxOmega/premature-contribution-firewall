import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  callPcfMcpTool,
  getPcfMcpPrompt,
  listPcfMcpPrompts,
  listPcfMcpResources,
  listPcfMcpTools,
  readPcfMcpResource
} from "../src/mcp/core.mjs";
import { handleMcpRequest } from "../src/mcp/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("MCP manifest exposes safe PCF tools, resources, and prompts", () => {
  const tools = listPcfMcpTools();
  const toolNames = tools.map((tool) => tool.name);

  assert.ok(toolNames.includes("pcf_health"));
  assert.ok(toolNames.includes("pcf_scout"));
  assert.ok(toolNames.includes("pcf_lane_save"));
  assert.ok(toolNames.includes("pcf_evidence_bundle_save"));
  assert.ok(toolNames.includes("pcf_provenance_draft"));
  assert.equal(toolNames.some((name) => /comment|label|merge|push|open_pr/i.test(name)), false);

  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
  }
  assert.equal(tools.find((tool) => tool.name === "pcf_lane_save").annotations.readOnlyHint, false);
  assert.equal(tools.find((tool) => tool.name === "pcf_evidence_bundle_save").annotations.readOnlyHint, false);
  assert.equal(tools.find((tool) => tool.name === "pcf_lane_read").annotations.readOnlyHint, true);

  assert.ok(listPcfMcpResources().some((resource) => resource.uri === "pcf://schemas/lane"));
  assert.ok(listPcfMcpPrompts().some((prompt) => prompt.name === "pcf_review_lane"));
});

test("health states the no-write MCP safety contract", async () => {
  const health = await callPcfMcpTool("pcf_health", {});

  assert.equal(health.ok, true);
  assert.equal(health.githubWriteToolsExposed, false);
  assert.equal(health.localArtifactWrites, "fixed PCF lane/evidence store only");
  assert.deepEqual(health.localArtifactWriteTools, ["pcf_lane_save", "pcf_evidence_bundle_save"]);
  assert.equal(health.githubWrites, "disabled");
  assert.equal(health.shellExecution, "not exposed");
  assert.ok(health.tools.includes("pcf_scout"));
  assert.ok(health.resources.includes("pcf://schemas/lane"));
});

test("scout ranks supplied contributor candidates without network collection", async () => {
  const scout = await callPcfMcpTool("pcf_scout", {
    generatedAt: "2026-06-11T20:00:00Z",
    candidates: [
      {
        repository: "owner/helpful",
        number: 7,
        title: "Fix tar.gz filtering",
        labels: ["bug", "help wanted"],
        body: "Steps to reproduce. Expected. Actual.",
        issuePaths: ["src/link_extractor.py"],
        acceptanceCriteria: true,
        forkPrAllowed: true
      },
      {
        repository: "owner/owned",
        number: 8,
        title: "Do the same work",
        labels: ["help wanted"],
        openPullRequestOverlap: true
      },
      {
        repository: "owner/stale-label",
        number: 9,
        title: "Fix provider details",
        labels: ["bug", "help wanted", "good first issue"],
        maintainerOwnedFix: true,
        issueClosedDuringWork: true
      }
    ]
  });

  assert.equal(scout.summary.total, 3);
  assert.equal(scout.candidates[0].repository, "owner/helpful");
  assert.equal(scout.candidates[0].status, "candidate");
  assert.equal(scout.candidates.find((row) => row.repository === "owner/owned").status, "blocked");
  assert.ok(scout.candidates
    .find((row) => row.repository === "owner/stale-label")
    .blockers.some((blocker) => blocker.id === "maintainer-owned-fix"));
  assert.match(scout.nonClaims.join("\n"), /does not search all of GitHub/);
});

test("policy scan and diff shape encode the maintainer-safety gates", async () => {
  const policy = await callPcfMcpTool("pcf_policy_scan", {
    changeSummary: "respect stat handler unix fallback",
    files: [
      {
        path: "interp/unix.go",
        content: "package interp\n// TODO: respect StatHandler before Unix fallback\nfunc f() {}\n"
      }
    ]
  });

  assert.equal(policy.status, "blocked");
  assert.equal(policy.blockers[0].id, "todo-conflict");

  const diff = await callPcfMcpTool("pcf_diff_shape", {
    files: [
      { path: "src/app.js", additions: 10, deletions: 2 },
      { path: "dist/app.min.js", additions: 5000, deletions: 0 }
    ],
    maxFiles: 3,
    maxLines: 100
  });

  assert.equal(diff.status, "blocked");
  assert.ok(diff.blockers.some((blocker) => blocker.id === "forbidden-path"));
  assert.ok(diff.blockers.some((blocker) => blocker.id === "too-many-lines"));
});

test("lane store writes only under PCF_DATA_DIR and evidence is explicit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-mcp-lanes-"));
  const previous = process.env.PCF_DATA_DIR;
  process.env.PCF_DATA_DIR = dir;
  try {
    const saved = await callPcfMcpTool("pcf_lane_save", {
      repository: "owner/repo",
      issue: "123",
      status: "review",
      summary: "Needs repro evidence.",
      gates: {
        scout: { status: "pass", reason: "candidate" },
        repro: { status: "pending", reason: "not run" }
      }
    });
    assert.equal(saved.ok, true);
    assert.match(saved.path, new RegExp(`^${escapeRegExp(dir)}/lanes/`));

    const read = await callPcfMcpTool("pcf_lane_read", {
      repository: "owner/repo",
      issue: "123"
    });
    assert.equal(read.record.lane.repository, "owner/repo");
    assert.equal(read.record.gates.repro.status, "pending");

    const evidence = await callPcfMcpTool("pcf_evidence_bundle_save", {
      repository: "owner/repo",
      issue: "123",
      kind: "repro",
      verdict: "before-fails",
      commands: [{ command: "npm test", exitCode: 1, outputPath: "artifacts/before.txt" }]
    });
    assert.equal(evidence.ok, true);
    assert.match(evidence.path, new RegExp(`^${escapeRegExp(dir)}/lanes/`));
    const text = await readFile(evidence.path, "utf8");
    assert.match(text, /PCF MCP did not execute these commands/);

    const list = await callPcfMcpTool("pcf_lane_list", {});
    assert.equal(list.summary.total, 1);
  } finally {
    if (previous === undefined) delete process.env.PCF_DATA_DIR;
    else process.env.PCF_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("resources and prompts expose lane schema and review guidance", async () => {
  const schema = await readPcfMcpResource("pcf://schemas/lane");
  const parsed = JSON.parse(schema.text);
  assert.equal(parsed.schema.title, "PCF Contribution Lane");
  assert.ok(parsed.gateOrder.includes("provenance"));

  const prompt = await getPcfMcpPrompt("pcf_review_lane", {
    repository: "owner/repo",
    issue: "#123"
  });
  assert.match(prompt.messages[0].content.text, /Stop before public action/);
});

test("JSON-RPC handler and stdio server respond to MCP tool calls", async () => {
  const handled = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.equal(handled.result.tools.some((tool) => tool.name === "pcf_health"), true);

  const request = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "pcf_health",
      arguments: {}
    }
  };
  const stdout = execFileSync(process.execPath, ["src/mcp/server.mjs"], {
    cwd: repoRoot,
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8"
  });
  const response = JSON.parse(stdout.trim());
  assert.equal(response.id, 2);
  const content = JSON.parse(response.result.content[0].text);
  assert.equal(content.githubWrites, "disabled");
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
