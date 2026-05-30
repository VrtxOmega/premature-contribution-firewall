#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { renderAdversaryMarkdown, runAdversary } from "../src/core/adversary.mjs";

const args = process.argv.slice(2);
const format = readOption("--format", "summary");
const writePath = readOption("--write", "");
const failOnRegression = args.includes("--fail-on-regression");

const result = runAdversary();
let output = "";

if (format === "json") {
  output = `${JSON.stringify(result, null, 2)}\n`;
} else if (format === "markdown") {
  output = renderAdversaryMarkdown(result);
} else {
  output = renderSummary(result);
}

if (writePath) {
  await writeFile(writePath, output, "utf8");
  console.log(`Wrote adversarial red-test results to ${writePath}`);
} else {
  process.stdout.write(output);
}

if (failOnRegression && !result.ok) {
  process.exitCode = 1;
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function renderSummary(result) {
  const lines = [
    `Premature Contribution Firewall adversarial red test ${result.adversary.version}`,
    `Result: ${result.adversary.passed}/${result.adversary.total} passing in ${result.adversary.durationMs} ms`,
    ""
  ];
  for (const item of result.cases) {
    const status = item.actualScore === null ? item.actualStatus : `${item.actualStatus} (${item.actualScore}/100)`;
    lines.push(`${item.passed ? "PASS" : "FAIL"} ${item.id}: ${status}`);
    if (!item.passed) {
      for (const failure of item.failures) lines.push(`  - ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
