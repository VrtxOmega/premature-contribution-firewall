#!/usr/bin/env node
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { evaluateContribution } from "../src/core/evaluator.mjs";
import { normalizeWebhookPayload } from "../src/github/webhook.mjs";

const FAIL_ON_LEVELS = {
  "never": 99,
  "low-review-value": 2,
  "needs-repair": 1
};

const STATUS_LEVELS = {
  "ready-for-maintainer": 0,
  "needs-repair": 1,
  "low-review-value": 2
};

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const eventPath = readFlag(args, "--event") || process.env.GITHUB_EVENT_PATH || "";
const failOn = readFlag(args, "--fail-on") || process.env.PCF_FAIL_ON || "never";
const profile = readFlag(args, "--profile") || "";
const writePath = readFlag(args, "--write") || "";
const summaryPath = process.env.GITHUB_STEP_SUMMARY || "";
const outputPath = process.env.GITHUB_OUTPUT || "";

if (!Object.hasOwn(FAIL_ON_LEVELS, failOn)) {
  console.error(`Invalid --fail-on value: ${failOn}. Use never, low-review-value, or needs-repair.`);
  process.exit(2);
}

if (!eventPath) {
  console.error("Missing event payload. Set GITHUB_EVENT_PATH or pass --event <payload.json>.");
  process.exit(2);
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
if (!event.pull_request) {
  console.error("Event payload does not contain a pull_request object. The PR gate only runs on pull_request events.");
  process.exit(2);
}

const normalized = normalizeWebhookPayload("pull_request", event);
const evaluation = evaluateContribution(normalized, { profile: profile || normalized.profile });
const markdown = renderPrGateMarkdown(evaluation, normalized);

console.log(`PCF PR gate: ${normalized.repository || "unknown-repo"}#${normalized.number || "?"}`);
console.log(`Status: ${evaluation.status} (${evaluation.score}/100)`);
console.log(`Labels: ${evaluation.labels.join(", ") || "none"}`);
console.log(`Fail-on policy: ${failOn}`);

if (summaryPath) {
  await appendFile(summaryPath, `${markdown}\n`, "utf8");
}
if (writePath) {
  await writeFile(writePath, `${markdown}\n`, "utf8");
}
if (outputPath) {
  await appendFile(outputPath, [
    `status=${evaluation.status}`,
    `score=${evaluation.score}`,
    `ready=${evaluation.status === "ready-for-maintainer"}`,
    ""
  ].join("\n"), "utf8");
}

const statusLevel = STATUS_LEVELS[evaluation.status] ?? 2;
const failLevel = FAIL_ON_LEVELS[failOn];
if (statusLevel >= failLevel) {
  console.error(`PR gate failed: status ${evaluation.status} meets fail-on threshold ${failOn}.`);
  process.exit(1);
}

function renderPrGateMarkdown(result, input) {
  const lines = [];
  const number = input.number ? `#${input.number}` : "";
  lines.push(`## PCF review-readiness ${number}`.trim());
  lines.push("");
  lines.push(`**Status:** \`${result.status}\` (${result.score}/100) — profile \`${result.profile.id}\`, dry-run, no GitHub writes.`);
  lines.push("");
  lines.push(result.summary);
  if (result.labels.length) {
    lines.push("");
    lines.push(`**Labels:** ${result.labels.map((label) => `\`${label}\``).join(" ")}`);
  }
  if (result.status !== "ready-for-maintainer" && result.repairSteps.length) {
    lines.push("");
    lines.push("**Fix before requesting review:**");
    for (const step of result.repairSteps) lines.push(`- ${step}`);
  }
  const failing = result.checks.filter((check) => check.status !== "pass");
  if (failing.length) {
    lines.push("");
    lines.push("<details><summary>Non-passing checks</summary>");
    lines.push("");
    for (const check of failing) {
      lines.push(`- **${check.status.toUpperCase()}** ${check.title}: ${check.reason}`);
    }
    lines.push("");
    lines.push("</details>");
  }
  lines.push("");
  lines.push("_PCF checks review readiness, not correctness or authorship. This gate made no comments, labels, or other GitHub writes._");
  return lines.join("\n");
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : "";
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-pr-gate.mjs [--event event-payload.json] [--fail-on never|low-review-value|needs-repair] [--profile standard|kernel-grade] [--write pr-gate.md]

Evaluates the pull_request from a GitHub event payload, prints a readiness verdict,
appends markdown to GITHUB_STEP_SUMMARY when set, and exits non-zero when the
status meets the --fail-on threshold. Read-only: makes no GitHub API calls.`);
}
