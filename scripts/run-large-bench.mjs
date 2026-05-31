#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { renderPublicPilotMarkdown } from "../src/core/pilot-proof.mjs";
import { buildPublicPilotReport } from "./run-public-pilot.mjs";

export const LARGE_BENCH_TARGETS = [
  "python/cpython",
  "rust-lang/rust",
  "golang/go",
  "nodejs/node",
  "kubernetes/kubernetes",
  "microsoft/vscode",
  "pytorch/pytorch",
  "tensorflow/tensorflow",
  "home-assistant/core",
  "systemd/systemd"
];

export const NEXT_ACTION_ORDER = [
  "review-now",
  "ask-reporter-for-evidence",
  "check-duplicate-or-fixed-first",
  "route-to-subsystem-or-process",
  "needs-maintainer-decision",
  "not-actionable-yet",
  "unknown"
];

export const ACTION_ORDER = [
  "review-now",
  "send-repair-request",
  "do-not-review-yet"
];

const NEXT_ACTION_MEANINGS = {
  "review-now": "Ready for maintainer attention.",
  "ask-reporter-for-evidence": "Send back to the reporter for missing evidence.",
  "check-duplicate-or-fixed-first": "Check duplicate, solved, concurrent, linked, or upstream-fixed context first.",
  "route-to-subsystem-or-process": "Route through ownership, subsystem, or project process before review.",
  "needs-maintainer-decision": "Maintainer judgment is required; PCF cannot reduce the next move further.",
  "not-actionable-yet": "Blocked, parked, stale, draft, or otherwise not actionable now.",
  "unknown": "Missing or legacy next-action data."
};

export async function runLargeBench({
  targets = LARGE_BENCH_TARGETS,
  captureDir = "",
  artifactDir = "",
  writePath = "",
  format = "summary",
  fromCaptures = false,
  limit = 12,
  includePullRequests = false,
  includeIssues = true,
  generatedAt = ""
} = {}) {
  const initialGeneratedAt = generatedAt || new Date().toISOString();
  const safeCaptureDir = captureDir || join(tmpdir(), `pcf-large-bench-${timestampForPath(initialGeneratedAt)}`);
  const effectiveGeneratedAt = generatedAt || (fromCaptures
    ? await readCaptureGeneratedAt(safeCaptureDir, targets)
    : initialGeneratedAt);
  const safeArtifactDir = artifactDir || join(safeCaptureDir, "replay-markdown");
  await mkdir(safeCaptureDir, { recursive: true });
  await mkdir(safeArtifactDir, { recursive: true });

  const rows = [];
  for (const repository of targets) {
    const safeName = safeRepositoryName(repository);
    const capturePath = join(safeCaptureDir, `${safeName}.capture.json`);
    const replayMarkdownPath = join(safeArtifactDir, `${safeName}.replay.md`);

    if (!fromCaptures) {
      await buildPublicPilotReport({
        repository,
        capturePath,
        limit,
        includePullRequests,
        includeIssues,
        generatedAt: effectiveGeneratedAt
      });
    }

    const proof = await buildPublicPilotReport({
      repository,
      fixturePath: capturePath,
      limit,
      includePullRequests,
      includeIssues,
      generatedAt: effectiveGeneratedAt
    });
    await writeFile(replayMarkdownPath, renderPublicPilotMarkdown(proof), "utf8");

    rows.push({
      repository,
      proof,
      capturePath,
      replayMarkdownPath,
      captureHash: await sha256File(capturePath),
      replayProofHash: sha256Json(proof)
    });
  }

  const result = summarizeLargeBenchReports(rows, {
    generatedAt: effectiveGeneratedAt,
    captureDir: safeCaptureDir,
    artifactDir: safeArtifactDir,
    limit,
    includePullRequests,
    includeIssues,
    fromCaptures
  });
  const output = format === "json"
    ? `${JSON.stringify(result, null, 2)}\n`
    : format === "markdown"
      ? renderLargeBenchMarkdown(result)
      : renderLargeBenchSummary(result);

  if (writePath) {
    await mkdir(dirname(writePath), { recursive: true });
    await writeFile(writePath, output, "utf8");
    process.stdout.write(`Wrote large bench output to ${writePath}\n`);
  } else {
    process.stdout.write(output);
  }

  return result;
}

export function summarizeLargeBenchReports(rows = [], {
  generatedAt = new Date().toISOString(),
  captureDir = "",
  artifactDir = "",
  limit = 12,
  includePullRequests = false,
  includeIssues = true,
  fromCaptures = false
} = {}) {
  const repositories = rows.map((row) => {
    const proof = row.proof || {};
    const breakdown = proof.breakdown || {};
    const context = proof.context || {};
    const total = breakdown.total || 0;
    const actionCounts = normalizeCounts(breakdown.actionCounts);
    const nextActionCounts = normalizeCounts(breakdown.nextActionCounts);
    const repairSubActionCounts = normalizeCounts(breakdown.repairSubActionCounts);
    const collectionErrors = Array.isArray(context.collectionErrors) ? context.collectionErrors : [];

    return {
      repository: row.repository || proof.repository || "",
      target: proof.target || {},
      total,
      actionCounts,
      nextActionCounts,
      repairSubActionCounts,
      reviewBudgetMinutes: breakdown.reviewBudgetMinutes || 0,
      context: {
        findings: context.findings || 0,
        itemsWithFindings: context.itemsWithFindings || 0,
        itemsChecked: context.itemsChecked || 0,
        itemsCleared: context.itemsCleared || 0,
        itemsUnavailable: context.itemsUnavailable || 0,
        collectionErrors: collectionErrors.length,
        labels: normalizeCounts(context.labels)
      },
      captureHash: row.captureHash || "",
      replayProofHash: row.replayProofHash || "",
      capturePath: row.capturePath || "",
      replayMarkdownPath: row.replayMarkdownPath || ""
    };
  });

  const aggregate = repositories.reduce((summary, row) => {
    summary.total += row.total;
    addCounts(summary.actionCounts, row.actionCounts);
    addCounts(summary.nextActionCounts, row.nextActionCounts);
    addCounts(summary.repairSubActionCounts, row.repairSubActionCounts);
    summary.context.findings += row.context.findings;
    summary.context.itemsWithFindings += row.context.itemsWithFindings;
    summary.context.itemsChecked += row.context.itemsChecked;
    summary.context.itemsCleared += row.context.itemsCleared;
    summary.context.itemsUnavailable += row.context.itemsUnavailable;
    summary.context.collectionErrors += row.context.collectionErrors;
    addCounts(summary.context.labels, row.context.labels);
    summary.reviewBudgetMinutes += row.reviewBudgetMinutes;
    return summary;
  }, {
    total: 0,
    actionCounts: {},
    nextActionCounts: {},
    repairSubActionCounts: {},
    reviewBudgetMinutes: 0,
    context: {
      findings: 0,
      itemsWithFindings: 0,
      itemsChecked: 0,
      itemsCleared: 0,
      itemsUnavailable: 0,
      collectionErrors: 0,
      labels: {}
    }
  });

  return {
    ok: aggregate.context.collectionErrors === 0,
    artifact: "large-maintainer-replay-bench",
    generatedAt,
    captureDir,
    artifactDir,
    fromCaptures,
    dryRun: true,
    targets: repositories.length,
    limit,
    includePullRequests,
    includeIssues,
    aggregate,
    repositories,
    nonClaims: [
      "This bench is a read-only stress test, not target maintainer endorsement.",
      "Raw capture files contain third-party issue/PR payloads and must remain private unless a maintainer consents.",
      "Hashes verify private local artifacts; they do not publish the captured payloads.",
      "The bench does not enable comments, labels, closures, or any other GitHub write action."
    ]
  };
}

export function renderLargeBenchMarkdown(result = {}) {
  const generatedDate = result.generatedAt ? new Date(result.generatedAt).toISOString().slice(0, 10) : "";
  const aggregate = result.aggregate || {};
  const context = aggregate.context || {};
  const repoRows = (result.repositories || []).map((row) => [
    code(row.repository),
    String(row.total),
    formatActionSplit(row.actionCounts),
    formatCountsForTable(row.nextActionCounts, NEXT_ACTION_ORDER),
    String(row.context.findings),
    `${row.context.itemsChecked}/${row.total}`,
    String(row.context.itemsUnavailable),
    String(row.context.collectionErrors),
    code(shortHash(row.captureHash)),
    code(shortHash(row.replayProofHash))
  ]);
  const nextActionRows = orderedEntries(aggregate.nextActionCounts, NEXT_ACTION_ORDER).map(([action, count]) => [
    code(action),
    String(count),
    NEXT_ACTION_MEANINGS[action] || "No description."
  ]);
  const repairRows = orderedEntries(aggregate.repairSubActionCounts, NEXT_ACTION_ORDER).map(([action, count]) => [
    code(action),
    String(count),
    NEXT_ACTION_MEANINGS[action] || "No description."
  ]);
  const actionRows = orderedEntries(aggregate.actionCounts, ACTION_ORDER).map(([action, count]) => [
    code(action),
    String(count)
  ]);
  const hashRows = (result.repositories || []).map((row) => [
    code(row.repository),
    code(row.captureHash),
    code(row.replayProofHash)
  ]);

  return [
    "# Large Maintainer Bench",
    "",
    `Generated from read-only GitHub pilots on ${generatedDate}.`,
    "",
    "This bench stress-tests PCF against large public maintainer queues. It is not an outreach list, endorsement list, or claim that these projects want PCF. The point is to find where PCF is wrong under large-project intake pressure, replay the same captured input offline, and publish only aggregate maintainer-action evidence.",
    "",
    "## Boundary",
    "",
    "- No comments, labels, reactions, closures, or writes were made to target repositories.",
    "- Raw replay captures contain third-party issue or PR payloads and are not committed.",
    "- Published hashes identify private local captures without disclosing their contents.",
    "- `torvalds/linux` remains a poor GitHub issue pilot target because Linux-kernel-style work belongs to PCF's `kernel-grade` patch path, not a fake GitHub issue queue.",
    "- `systemd/systemd` remains the Linux-adjacent GitHub queue for this bench.",
    "",
    "## Capture And Replay Method",
    "",
    `Each target was sampled with \`--limit ${result.limit || 12}\`, ${result.includePullRequests ? "issues and pull requests" : "issues only (`--no-pulls`)"}, repository context collection enabled, and GitHub search pacing from \`PCF_GITHUB_SEARCH_DELAY_MS\`.`,
    "",
    "The live pass wrote normalized replay payloads under a private capture directory. The published numbers below come from replaying those captures offline, which keeps the comparison stable even if the live GitHub queues change later.",
    "",
    "```bash",
    "export GH_TOKEN=\"<public-read token>\"",
    "export PCF_COLLECT_REPOSITORY_CONTEXT=true",
    "export PCF_GITHUB_SEARCH_DELAY_MS=2500",
    "npm run pilot:large -- --capture-dir /tmp/pcf-large-bench --write docs/LARGE_MAINTAINER_BENCH.md --format markdown",
    "npm run pilot:large -- --from-captures --capture-dir /tmp/pcf-large-bench --format markdown --write /tmp/pcf-large-bench-replay.md",
    "```",
    "",
    "Private capture directory used for this run:",
    "",
    "```text",
    result.captureDir || "(not recorded)",
    "```",
    "",
    "## Replay-Captured Result",
    "",
    `Targets: ${result.targets || 0}`,
    `Total sampled items: ${aggregate.total || 0}`,
    `Estimated review budget: ${aggregate.reviewBudgetMinutes || 0} minutes`,
    "",
    "| Queue bucket | Count |",
    "| --- | ---: |",
    ...actionRows.map(markdownRow),
    "",
    "## Next Action Distribution",
    "",
    "This is the maintainer-useful split inside and beyond the old repair bucket.",
    "",
    "| Next action | Count | Maintainer meaning |",
    "| --- | ---: | --- |",
    ...nextActionRows.map(markdownRow),
    "",
    "## Non-Ready Sub-Actions",
    "",
    "This excludes `review-now` and shows where maintainer work goes when an item is not immediately reviewable.",
    "",
    "| Sub-action | Count | Maintainer meaning |",
    "| --- | ---: | --- |",
    ...(repairRows.length ? repairRows : [[code("none"), "0", "No non-ready items."]]).map(markdownRow),
    "",
    "## Context Intelligence",
    "",
    `Repository context findings: ${context.findings || 0}`,
    `Items with context findings: ${context.itemsWithFindings || 0}`,
    `Context checked: ${context.itemsChecked || 0}/${aggregate.total || 0}`,
    `Context cleared: ${context.itemsCleared || 0}`,
    `Context unavailable: ${context.itemsUnavailable || 0}`,
    `Collection errors: ${context.collectionErrors || 0}`,
    "",
    "| Context label | Count |",
    "| --- | ---: |",
    ...(orderedEntries(context.labels || {}).length ? orderedEntries(context.labels || {}) : [["none", 0]]).map(([label, count]) => markdownRow([code(label), String(count)])),
    "",
    "## Repository Replay Table",
    "",
    "| Repository | Items | Coarse split | Next actions | Context findings | Context checked | Unavailable | Errors | Capture hash | Replay proof hash |",
    "| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...repoRows.map(markdownRow),
    "",
    "## Capture Integrity",
    "",
    "| Repository | Capture SHA-256 | Replay proof SHA-256 |",
    "| --- | --- | --- |",
    ...hashRows.map(markdownRow),
    "",
    "## Calibration History Locked In",
    "",
    "The earlier large-maintainer pass exposed that PCF was too bug-shaped for formal process issues. The permanent benchmark now includes large-maintainer cases for language proposals, Rust-style tracking issues, and RFE option wording, while repository context still keeps duplicate-adjacent or solved-adjacent items out of `review-now`.",
    "",
    "Regression lock-in:",
    "",
    "- `test/evaluator.test.mjs` covers large-maintainer language proposals, tracking issues, RFE option wording, and thin proposals that must still fail.",
    "- `test/repository-context.test.mjs` covers proposal ancestry references that should not become duplicate blockers.",
    "- `src/core/benchmark.mjs` includes large-maintainer process cases in the deterministic 69-case benchmark.",
    "",
    "## Non-Claims",
    "",
    ...(result.nonClaims || []).map((claim) => `- ${claim}`),
    ""
  ].join("\n");
}

export function renderLargeBenchSummary(result = {}) {
  const aggregate = result.aggregate || {};
  const context = aggregate.context || {};
  return [
    "Premature Contribution Firewall Large Maintainer Bench",
    `Targets: ${result.targets || 0}`,
    `Total sampled items: ${aggregate.total || 0}`,
    `Queue buckets: ${formatCountsForSummary(aggregate.actionCounts, ACTION_ORDER)}`,
    `Next actions: ${formatCountsForSummary(aggregate.nextActionCounts, NEXT_ACTION_ORDER)}`,
    `Context checked: ${context.itemsChecked || 0}/${aggregate.total || 0}`,
    `Context findings: ${context.findings || 0}`,
    `Collection errors: ${context.collectionErrors || 0}`,
    `Capture dir: ${result.captureDir || ""}`,
    "Non-claim: read-only large bench; no GitHub writes.",
    ""
  ].join("\n");
}

export async function runLargeBenchCli(args = process.argv.slice(2)) {
  const targets = readOption(args, "--targets", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const captureDir = readOption(args, "--capture-dir", "");
  const artifactDir = readOption(args, "--artifact-dir", "");
  const writePath = readOption(args, "--write", "");
  const format = readOption(args, "--format", "summary");
  const limit = clampNumber(readOption(args, "--limit", "12"), 12, 1, 100);
  const includePullRequests = args.includes("--include-pulls");
  const includeIssues = !args.includes("--no-issues");
  const fromCaptures = args.includes("--from-captures");
  const generatedAt = readOption(args, "--generated-at", "");

  if (!["summary", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format '${format}'. Use summary, json, or markdown.`);
  }

  return runLargeBench({
    targets: targets.length ? targets : LARGE_BENCH_TARGETS,
    captureDir,
    artifactDir,
    writePath,
    format,
    fromCaptures,
    limit,
    includePullRequests,
    includeIssues,
    generatedAt
  });
}

function addCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + (Number(value) || 0);
  }
}

function normalizeCounts(counts = {}) {
  return Object.fromEntries(
    Object.entries(counts || {})
      .filter(([key]) => key)
      .map(([key, value]) => [key, Number(value) || 0])
  );
}

function orderedEntries(counts = {}, preferredOrder = []) {
  const entries = Object.entries(counts || {}).filter(([, count]) => Number(count) !== 0);
  const order = new Map(preferredOrder.map((item, index) => [item, index]));
  return entries.sort(([left], [right]) => {
    const leftOrder = order.has(left) ? order.get(left) : preferredOrder.length;
    const rightOrder = order.has(right) ? order.get(right) : preferredOrder.length;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
}

function formatActionSplit(counts = {}) {
  return [
    `${counts["review-now"] || 0} review`,
    `${counts["send-repair-request"] || 0} repair`,
    `${counts["do-not-review-yet"] || 0} defer`
  ].join(" / ");
}

function formatCountsForSummary(counts = {}, order = []) {
  const entries = orderedEntries(counts, order);
  return entries.length
    ? entries.map(([key, value]) => `${key} ${value}`).join(", ")
    : "none";
}

function formatCountsForTable(counts = {}, order = []) {
  const entries = orderedEntries(counts, order);
  return entries.length
    ? entries.map(([key, value]) => `${code(key)} ${value}`).join("<br>")
    : "none";
}

function markdownRow(row = []) {
  return `| ${row.map(escapeTableCell).join(" | ")} |`;
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function code(value) {
  return `\`${String(value || "").replaceAll("`", "")}\``;
}

function safeRepositoryName(repository) {
  return String(repository || "repository")
    .replace(/[^A-Za-z0-9_.-]+/g, "__")
    .replace(/^_+|_+$/g, "");
}

function shortHash(hash = "") {
  return hash ? hash.slice(0, 16) : "";
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readCaptureGeneratedAt(captureDir, targets = []) {
  for (const repository of targets) {
    try {
      const capture = JSON.parse(await readFile(join(captureDir, `${safeRepositoryName(repository)}.capture.json`), "utf8"));
      if (capture.generatedAt) return String(capture.generatedAt);
    } catch {
      // Keep looking; the normal replay path will surface missing capture files.
    }
  }
  return new Date().toISOString();
}

function sha256Json(value) {
  return createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

function timestampForPath(value) {
  return String(value || new Date().toISOString()).replace(/[^0-9A-Za-z]+/g, "-").replace(/-+$/g, "");
}

function readOption(values, flag, fallback = "") {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : fallback;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runLargeBenchCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
