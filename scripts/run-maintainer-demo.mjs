#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { runAdversary } from "../src/core/adversary.mjs";
import { evaluateMaintainerQueue } from "../src/core/api.mjs";
import { runBenchmark } from "../src/core/benchmark.mjs";
import {
  buildCandidateEntry,
  buildCandidateEvidenceArtifact,
  buildCandidateReplayComparison,
  replayCandidateCorpus
} from "../src/core/candidates.mjs";
import { buildFeedbackCalibration } from "../src/core/calibration.mjs";
import { buildFeedbackEntry, buildRegressionExport } from "../src/core/feedback.mjs";

const DEFAULT_QUEUE_FIXTURE = new URL("../fixtures/queue-sample.json", import.meta.url);
const DEMO_PROOF_GENERATED_AT = "2026-05-30T00:00:00.000Z";

export async function buildMaintainerDemoReport({
  generatedAt = new Date().toISOString(),
  queueFixtureUrl = DEFAULT_QUEUE_FIXTURE
} = {}) {
  const benchmark = runBenchmark();
  const adversary = runAdversary();
  const queuePayload = JSON.parse(await readFile(queueFixtureUrl, "utf8"));
  const candidateProof = buildDemoCandidateProof({ generatedAt: DEMO_PROOF_GENERATED_AT });
  const feedbackCalibration = buildFeedbackCalibration({
    repository: queuePayload.repository,
    feedbackEntries: [candidateProof.feedback],
    candidates: [candidateProof.candidate],
    generatedAt: DEMO_PROOF_GENERATED_AT
  });
  const queue = evaluateMaintainerQueue(queuePayload, {
    now: generatedAt,
    feedbackCalibration
  });

  const ok = Boolean(
    benchmark.ok &&
    adversary.ok &&
    queue.ok &&
    candidateProof.evidence.replay.ok &&
    candidateProof.comparison.ok &&
    candidateProof.comparison.summary.risk === "stable"
  );

  return {
    ok,
    generatedAt,
    name: "Premature Contribution Firewall Maintainer Demo",
    verdict: ok ? "PASS" : "NEEDS REVIEW",
    claims: [
      `${benchmark.benchmark.passed}/${benchmark.benchmark.total} deterministic benchmark cases pass.`,
      `${adversary.adversary.passed}/${adversary.adversary.total} adversarial red-test cases pass.`,
      `Maintainer queue sorts ${queue.summary.total} supplied GitHub items with repository and upstream context.`,
      `Feedback calibration attaches ${queue.summary.calibrationMatches} matching local candidate signal(s) to future queue output.`,
      `${candidateProof.evidence.summary.replayPassed}/${candidateProof.evidence.summary.total} promoted feedback fixture candidates replay cleanly.`,
      `Candidate replay comparison is ${candidateProof.comparison.summary.risk} with ${candidateProof.comparison.summary.regressed} regressions.`
    ],
    nonClaims: [
      "This is not an AI-authorship detector.",
      "This demo does not prove universal precision over private maintainer preference.",
      "This demo does not perform GitHub writes, post comments, apply labels, or require credentials.",
      "This demo does not certify public deployment security posture; hosted deployments still need auth, rate limits, webhook secrets, and operational review.",
      "Feedback candidates remain separate from the permanent benchmark until a maintainer intentionally reviews and promotes them."
    ],
    commands: [
      "npm run check",
      "npm test",
      "npm run benchmark",
      "npm run redtest",
      "npm run demo:maintainer -- --fail-on-regression"
    ],
    proof: {
      benchmark: compactBenchmark(benchmark),
      adversarialRedTest: compactAdversary(adversary),
      maintainerQueue: compactQueue(queue),
      feedbackCalibration: compactFeedbackCalibration(feedbackCalibration, queue),
      feedbackCandidate: compactCandidateProof(candidateProof),
      replayComparison: compactReplayComparison(candidateProof.comparison)
    }
  };
}

export function renderMaintainerDemoMarkdown(report) {
  const rows = [
    ["Benchmark", report.proof.benchmark.ok ? "PASS" : "FAIL", `${report.proof.benchmark.passed}/${report.proof.benchmark.total}`, "Deterministic fixture corpus"],
    ["Adversarial red test", report.proof.adversarialRedTest.ok ? "PASS" : "FAIL", `${report.proof.adversarialRedTest.passed}/${report.proof.adversarialRedTest.total}`, "Breakage residue corpus"],
    ["Maintainer queue", report.proof.maintainerQueue.ok ? "PASS" : "FAIL", `${report.proof.maintainerQueue.total} items`, `${report.proof.maintainerQueue.contextFindings} context findings`],
    ["Feedback calibration", report.proof.feedbackCalibration.matches > 0 ? "PASS" : "WARN", `${report.proof.feedbackCalibration.matches} match(es)`, `${report.proof.feedbackCalibration.candidateFixtures} candidate fixture(s)`],
    ["Feedback candidate replay", report.proof.feedbackCandidate.replayFailed === 0 ? "PASS" : "FAIL", `${report.proof.feedbackCandidate.replayPassed}/${report.proof.feedbackCandidate.total}`, "Promoted fixture draft"],
    ["Replay comparison", report.proof.replayComparison.risk === "stable" ? "PASS" : "FAIL", report.proof.replayComparison.risk, `${report.proof.replayComparison.regressed} regressions`]
  ];
  const queueRows = report.proof.maintainerQueue.items.map((item) => [
    item.status,
    item.kind,
    item.number ? `#${item.number}` : item.id,
    item.title,
    item.action,
    String(item.contextFindings),
    String(item.reviewBudgetMinutes)
  ]);
  const residueRows = report.proof.adversarialRedTest.residue.map((item) => [
    item.id,
    item.category,
    item.status,
    item.residue
  ]);

  return [
    "# Premature Contribution Firewall Maintainer Demo",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Verdict: **${report.verdict}**`,
    "",
    "## Claims This Demo Proves",
    "",
    ...report.claims.map((claim) => `- ${claim}`),
    "",
    "## Non-Claims",
    "",
    ...report.nonClaims.map((claim) => `- ${claim}`),
    "",
    "## Reproduce It",
    "",
    "```bash",
    ...report.commands,
    "```",
    "",
    "## Proof Summary",
    "",
    "| Surface | Result | Count | Note |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Maintainer Queue Snapshot",
    "",
    `Repository: ${report.proof.maintainerQueue.repository}`,
    "",
    `Ready: ${report.proof.maintainerQueue.ready}; needs repair: ${report.proof.maintainerQueue.needsRepair}; low review value: ${report.proof.maintainerQueue.lowReviewValue}; review budget: ${report.proof.maintainerQueue.reviewBudgetMinutes} minutes.`,
    "",
    `Feedback calibration matches: ${report.proof.feedbackCalibration.matches}; review-needed conflicts: ${report.proof.feedbackCalibration.reviewNeeded}.`,
    "",
    "| Status | Kind | Item | Title | Action | Context | Budget |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
    ...queueRows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Feedback Candidate Proof",
    "",
    `Candidate fixture: ${report.proof.feedbackCandidate.fixtureIds.join(", ") || "none"}`,
    "",
    `Evidence artifact hash: \`${report.proof.feedbackCandidate.evidenceMarkdownSha256}\``,
    "",
    `Replay comparison: ${report.proof.replayComparison.unchanged} unchanged, ${report.proof.replayComparison.improved} improved, ${report.proof.replayComparison.regressed} regressed, risk ${report.proof.replayComparison.risk}.`,
    "",
    "## Adversarial Residue",
    "",
    "| Case | Category | Status | Residue Preserved |",
    "| --- | --- | --- | --- |",
    ...residueRows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Release Note",
    "",
    "This output is safe to paste into a README or release note as reproducible local evidence. It should be paired with the benchmark and red-test result artifacts, API documentation, and the release checklist before a public pilot.",
    ""
  ].join("\n");
}

export function renderMaintainerDemoSummary(report) {
  return [
    `${report.name}`,
    `Result: ${report.verdict}`,
    `Benchmark: ${report.proof.benchmark.passed}/${report.proof.benchmark.total}`,
    `Adversarial red test: ${report.proof.adversarialRedTest.passed}/${report.proof.adversarialRedTest.total}`,
    `Queue: ${report.proof.maintainerQueue.total} items, ${report.proof.maintainerQueue.contextFindings} context findings, ${report.proof.maintainerQueue.reviewBudgetMinutes} min budget`,
    `Feedback calibration: ${report.proof.feedbackCalibration.matches} match(es), ${report.proof.feedbackCalibration.reviewNeeded} review-needed conflict(s)`,
    `Feedback candidate replay: ${report.proof.feedbackCandidate.replayPassed}/${report.proof.feedbackCandidate.total}`,
    `Replay comparison: ${report.proof.replayComparison.risk}, ${report.proof.replayComparison.regressed} regressions`,
    "Non-claim: not AI-authorship detection; no GitHub writes in this demo.",
    ""
  ].join("\n");
}

export async function runMaintainerDemoCli(args = process.argv.slice(2)) {
  const format = readOption(args, "--format", "summary");
  const writePath = readOption(args, "--write", "");
  const failOnRegression = args.includes("--fail-on-regression");
  if (!["summary", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format '${format}'. Use summary, json, or markdown.`);
  }

  const report = await buildMaintainerDemoReport();
  const output = format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : format === "markdown"
      ? renderMaintainerDemoMarkdown(report)
      : renderMaintainerDemoSummary(report);

  if (writePath) {
    await mkdir(dirname(writePath), { recursive: true });
    await writeFile(writePath, output, "utf8");
    process.stdout.write(`Wrote maintainer demo output to ${writePath}\n`);
  } else {
    process.stdout.write(output);
  }

  if (failOnRegression && !report.ok) {
    process.exitCode = 1;
  }
  return report;
}

function buildDemoCandidateProof({ generatedAt }) {
  const originalPayload = demoReadyPullRequest();
  const feedback = buildFeedbackEntry({
    repository: originalPayload.repository,
    item: {
      id: "demo-feedback-pr",
      kind: "pull_request",
      number: originalPayload.number,
      title: originalPayload.title,
      repository: originalPayload.repository,
      htmlUrl: originalPayload.htmlUrl,
      status: "needs-repair",
      action: "send-repair-request",
      score: 78,
      labels: ["possibly-duplicate"],
      contextSummary: "Demo maintainer resolved the apparent duplicate as non-blocking.",
      contextFindings: 1,
      reviewBudget: { minutes: 12 },
      failureCount: 1,
      warningCount: 0,
      topReasons: [
        {
          id: "repo-context",
          title: "Repository context needs maintainer call",
          status: "warn",
          label: "possibly-duplicate",
          reason: "Synthetic demo context was intentionally conservative."
        }
      ]
    },
    originalPayload,
    verdict: "too-harsh",
    expectedStatus: "ready-for-maintainer",
    note: "Demo maintainer promoted this as a false-positive guard after checking the context warning."
  }, { now: generatedAt });
  const regressionExport = buildRegressionExport([feedback], { generatedAt });
  const candidate = buildCandidateEntry(regressionExport.cases[0], { now: generatedAt });
  const replay = replayCandidateCorpus([candidate], { generatedAt });
  const evidence = buildCandidateEvidenceArtifact([candidate], { generatedAt });
  const comparison = buildCandidateReplayComparison({
    baselineReplay: replay,
    currentReplay: replay,
    generatedAt
  });
  return {
    feedback,
    regressionExport,
    candidate,
    replay,
    evidence,
    comparison
  };
}

function demoReadyPullRequest() {
  return {
    kind: "pull_request",
    profile: "standard",
    repository: "VrtxOmega/premature-contribution-firewall-demo",
    number: 501,
    title: "webhook: reject oversized payload bodies",
    body: [
      "Fixes #42.",
      "",
      "Problem: oversized webhook bodies could keep the local review server busy before signature handling completed.",
      "Change: reject payloads above the documented limit and return a clear error to the caller.",
      "Risk: low, because the limit already exists and this change only makes the failure path explicit.",
      "Verification: npm test passed locally and covered the oversized-payload path."
    ].join("\n"),
    htmlUrl: "https://github.example/pull/501",
    authorAssociation: "CONTRIBUTOR",
    changedFiles: 2,
    additions: 48,
    deletions: 12,
    files: [
      { filename: "src/server.mjs", additions: 30, deletions: 8 },
      { filename: "test/webhook.test.mjs", additions: 18, deletions: 4 }
    ],
    checks: [{ name: "test", conclusion: "success" }],
    repositoryContext: null
  };
}

function compactBenchmark(result) {
  return {
    ok: result.ok,
    version: result.benchmark.version,
    total: result.benchmark.total,
    passed: result.benchmark.passed,
    failed: result.benchmark.failed,
    categories: result.benchmark.categories,
    statuses: result.benchmark.statuses
  };
}

function compactAdversary(result) {
  return {
    ok: result.ok,
    version: result.adversary.version,
    total: result.adversary.total,
    passed: result.adversary.passed,
    failed: result.adversary.failed,
    categories: result.adversary.categories,
    statuses: result.adversary.statuses,
    residue: result.cases.map((item) => ({
      id: item.id,
      category: item.category,
      status: item.passed ? "PASS" : "FAIL",
      actualStatus: item.actualStatus,
      residue: item.residue
    }))
  };
}

function compactQueue(queue) {
  return {
    ok: queue.ok,
    repository: queue.repository,
    upstreamRepository: queue.upstreamRepository,
    total: queue.summary.total,
    ready: queue.summary.ready,
    needsRepair: queue.summary.needsRepair,
    lowReviewValue: queue.summary.lowReviewValue,
    contextFindings: queue.summary.contextFindings,
    calibrationMatches: queue.summary.calibrationMatches,
    calibrationReviewNeeded: queue.summary.calibrationReviewNeeded,
    reviewBudgetMinutes: queue.summary.reviewBudgetMinutes,
    actions: queue.summary.actions,
    labels: queue.summary.labels,
    items: queue.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      number: item.number,
      title: item.title,
      status: item.status,
      action: item.action,
      score: item.score,
      contextFindings: item.contextFindings,
      calibrationMatches: item.calibration?.matches || 0,
      reviewBudgetMinutes: item.reviewBudget?.minutes || 0,
      labels: item.labels
    }))
  };
}

function compactFeedbackCalibration(calibration, queue) {
  return {
    active: calibration.active,
    feedbackEntries: calibration.summary.feedbackEntries,
    corrections: calibration.summary.corrections,
    candidateFixtures: calibration.summary.candidateFixtures,
    replayPassing: calibration.summary.replayPassing,
    matches: queue.summary.calibrationMatches,
    reviewNeeded: queue.summary.calibrationReviewNeeded
  };
}

function compactCandidateProof(proof) {
  return {
    total: proof.evidence.summary.total,
    replayPassed: proof.evidence.summary.replayPassed,
    replayFailed: proof.evidence.summary.replayFailed,
    passRate: proof.evidence.summary.passRate,
    exportedCases: proof.regressionExport.summary.exportedCases,
    runnableFixtures: proof.regressionExport.summary.runnableFixtures,
    fixtureIds: proof.evidence.fixtureBundle.fixtures.map((item) => item.id),
    expectedStatuses: proof.evidence.fixtureBundle.fixtures.map((item) => item.expectedStatus),
    evidenceMarkdownSha256: sha256(proof.evidence.markdown)
  };
}

function compactReplayComparison(comparison) {
  return {
    ok: comparison.ok,
    risk: comparison.summary.risk,
    totalCompared: comparison.summary.totalCompared,
    baselinePassed: comparison.summary.baselinePassed,
    currentPassed: comparison.summary.currentPassed,
    improved: comparison.summary.improved,
    regressed: comparison.summary.regressed,
    changed: comparison.summary.changed,
    unchanged: comparison.summary.unchanged,
    newItems: comparison.summary.newItems,
    goneItems: comparison.summary.goneItems,
    averageScoreDelta: comparison.summary.averageScoreDelta
  };
}

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMaintainerDemoCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
