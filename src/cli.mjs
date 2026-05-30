#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { evaluateContribution, renderMarkdownReport } from "./core/evaluator.mjs";
import { parsePatchSubmission } from "./core/patch.mjs";
import { normalizeRepositoryFiles } from "./core/policy.mjs";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const command = args[0];
if (!["evaluate", "evaluate-patch"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

const file = args[1];
if (!file) {
  console.error("Missing input JSON file.");
  printHelp();
  process.exit(2);
}

const format = readFlag(args, "--format") || "pretty";
const profile = readFlag(args, "--profile") || "";
const policyFiles = await readPolicyFiles(readFlag(args, "--policy"));
const text = file === "-" ? await readStdin() : await readFile(file, "utf8");
const jsonInput = command === "evaluate" ? JSON.parse(text) : null;
const input = command === "evaluate-patch"
  ? parsePatchSubmission(text, { profile: profile || "kernel-grade", repositoryFiles: policyFiles })
  : { ...jsonInput, repositoryFiles: policyFiles.length ? policyFiles : jsonInput.repositoryFiles };
const evaluation = evaluateContribution(input, { profile: profile || input.profile });

if (format === "json") {
  console.log(JSON.stringify(evaluation, null, 2));
} else if (format === "markdown") {
  console.log(renderMarkdownReport(evaluation));
} else {
  printPretty(evaluation);
}

function printPretty(evaluation) {
  console.log(`Premature Contribution Firewall ${evaluation.kind}: ${evaluation.status} (${evaluation.score}/100)`);
  console.log(`Profile: ${evaluation.profile.name}`);
  console.log(`Review budget: ${evaluation.reviewBudget.level} (${evaluation.reviewBudget.minutes} min est.)`);
  console.log(`Labels: ${evaluation.labels.join(", ") || "none"}`);
  console.log("");
  console.log(evaluation.summary);
  console.log("");
  console.log("Repair checklist:");
  for (const step of evaluation.repairSteps) console.log(`- ${step}`);
  console.log("");
  console.log("Checks:");
  for (const check of evaluation.checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.title}: ${check.reason}`);
  }
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : "";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function readPolicyFiles(path) {
  if (!path) return [];
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text);
  return normalizeRepositoryFiles(Array.isArray(data) ? data : data.repositoryFiles || data.policyFiles || []);
}

function printHelp() {
  console.log(`Usage:
  node src/cli.mjs evaluate <payload.json> [--format pretty|json|markdown] [--profile standard|kernel-grade]
  node src/cli.mjs evaluate-patch <patch-or-mbox> [--format pretty|json|markdown] [--profile kernel-grade] [--policy policy-files.json]
  cat payload.json | node src/cli.mjs evaluate - --format json`);
}
