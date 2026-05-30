import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runBenchmarkCase } from "./benchmark.mjs";
import { buildRegressionExport } from "./feedback.mjs";

export const CANDIDATE_CORPUS_VERSION = "2026.05.30";
export const DEFAULT_CANDIDATE_LIMIT = 250;

export async function readCandidateCorpus(filePath, options = {}) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return normalizeCandidateCorpus(parsed, options);
  } catch (error) {
    if (error.code === "ENOENT") return emptyCandidateCorpus();
    return {
      ...emptyCandidateCorpus(),
      readError: error.message
    };
  }
}

export async function applyFeedbackFixtureCandidates({
  filePath,
  feedbackEntries = [],
  caseIds = [],
  applyAllRunnable = false,
  maxEntries = DEFAULT_CANDIDATE_LIMIT,
  now = new Date().toISOString()
}) {
  const regressionExport = buildRegressionExport(feedbackEntries, { generatedAt: now });
  const selection = normalizeCaseSelection(caseIds);
  if (!applyAllRunnable && selection.size === 0) {
    return {
      ok: false,
      error: "caseIds are required unless applyAllRunnable is true",
      regressionExport,
      applied: [],
      skipped: []
    };
  }

  const corpus = await readCandidateCorpus(filePath);
  const existingIds = new Set(corpus.candidates.map((candidate) => candidate.id));
  const selectedCases = regressionExport.cases.filter((item) => {
    if (!item.runnableFixture) return false;
    if (applyAllRunnable) return true;
    return selection.has(item.id) || selection.has(item.fixture?.id);
  });
  const selectedIds = new Set(selectedCases.flatMap((item) => [item.id, item.fixture?.id].filter(Boolean)));
  const skipped = regressionExport.cases
    .filter((item) => selection.has(item.id) || selection.has(item.fixture?.id))
    .filter((item) => !item.runnableFixture)
    .map((item) => ({
      id: item.id,
      reason: item.manualReason || "candidate is not runnable"
    }));

  if (!applyAllRunnable) {
    for (const requested of selection) {
      if (!selectedIds.has(requested) && !skipped.some((item) => item.id === requested)) {
        skipped.push({ id: requested, reason: "case not found" });
      }
    }
  }

  const candidates = [];
  const applied = [];
  for (const item of selectedCases) {
    const candidate = buildCandidateEntry(item, { now });
    if (existingIds.has(candidate.id)) {
      skipped.push({ id: item.id, candidateId: candidate.id, reason: "already applied" });
      continue;
    }
    existingIds.add(candidate.id);
    candidates.push(candidate);
    applied.push({
      id: item.id,
      candidateId: candidate.id,
      expectedStatus: candidate.expectedStatus,
      replayPassed: candidate.replay.passed
    });
  }

  const limit = Math.max(1, Number(maxEntries) || DEFAULT_CANDIDATE_LIMIT);
  const nextCandidates = [...candidates, ...corpus.candidates].slice(0, limit);
  const nextCorpus = {
    version: CANDIDATE_CORPUS_VERSION,
    updatedAt: now,
    summary: summarizeCandidateCorpus(nextCandidates),
    candidates: nextCandidates
  };

  if (applied.length > 0) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(nextCorpus, null, 2)}\n`, "utf8");
  }

  return {
    ok: true,
    applied,
    skipped,
    regressionExport: {
      summary: regressionExport.summary,
      selectedRunnable: selectedCases.length
    },
    corpus: applied.length > 0 ? nextCorpus : corpus,
    replay: replayCandidateCorpus(applied.length > 0 ? nextCorpus.candidates : corpus.candidates)
  };
}

export function replayCandidateCorpus(candidates = [], { generatedAt = new Date().toISOString() } = {}) {
  const results = candidates.map((candidate) => replayCandidate(candidate));
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    version: CANDIDATE_CORPUS_VERSION,
    generatedAt,
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: results.length ? Number((passed / results.length).toFixed(3)) : 0,
      latestAppliedAt: candidates[0]?.appliedAt || "",
      repositories: [...new Set(candidates.map((candidate) => candidate.repository).filter(Boolean))],
      statuses: summarizeStatuses(results)
    },
    results
  };
}

export function buildCandidateEvidenceArtifact(candidates = [], { generatedAt = new Date().toISOString() } = {}) {
  const replay = replayCandidateCorpus(candidates, { generatedAt });
  const fixtureBundle = buildFixtureBundle(candidates, replay, { generatedAt });
  const markdown = renderCandidateEvidenceMarkdown({ candidates, replay, fixtureBundle, generatedAt });
  return {
    ok: true,
    version: CANDIDATE_CORPUS_VERSION,
    generatedAt,
    summary: {
      total: candidates.length,
      replayPassed: replay.summary.passed,
      replayFailed: replay.summary.failed,
      passRate: replay.summary.passRate,
      repositories: replay.summary.repositories
    },
    markdown,
    fixtureBundle,
    replay
  };
}

export function buildCandidateReplayComparison({
  baselineReplay,
  currentReplay,
  generatedAt = new Date().toISOString()
} = {}) {
  const baseline = normalizeReplayForComparison(baselineReplay);
  const current = normalizeReplayForComparison(currentReplay);
  if (!baseline.results.length) {
    return {
      ok: false,
      error: "baselineReplay with results is required",
      version: CANDIDATE_CORPUS_VERSION,
      generatedAt,
      summary: emptyComparisonSummary(),
      changes: [],
      markdown: ""
    };
  }

  const baselineById = new Map(baseline.results.map((item) => [item.candidateId, item]));
  const currentById = new Map(current.results.map((item) => [item.candidateId, item]));
  const currentIds = current.results.map((item) => item.candidateId);
  const goneIds = baseline.results.map((item) => item.candidateId).filter((id) => !currentById.has(id));
  const orderedIds = [...new Set([...currentIds, ...goneIds])];
  const changes = orderedIds.map((id) => compareReplayResult({
    id,
    baseline: baselineById.get(id) || null,
    current: currentById.get(id) || null
  }));
  const summary = summarizeComparison({ baseline, current, changes });
  const markdown = renderCandidateComparisonMarkdown({ generatedAt, summary, changes });

  return {
    ok: true,
    version: CANDIDATE_CORPUS_VERSION,
    generatedAt,
    summary,
    baseline: baseline.summary,
    current: current.summary,
    changes,
    markdown
  };
}

export function buildCandidateEntry(exportCase = {}, { now = new Date().toISOString() } = {}) {
  if (!exportCase.runnableFixture || !exportCase.fixture) {
    throw new Error("cannot build candidate entry from a non-runnable export case");
  }
  const replay = replayCandidate({ fixture: exportCase.fixture });
  return {
    id: exportCase.fixture.id,
    version: CANDIDATE_CORPUS_VERSION,
    appliedAt: now,
    sourceCaseId: exportCase.id,
    repository: exportCase.repository || "",
    itemKey: exportCase.itemKey || "",
    title: exportCase.title || exportCase.fixture.name || "",
    kind: exportCase.kind || exportCase.fixture.input?.kind || (exportCase.fixture.patchText ? "patch" : ""),
    number: exportCase.number || "",
    maintainerVerdict: exportCase.maintainerVerdict || "",
    expectedStatus: exportCase.expectedStatus || exportCase.fixture.expect?.status || "",
    regressionReason: exportCase.regressionReason || "",
    fixture: exportCase.fixture,
    replay: {
      passed: replay.passed,
      failures: replay.failures,
      actualStatus: replay.actualStatus,
      actualScore: replay.actualScore,
      profile: replay.profile,
      labels: replay.labels
    }
  };
}

function normalizeCandidateCorpus(parsed = {}, options = {}) {
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.filter((item) => item?.fixture) : [];
  const filtered = candidates.filter((candidate) => {
    if (options.repository && candidate.repository !== options.repository) return false;
    if (options.itemKey && candidate.itemKey !== options.itemKey) return false;
    return true;
  });
  const limit = Number(options.limit);
  const limited = Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
  return {
    version: parsed.version || CANDIDATE_CORPUS_VERSION,
    updatedAt: parsed.updatedAt || "",
    summary: summarizeCandidateCorpus(limited),
    candidates: limited
  };
}

function emptyCandidateCorpus() {
  return {
    version: CANDIDATE_CORPUS_VERSION,
    updatedAt: "",
    summary: summarizeCandidateCorpus([]),
    candidates: []
  };
}

function summarizeCandidateCorpus(candidates = []) {
  return {
    total: candidates.length,
    latestAppliedAt: candidates[0]?.appliedAt || "",
    repositories: [...new Set(candidates.map((candidate) => candidate.repository).filter(Boolean))],
    expectedStatuses: candidates.reduce((acc, candidate) => {
      const status = candidate.expectedStatus || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    replayPassingAtApply: candidates.filter((candidate) => candidate.replay?.passed).length,
    replayFailingAtApply: candidates.filter((candidate) => candidate.replay && !candidate.replay.passed).length
  };
}

function replayCandidate(candidate = {}) {
  try {
    const result = runBenchmarkCase(candidate.fixture);
    return {
      candidateId: candidate.id || result.id,
      sourceCaseId: candidate.sourceCaseId || "",
      repository: candidate.repository || "",
      itemKey: candidate.itemKey || "",
      title: candidate.title || result.name || "",
      expectedStatus: candidate.expectedStatus || result.expected?.status || "",
      passed: result.passed,
      failures: result.failures,
      actualStatus: result.actualStatus,
      actualScore: result.actualScore,
      profile: result.profile,
      labels: result.labels,
      reviewBudget: result.reviewBudget
    };
  } catch (error) {
    return {
      candidateId: candidate.id || "",
      sourceCaseId: candidate.sourceCaseId || "",
      repository: candidate.repository || "",
      itemKey: candidate.itemKey || "",
      title: candidate.title || "",
      expectedStatus: candidate.expectedStatus || "",
      passed: false,
      failures: [error.message],
      actualStatus: "",
      actualScore: 0,
      profile: "",
      labels: []
    };
  }
}

function normalizeCaseSelection(caseIds = []) {
  if (!Array.isArray(caseIds)) return new Set();
  return new Set(caseIds.map((item) => String(item || "").trim()).filter(Boolean));
}

function summarizeStatuses(results = []) {
  return results.reduce((acc, item) => {
    const status = item.actualStatus || "error";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function buildFixtureBundle(candidates = [], replay, { generatedAt }) {
  const replayById = new Map((replay.results || []).map((item) => [item.candidateId, item]));
  return {
    name: "Premature Contribution Firewall Feedback Candidate Bundle",
    version: CANDIDATE_CORPUS_VERSION,
    generatedAt,
    source: "feedback-candidates",
    replay: replay.summary,
    fixtures: candidates.map((candidate) => {
      const replayResult = replayById.get(candidate.id) || {};
      return {
        id: candidate.id,
        sourceCaseId: candidate.sourceCaseId || "",
        repository: candidate.repository || "",
        itemKey: candidate.itemKey || "",
        title: candidate.title || "",
        kind: candidate.kind || "",
        number: candidate.number || "",
        appliedAt: candidate.appliedAt || "",
        maintainerVerdict: candidate.maintainerVerdict || "",
        expectedStatus: candidate.expectedStatus || "",
        replay: {
          passed: Boolean(replayResult.passed),
          failures: replayResult.failures || [],
          actualStatus: replayResult.actualStatus || "",
          actualScore: replayResult.actualScore || 0,
          profile: replayResult.profile || "",
          labels: replayResult.labels || []
        },
        fixture: candidate.fixture
      };
    })
  };
}

function renderCandidateEvidenceMarkdown({ candidates = [], replay, fixtureBundle, generatedAt }) {
  const summary = replay.summary || {};
  const rows = fixtureBundle.fixtures.map((item) => [
    item.replay.passed ? "PASS" : "FAIL",
    item.repository || "repository",
    item.number ? `#${item.number}` : item.itemKey || item.id,
    item.expectedStatus || "n/a",
    item.replay.actualStatus || "n/a",
    String(item.replay.actualScore ?? 0),
    item.replay.labels.slice(0, 4).map((label) => `\`${escapeMarkdownCell(label)}\``).join(", ") || "none",
    item.id
  ]);
  const failureLines = fixtureBundle.fixtures
    .filter((item) => !item.replay.passed)
    .flatMap((item) => item.replay.failures.map((failure) => `- ${item.id}: ${failure}`));

  return [
    "# Premature Contribution Firewall Candidate Evidence",
    "",
    "This artifact summarizes promoted maintainer-feedback fixture candidates. It is generated from the local candidate corpus and replayed against the current evaluator. It is not an AI-authorship detector and it does not mutate the permanent benchmark corpus.",
    "",
    "## Summary",
    "",
    `- Generated: ${generatedAt}`,
    `- Candidate fixtures: ${candidates.length}`,
    `- Replay: ${summary.passed || 0}/${summary.total || 0} passing`,
    `- Pass rate: ${Math.round((summary.passRate || 0) * 100)}%`,
    `- Repositories: ${summary.repositories?.length ? summary.repositories.map(escapeMarkdownCell).join(", ") : "none"}`,
    "",
    "## Candidate Replay",
    "",
    "| Result | Repository | Item | Expected | Actual | Score | Labels | Fixture |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- |",
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
    "",
    "## Failure Residue",
    "",
    ...(failureLines.length ? failureLines : ["- None."]),
    "",
    "## Fixture Bundle",
    "",
    "Use the JSON bundle from the paired API response when opening a PR or adding these candidates to a reviewed benchmark corpus.",
    ""
  ].join("\n");
}

function normalizeReplayForComparison(replay = {}) {
  const results = Array.isArray(replay?.results)
    ? replay.results.map((item) => ({
        candidateId: String(item.candidateId || item.id || ""),
        sourceCaseId: String(item.sourceCaseId || ""),
        repository: String(item.repository || ""),
        itemKey: String(item.itemKey || ""),
        title: String(item.title || ""),
        expectedStatus: String(item.expectedStatus || ""),
        passed: Boolean(item.passed),
        failures: Array.isArray(item.failures) ? item.failures.map(String) : [],
        actualStatus: String(item.actualStatus || ""),
        actualScore: Number.isFinite(Number(item.actualScore)) ? Number(item.actualScore) : 0,
        profile: String(item.profile || ""),
        labels: Array.isArray(item.labels) ? item.labels.map(String) : []
      })).filter((item) => item.candidateId)
    : [];
  return {
    summary: {
      total: Number(replay?.summary?.total ?? results.length),
      passed: Number(replay?.summary?.passed ?? results.filter((item) => item.passed).length),
      failed: Number(replay?.summary?.failed ?? results.filter((item) => !item.passed).length),
      passRate: Number(replay?.summary?.passRate ?? (results.length ? results.filter((item) => item.passed).length / results.length : 0)),
      latestAppliedAt: String(replay?.summary?.latestAppliedAt || ""),
      repositories: Array.isArray(replay?.summary?.repositories)
        ? replay.summary.repositories.map(String)
        : [...new Set(results.map((item) => item.repository).filter(Boolean))]
    },
    results
  };
}

function compareReplayResult({ id, baseline, current }) {
  if (!baseline && current) {
    return {
      candidateId: id,
      transition: "new",
      impact: current.passed ? "new-pass" : "new-fail",
      title: current.title,
      repository: current.repository,
      expectedStatus: current.expectedStatus,
      baseline: null,
      current: compactReplayResult(current),
      failures: current.failures
    };
  }
  if (baseline && !current) {
    return {
      candidateId: id,
      transition: "gone",
      impact: "missing-current",
      title: baseline.title,
      repository: baseline.repository,
      expectedStatus: baseline.expectedStatus,
      baseline: compactReplayResult(baseline),
      current: null,
      failures: ["candidate is missing from current replay"]
    };
  }

  const changed = replayFingerprint(baseline) !== replayFingerprint(current);
  let transition = changed ? "changed" : "unchanged";
  let impact = changed ? "changed" : "stable";
  if (baseline.passed && !current.passed) {
    transition = "regressed";
    impact = "pass-to-fail";
  } else if (!baseline.passed && current.passed) {
    transition = "improved";
    impact = "fail-to-pass";
  }

  return {
    candidateId: id,
    transition,
    impact,
    title: current.title || baseline.title,
    repository: current.repository || baseline.repository,
    expectedStatus: current.expectedStatus || baseline.expectedStatus,
    baseline: compactReplayResult(baseline),
    current: compactReplayResult(current),
    scoreDelta: current.actualScore - baseline.actualScore,
    failures: current.failures
  };
}

function compactReplayResult(item) {
  if (!item) return null;
  return {
    passed: item.passed,
    actualStatus: item.actualStatus,
    actualScore: item.actualScore,
    profile: item.profile,
    labels: item.labels,
    failures: item.failures
  };
}

function replayFingerprint(item) {
  return JSON.stringify({
    passed: item.passed,
    actualStatus: item.actualStatus,
    actualScore: item.actualScore,
    profile: item.profile,
    labels: [...item.labels].sort(),
    failures: item.failures
  });
}

function summarizeComparison({ baseline, current, changes }) {
  const counts = changes.reduce((acc, item) => {
    acc[item.transition] = (acc[item.transition] || 0) + 1;
    return acc;
  }, {});
  const baselineScores = baseline.results.map((item) => item.actualScore);
  const currentScores = current.results.map((item) => item.actualScore);
  return {
    totalCompared: changes.length,
    baselineTotal: baseline.results.length,
    currentTotal: current.results.length,
    baselinePassed: baseline.results.filter((item) => item.passed).length,
    currentPassed: current.results.filter((item) => item.passed).length,
    currentFailed: current.results.filter((item) => !item.passed).length,
    passDelta: current.results.filter((item) => item.passed).length - baseline.results.filter((item) => item.passed).length,
    averageScoreDelta: Number((average(currentScores) - average(baselineScores)).toFixed(2)),
    improved: counts.improved || 0,
    regressed: counts.regressed || 0,
    changed: counts.changed || 0,
    unchanged: counts.unchanged || 0,
    newItems: counts.new || 0,
    goneItems: counts.gone || 0,
    risk: (counts.regressed || 0) > 0 || current.results.some((item) => !item.passed) ? "needs-review" : "stable"
  };
}

function emptyComparisonSummary() {
  return {
    totalCompared: 0,
    baselineTotal: 0,
    currentTotal: 0,
    baselinePassed: 0,
    currentPassed: 0,
    currentFailed: 0,
    passDelta: 0,
    averageScoreDelta: 0,
    improved: 0,
    regressed: 0,
    changed: 0,
    unchanged: 0,
    newItems: 0,
    goneItems: 0,
    risk: "needs-baseline"
  };
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function renderCandidateComparisonMarkdown({ generatedAt, summary, changes }) {
  const rows = changes.map((item) => [
    item.transition.toUpperCase(),
    item.repository || "repository",
    item.title || item.candidateId,
    item.expectedStatus || "n/a",
    item.baseline?.actualStatus || "n/a",
    item.current?.actualStatus || "n/a",
    item.scoreDelta ?? "n/a",
    item.candidateId
  ]);
  const residue = changes
    .filter((item) => item.transition === "regressed" || item.transition === "new" || item.transition === "gone" || item.current?.failures?.length)
    .flatMap((item) => {
      const failures = item.failures?.length ? item.failures : [`transition ${item.transition}`];
      return failures.map((failure) => `- ${item.candidateId}: ${failure}`);
    });

  return [
    "# Premature Contribution Firewall Candidate Replay Compare",
    "",
    "This artifact compares a caller-supplied candidate replay baseline with the current replay. It is intended for evaluator and policy edits before they are merged.",
    "",
    "## Summary",
    "",
    `- Generated: ${generatedAt}`,
    `- Baseline passing: ${summary.baselinePassed}/${summary.baselineTotal}`,
    `- Current passing: ${summary.currentPassed}/${summary.currentTotal}`,
    `- Pass delta: ${summary.passDelta}`,
    `- Average score delta: ${summary.averageScoreDelta}`,
    `- Improved: ${summary.improved}`,
    `- Regressed: ${summary.regressed}`,
    `- Changed: ${summary.changed}`,
    `- New: ${summary.newItems}`,
    `- Gone: ${summary.goneItems}`,
    `- Risk: ${summary.risk}`,
    "",
    "## Changes",
    "",
    "| Transition | Repository | Candidate | Expected | Baseline | Current | Score Delta | Fixture |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- |",
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
    "",
    "## Review Residue",
    "",
    ...(residue.length ? residue : ["- None."]),
    ""
  ].join("\n");
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
