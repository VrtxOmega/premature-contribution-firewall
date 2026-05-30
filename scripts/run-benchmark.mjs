#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runBenchmark, renderBenchmarkMarkdown } from "../src/core/benchmark.mjs";

const args = process.argv.slice(2);
const format = readFlag(args, "--format") || "summary";
const writePath = readFlag(args, "--write");
const failOnRegression = args.includes("--fail-on-regression");

const result = runBenchmark();
let output;
if (format === "json") {
  output = `${JSON.stringify(result, null, 2)}\n`;
} else if (format === "markdown") {
  output = renderBenchmarkMarkdown(result);
} else {
  output = renderSummary(result);
}

if (writePath) {
  await mkdir(dirname(writePath), { recursive: true });
  await writeFile(writePath, output);
} else {
  process.stdout.write(output);
}

if (failOnRegression && !result.ok) {
  process.exitCode = 1;
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : "";
}

function renderSummary(result) {
  const lines = [
    `Premature Contribution Firewall benchmark ${result.benchmark.version}`,
    `Result: ${result.benchmark.passed}/${result.benchmark.total} passing in ${result.benchmark.durationMs} ms`,
    ""
  ];
  for (const item of result.cases) {
    const marker = item.passed ? "PASS" : "FAIL";
    lines.push(`${marker} ${item.id}: ${item.actualStatus} (${item.actualScore}/100)`);
    for (const failure of item.failures) lines.push(`  - ${failure}`);
  }
  return `${lines.join("\n")}\n`;
}
