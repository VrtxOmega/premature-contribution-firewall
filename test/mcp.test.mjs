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
  assert.ok(toolNames.includes("pcf_submission_readiness"));
  assert.ok(toolNames.includes("pcf_scout"));
  assert.ok(toolNames.includes("pcf_repro_gate"));
  assert.ok(toolNames.includes("pcf_lane_save"));
  assert.ok(toolNames.includes("pcf_lane_resume"));
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
  assert.ok(listPcfMcpResources().some((resource) => resource.uri === "pcf://schemas/repro"));
  assert.ok(listPcfMcpResources().some((resource) => resource.uri === "pcf://doctrine/safety"));
  assert.ok(listPcfMcpResources().some((resource) => resource.uri === "pcf://mcp/server-card"));
  assert.ok(listPcfMcpPrompts().some((prompt) => prompt.name === "pcf_review_lane"));
  assert.ok(listPcfMcpPrompts().some((prompt) => prompt.name === "pcf_submission_review"));
});

test("health states the no-write MCP safety contract", async () => {
  const health = await callPcfMcpTool("pcf_health", {});

  assert.equal(health.ok, true);
  assert.equal(health.githubWriteToolsExposed, false);
  assert.equal(health.localArtifactWrites, "fixed PCF lane/evidence store only");
  assert.deepEqual(health.localArtifactWriteTools, ["pcf_lane_save", "pcf_evidence_bundle_save"]);
  assert.equal(health.submissionReadinessTool, "pcf_submission_readiness");
  assert.equal(health.serverCardResource, "pcf://mcp/server-card");
  assert.equal(health.githubWrites, "disabled");
  assert.equal(health.shellExecution, "not exposed");
  assert.ok(health.tools.includes("pcf_scout"));
  assert.ok(health.tools.includes("pcf_repro_gate"));
  assert.ok(health.tools.includes("pcf_lane_resume"));
  assert.ok(health.resources.includes("pcf://schemas/lane"));
  assert.ok(health.resources.includes("pcf://mcp/server-card"));
});

test("submission readiness and server card expose registry-safe MCP posture", async () => {
  const readiness = await callPcfMcpTool("pcf_submission_readiness", {});
  assert.equal(readiness.ok, true);
  assert.equal(readiness.status, "pass");
  assert.equal(readiness.counts.localWriteTools, 2);
  assert.ok(readiness.checks.every((check) => check.status === "pass"));
  assert.ok(readiness.checks.some((check) => check.id === "glama-metadata"));
  assert.ok(readiness.checks.some((check) => check.id === "server-card-resource"));
  assert.match(readiness.nonClaims.join("\n"), /not Glama approval/);

  const cardResource = await readPcfMcpResource("pcf://mcp/server-card");
  const card = JSON.parse(cardResource.text);
  assert.equal(card.packageName, "premature-contribution-firewall");
  assert.equal(card.transport.type, "stdio");
  assert.equal(card.safety.githubWrites, "disabled");
  assert.deepEqual(card.safety.localArtifactWriteTools, ["pcf_lane_save", "pcf_evidence_bundle_save"]);
  assert.ok(card.capabilities.tools.some((tool) => tool.name === "pcf_submission_readiness"));
  assert.ok(card.submissionNotes.some((note) => /Glama/.test(note)));
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

test("repro gate classifies caller-supplied before and after evidence without execution", async () => {
  const pass = await callPcfMcpTool("pcf_repro_gate", {
    before: {
      verdict: "before-fails",
      commands: [{ command: "npm test -- before", exitCode: 1, outputPath: "artifacts/before.txt" }]
    },
    after: {
      verdict: "passed",
      commands: [{ command: "npm test -- after", exitCode: 0, outputPath: "artifacts/after.txt" }]
    }
  });

  assert.equal(pass.status, "pass");
  assert.equal(pass.gate.status, "pass");
  assert.match(pass.nonClaims.join("\n"), /PCF MCP did not execute/);

  const blocked = await callPcfMcpTool("pcf_repro_gate", {
    before: { verdict: "before-fails" },
    after: { commands: [{ command: "npm test -- after", exitCode: 1 }] }
  });
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.some((blocker) => blocker.id === "after-command-failed"));
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
        overlap: { status: "pass", reason: "no open overlap" },
        policy: { status: "pass", reason: "policy checked" },
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

    const resumed = await callPcfMcpTool("pcf_lane_resume", {
      repository: "owner/repo",
      issue: "123"
    });
    assert.equal(resumed.status, "not-ready");
    assert.equal(resumed.nextGate.id, "repro");

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

    const missing = await callPcfMcpTool("pcf_lane_resume", {
      repository: "owner/repo",
      issue: "missing"
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, "missing");
    assert.equal(missing.nextGate.id, "lane_save");
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
  assert.ok(parsed.gateOrder.includes("calibration"));

  const reproSchema = await readPcfMcpResource("pcf://schemas/repro");
  const reproParsed = JSON.parse(reproSchema.text);
  assert.equal(reproParsed.schema.title, "PCF Repro Evidence");
  assert.ok(reproParsed.acceptedVerdicts.after.includes("verified"));

  const safety = await readPcfMcpResource("pcf://doctrine/safety");
  const safetyParsed = JSON.parse(safety.text);
  assert.match(safetyParsed.agentRule, /Do not use it to perform/);

  const prompt = await getPcfMcpPrompt("pcf_review_lane", {
    repository: "owner/repo",
    issue: "#123"
  });
  assert.match(prompt.messages[0].content.text, /Stop before public action/);

  const submissionPrompt = await getPcfMcpPrompt("pcf_submission_review", {
    target: "Glama",
    notes: "pre-submit review"
  });
  assert.match(submissionPrompt.messages[0].content.text, /pcf_submission_readiness/);
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
