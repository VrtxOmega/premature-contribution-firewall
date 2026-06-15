import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  evaluateAiContributionPosture,
  formatAiContributionPostureReport,
  parseAiContributionPostureIndex
} from "../src/core/ai-contribution-posture.mjs";
import { callPcfMcpTool, readPcfMcpResource } from "../src/mcp/core.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("parses indexed posture entries from markdown", async () => {
  const markdown = await readFile(join(repoRoot, "docs/AI_CONTRIBUTION_POSTURE_INDEX.md"), "utf8");
  const index = parseAiContributionPostureIndex(markdown);

  assert.ok(index.some((entry) => entry.repository === "Xarlos89/Eos"));
  assert.ok(index.some((entry) => entry.repository === "ansvisor/ansvisor"));

  const eos = index.find((entry) => entry.repository === "Xarlos89/Eos");
  assert.equal(eos.posture, "ai-resistant");
  assert.equal(eos.risk, "high");
  assert.match(eos.contributorGuidance, /Do not open AI-assisted PRs/i);
  assert.ok(eos.evidence.length >= 2);
});

test("blocks AI-assisted lanes for ai-resistant repositories", async () => {
  const markdown = await readFile(join(repoRoot, "docs/AI_CONTRIBUTION_POSTURE_INDEX.md"), "utf8");
  const index = parseAiContributionPostureIndex(markdown);
  const result = evaluateAiContributionPosture({
    repository: "Xarlos89/Eos",
    index,
    aiAssisted: true
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.posture, "ai-resistant");
  assert.equal(result.risk, "high");
  assert.equal(result.blockers.length, 1);
  assert.match(formatAiContributionPostureReport(result), /AI-assisted contribution risk: HIGH/);
});

test("reviews AI-assisted lanes for ai-conditional repositories", async () => {
  const markdown = await readFile(join(repoRoot, "docs/AI_CONTRIBUTION_POSTURE_INDEX.md"), "utf8");
  const index = parseAiContributionPostureIndex(markdown);
  const result = evaluateAiContributionPosture({
    repository: "ansvisor/ansvisor",
    index,
    aiAssisted: true
  });

  assert.equal(result.status, "review");
  assert.equal(result.posture, "ai-conditional");
  assert.equal(result.risk, "medium");
});

test("MCP tool and resource expose the posture index gate", async () => {
  const result = await callPcfMcpTool("pcf_ai_contribution_posture", {
    repository: "Xarlos89/Eos",
    aiAssisted: true
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.artifact, "pcf-ai-contribution-posture");
  assert.match(result.report, /Recommendation:/);

  const resource = await readPcfMcpResource("pcf://docs/ai-posture-index");
  assert.equal(resource.mimeType, "text/markdown");
  assert.match(resource.text, /AI-Assisted Contribution Posture Index/);
  assert.match(resource.text, /Xarlos89\/Eos/);
});