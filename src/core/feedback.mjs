import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evaluateContribution } from "./evaluator.mjs";
import { parsePatchSubmission } from "./patch.mjs";

export const FEEDBACK_VERSION = "2026.05.30";
export const DEFAULT_FEEDBACK_LIMIT = 200;

export const FEEDBACK_VERDICTS = [
  "correct",
  "false-positive",
  "false-negative",
  "too-harsh",
  "too-lenient",
  "missed-duplicate",
  "missed-upstream-fix",
  "missed-concurrent-work",
  "needs-human-review"
];

const REVIEW_STATUSES = new Set([
  "ready-for-maintainer",
  "needs-repair",
  "low-review-value"
]);

const CORRECTION_VERDICTS = new Set(FEEDBACK_VERDICTS.filter((verdict) => verdict !== "correct"));
const MAX_SOURCE_STRING = 20_000;
const MAX_SOURCE_ARRAY = 80;

export async function readFeedbackLedger(filePath, options = {}) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return normalizeLedger(parsed, options);
  } catch (error) {
    if (error.code === "ENOENT") return emptyLedger();
    return {
      ...emptyLedger(),
      readError: error.message
    };
  }
}

export async function appendFeedback({ filePath, feedback, maxEntries = DEFAULT_FEEDBACK_LIMIT, now = new Date().toISOString() }) {
  const ledger = await readFeedbackLedger(filePath);
  const entry = buildFeedbackEntry(feedback, { now });
  const limit = Math.max(1, Number(maxEntries) || DEFAULT_FEEDBACK_LIMIT);
  const entries = [entry, ...ledger.entries].slice(0, limit);
  const nextLedger = {
    version: FEEDBACK_VERSION,
    updatedAt: now,
    summary: summarizeFeedback(entries),
    entries
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");
  return {
    ledger: nextLedger,
    entry
  };
}

export function buildFeedbackEntry(payload = {}, { now = new Date().toISOString() } = {}) {
  const item = payload.item && typeof payload.item === "object" ? payload.item : {};
  const pcf = compactPcfEvidence(item, payload.pcf || {});
  const maintainer = normalizeMaintainerFeedback(payload);
  const originalPayload = normalizeOriginalPayload(payload.originalPayload || payload.originalInput || payload.input || item.fixtureInput || item.originalPayload || item.input || null);
  const repository = String(payload.repository || item.repository || "");
  const itemKey = feedbackItemKey({ ...item, repository });
  const id = feedbackId({
    repository,
    itemKey,
    verdict: maintainer.verdict,
    expectedStatus: maintainer.expectedStatus,
    recordedAt: now
  });

  return {
    id,
    version: FEEDBACK_VERSION,
    recordedAt: now,
    repository,
    itemKey,
    item: compactItem(item),
    originalPayload,
    pcf,
    maintainer,
    caseFile: buildCaseFile({
      id,
      recordedAt: now,
      repository,
      itemKey,
      item,
      pcf,
      maintainer
    })
  };
}

export function summarizeFeedback(entries = []) {
  const verdicts = {};
  const expectedStatuses = {};
  const repositories = [...new Set(entries.map((entry) => entry.repository).filter(Boolean))];
  let correctionCount = 0;
  let regressionCandidates = 0;
  let falsePositivePressure = 0;
  let falseNegativePressure = 0;
  let contextMisses = 0;

  for (const entry of entries) {
    const verdict = entry.maintainer?.verdict || "needs-human-review";
    verdicts[verdict] = (verdicts[verdict] || 0) + 1;
    const expectedStatus = entry.maintainer?.expectedStatus || "";
    if (expectedStatus) expectedStatuses[expectedStatus] = (expectedStatuses[expectedStatus] || 0) + 1;
    if (CORRECTION_VERDICTS.has(verdict)) correctionCount += 1;
    if (entry.maintainer?.shouldBecomeFixture || CORRECTION_VERDICTS.has(verdict)) regressionCandidates += 1;
    if (verdict === "false-positive" || verdict === "too-harsh") falsePositivePressure += 1;
    if (verdict === "false-negative" || verdict === "too-lenient") falseNegativePressure += 1;
    if (verdict === "missed-duplicate" || verdict === "missed-upstream-fix" || verdict === "missed-concurrent-work") {
      contextMisses += 1;
    }
  }

  const total = entries.length;
  const correct = verdicts.correct || 0;
  return {
    total,
    latestAt: entries[0]?.recordedAt || "",
    repositories,
    verdicts,
    expectedStatuses,
    correct,
    corrections: correctionCount,
    correctionRate: total ? Number((correctionCount / total).toFixed(3)) : 0,
    agreementRate: total ? Number((correct / total).toFixed(3)) : 0,
    regressionCandidates,
    falsePositivePressure,
    falseNegativePressure,
    contextMisses
  };
}

export function buildRegressionExport(entries = [], { generatedAt = new Date().toISOString() } = {}) {
  const cases = entries
    .filter((entry) => entry.maintainer?.shouldBecomeFixture || CORRECTION_VERDICTS.has(entry.maintainer?.verdict))
    .map((entry) => {
      const expectedStatus = entry.maintainer.expectedStatus || inferExpectedStatus(entry);
      const fixtureDraft = buildFixtureDraft(entry, expectedStatus);
      return {
        id: `feedback-${entry.id}`,
        source: "maintainer-feedback",
        repository: entry.repository,
        itemKey: entry.itemKey,
        title: entry.item.title,
        kind: entry.item.kind,
        number: entry.item.number,
        pcfStatus: entry.pcf.status,
        pcfAction: entry.pcf.action,
        maintainerVerdict: entry.maintainer.verdict,
        expectedStatus,
        regressionReason: entry.caseFile.summary,
        labels: entry.maintainer.labels,
        note: entry.maintainer.note,
        needsManualFixtureInput: !fixtureDraft.runnable,
        runnableFixture: fixtureDraft.runnable,
        manualReason: fixtureDraft.runnable ? "" : fixtureDraft.reason,
        fixture: fixtureDraft.fixture || null,
        replay: fixtureDraft.replay || {
          evaluated: false,
          reason: fixtureDraft.reason
        }
      };
    });
  const runnableFixtures = cases.filter((item) => item.runnableFixture).length;
  const needsManualFixtureInput = cases.length - runnableFixtures;
  const currentlyPassing = cases.filter((item) => item.replay?.passedAgainstExpected).length;
  const currentlyFailing = cases.filter((item) => item.replay?.evaluated && !item.replay.passedAgainstExpected).length;

  return {
    ok: true,
    version: FEEDBACK_VERSION,
    generatedAt,
    summary: {
      totalFeedback: entries.length,
      exportedCases: cases.length,
      runnableFixtures,
      needsManualFixtureInput,
      currentlyPassing,
      currentlyFailing
    },
    cases
  };
}

export function buildFixtureDraft(entry = {}, expectedStatus = "") {
  const originalPayload = entry.originalPayload || { available: false, reason: "original payload not supplied" };
  if (!originalPayload.available) {
    return {
      runnable: false,
      reason: originalPayload.reason || "original payload not supplied"
    };
  }

  const fixture = {
    id: `feedback-${entry.id}`,
    category: "maintainer-feedback",
    name: `Feedback: ${entry.maintainer?.verdict || "correction"} for ${entry.item?.title || entry.itemKey || "contribution"}`,
    sourceFeedback: {
      id: entry.id,
      recordedAt: entry.recordedAt,
      repository: entry.repository,
      itemKey: entry.itemKey,
      maintainerVerdict: entry.maintainer?.verdict || "",
      pcfStatus: entry.pcf?.status || ""
    },
    expect: expectationForFeedback(entry, expectedStatus)
  };

  if (originalPayload.type === "patch") {
    fixture.patchText = originalPayload.patchText;
    fixture.profile = originalPayload.profile || "kernel-grade";
    if (originalPayload.repositoryFiles?.length) fixture.repositoryFiles = originalPayload.repositoryFiles;
  } else {
    fixture.input = originalPayload.input;
    if (originalPayload.profile) fixture.profile = originalPayload.profile;
  }

  return {
    runnable: true,
    fixture,
    replay: replayFixtureDraft(fixture)
  };
}

export function buildCaseFile({ id, recordedAt, repository, itemKey, item, pcf, maintainer }) {
  const expectedStatus = maintainer.expectedStatus || inferExpectedStatus({ pcf, maintainer });
  const title = `${repository || "repository"} ${item.kind || "item"} ${item.number ? `#${item.number}` : itemKey}`;
  const summary = caseSummary({ pcf, maintainer, expectedStatus });
  const evidence = [
    `PCF status: ${pcf.status || "unknown"}${pcf.score || pcf.score === 0 ? ` (${pcf.score}/100)` : ""}`,
    `PCF action: ${pcf.action || "unknown"}`,
    `Maintainer verdict: ${maintainer.verdict}`,
    `Maintainer expected status: ${expectedStatus || "not specified"}`,
    `Context: ${pcf.contextSummary || "none"}`,
    `Top reasons: ${pcf.topReasons.length ? pcf.topReasons.map((reason) => `${reason.status}:${reason.title}`).join("; ") : "none"}`
  ];

  return {
    id,
    recordedAt,
    title,
    summary,
    evidence,
    recommendedNextAction: recommendedNextAction(maintainer.verdict),
    regressionCandidate: maintainer.shouldBecomeFixture || CORRECTION_VERDICTS.has(maintainer.verdict)
  };
}

function normalizeLedger(parsed, options = {}) {
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const filtered = entries.filter((entry) => {
    if (options.repository && entry.repository !== options.repository) return false;
    if (options.itemKey && entry.itemKey !== options.itemKey) return false;
    return true;
  });
  const limit = Number(options.limit);
  const limited = Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
  return {
    version: parsed.version || FEEDBACK_VERSION,
    updatedAt: parsed.updatedAt || "",
    summary: summarizeFeedback(limited),
    entries: limited
  };
}

function emptyLedger() {
  return {
    version: FEEDBACK_VERSION,
    updatedAt: "",
    summary: summarizeFeedback([]),
    entries: []
  };
}

function normalizeMaintainerFeedback(payload = {}) {
  const verdict = FEEDBACK_VERDICTS.includes(payload.verdict) ? payload.verdict : "needs-human-review";
  const expectedStatus = REVIEW_STATUSES.has(payload.expectedStatus) ? payload.expectedStatus : "";
  return {
    verdict,
    expectedStatus,
    expectedAction: String(payload.expectedAction || ""),
    note: truncate(String(payload.note || ""), 2000),
    reviewer: truncate(String(payload.reviewer || ""), 120),
    labels: normalizeStringList(payload.labels).slice(0, 12),
    shouldBecomeFixture: payload.shouldBecomeFixture !== false && verdict !== "correct"
  };
}

function normalizeOriginalPayload(payload) {
  if (!payload) {
    return {
      available: false,
      reason: "original payload not supplied"
    };
  }

  if (typeof payload === "string") {
    const patchText = redactSensitiveStrings(truncate(payload, MAX_SOURCE_STRING));
    return {
      available: Boolean(patchText.trim()),
      type: "patch",
      profile: "kernel-grade",
      patchText,
      repositoryFiles: [],
      redacted: patchText !== payload,
      reason: patchText.trim() ? "" : "empty patch text"
    };
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    return {
      available: false,
      reason: "original payload must be an object or patch text"
    };
  }

  const source = payload.input && typeof payload.input === "object"
    ? { ...payload.input, profile: payload.profile || payload.input.profile }
    : payload;
  const patchText = source.patchText || source.text;
  if (patchText) {
    return {
      available: true,
      type: "patch",
      profile: source.profile || "kernel-grade",
      patchText: redactSensitiveStrings(truncate(String(patchText), MAX_SOURCE_STRING)),
      repositoryFiles: sanitizeSourceValue(source.repositoryFiles || source.policyFiles || []),
      redacted: redactSensitiveStrings(String(patchText)) !== String(patchText)
    };
  }

  if (!source.kind && !source.title && !source.body) {
    return {
      available: false,
      reason: "original payload is missing kind/title/body"
    };
  }

  const input = sanitizeSourceValue({
    kind: source.kind || source.type || "pull_request",
    profile: source.profile || "",
    title: source.title || "",
    body: source.body || "",
    repository: source.repository || "",
    number: source.number || "",
    htmlUrl: source.htmlUrl || source.html_url || "",
    updatedAt: source.updatedAt || source.updated_at || "",
    authorAssociation: source.authorAssociation || "",
    draft: Boolean(source.draft),
    changedFiles: Number(source.changedFiles || 0),
    additions: Number(source.additions || 0),
    deletions: Number(source.deletions || 0),
    files: Array.isArray(source.files) ? source.files : [],
    checks: Array.isArray(source.checks) ? source.checks : [],
    repositoryFiles: source.repositoryFiles || source.policyFiles || [],
    repositoryContext: source.repositoryContext || source.repoContext || null,
    contributingText: source.contributingText || ""
  });

  return {
    available: true,
    type: "submission",
    profile: input.profile || "",
    input,
    redacted: JSON.stringify(input) !== JSON.stringify({
      kind: source.kind || source.type || "pull_request",
      profile: source.profile || "",
      title: source.title || "",
      body: source.body || "",
      repository: source.repository || "",
      number: source.number || "",
      htmlUrl: source.htmlUrl || source.html_url || "",
      updatedAt: source.updatedAt || source.updated_at || "",
      authorAssociation: source.authorAssociation || "",
      draft: Boolean(source.draft),
      changedFiles: Number(source.changedFiles || 0),
      additions: Number(source.additions || 0),
      deletions: Number(source.deletions || 0),
      files: Array.isArray(source.files) ? source.files : [],
      checks: Array.isArray(source.checks) ? source.checks : [],
      repositoryFiles: source.repositoryFiles || source.policyFiles || [],
      repositoryContext: source.repositoryContext || source.repoContext || null,
      contributingText: source.contributingText || ""
    })
  };
}

function compactItem(item = {}) {
  return {
    key: feedbackItemKey(item),
    id: String(item.id || ""),
    kind: String(item.kind || ""),
    number: item.number || "",
    title: truncate(String(item.title || ""), 240),
    repository: String(item.repository || ""),
    htmlUrl: safeHttpUrl(item.htmlUrl) ? item.htmlUrl : "",
    updatedAt: String(item.updatedAt || "")
  };
}

function compactPcfEvidence(item = {}, pcf = {}) {
  const source = Object.keys(pcf).length ? pcf : item;
  return {
    status: String(source.status || ""),
    action: String(source.action || ""),
    nextAction: source.nextAction || null,
    score: Number.isFinite(Number(source.score)) ? Number(source.score) : 0,
    labels: normalizeStringList(source.labels).slice(0, 20),
    contextSummary: truncate(String(source.contextSummary || ""), 400),
    contextFindings: Number(source.contextFindings || 0),
    reviewBudgetMinutes: Number(source.reviewBudgetMinutes || source.reviewBudget?.minutes || 0),
    failureCount: Number(source.failureCount || 0),
    warningCount: Number(source.warningCount || 0),
    topReasons: Array.isArray(source.topReasons)
      ? source.topReasons.slice(0, 5).map((reason) => ({
          id: String(reason.id || ""),
          title: truncate(String(reason.title || ""), 160),
          status: String(reason.status || ""),
          label: String(reason.label || ""),
          reason: truncate(String(reason.reason || ""), 300)
        }))
      : []
  };
}

function expectationForFeedback(entry = {}, expectedStatus = "") {
  const expect = {
    status: expectedStatus || inferExpectedStatus(entry)
  };
  const labels = normalizeStringList(entry.maintainer?.labels);
  if (labels.length) expect.labels = labels;
  if (expect.status === "ready-for-maintainer") expect.minScore = 80;
  if (expect.status === "low-review-value") expect.maxScore = 80;
  const profile = entry.originalPayload?.profile || entry.originalPayload?.input?.profile || "";
  if (profile) expect.profile = profile;
  return expect;
}

function replayFixtureDraft(fixture = {}) {
  try {
    const input = fixture.patchText
      ? parsePatchSubmission(fixture.patchText, {
          profile: fixture.profile || "kernel-grade",
          repositoryFiles: fixture.repositoryFiles || []
        })
      : deepClone(fixture.input);
    const result = evaluateContribution(input, { profile: fixture.profile || input.profile });
    const failures = compareDraftExpectation(fixture.expect || {}, result);
    return {
      evaluated: true,
      passedAgainstExpected: failures.length === 0,
      failures,
      actualStatus: result.status,
      actualScore: result.score,
      profile: result.profile.id,
      labels: result.labels
    };
  } catch (error) {
    return {
      evaluated: false,
      passedAgainstExpected: false,
      reason: error.message
    };
  }
}

function compareDraftExpectation(expect, result) {
  const failures = [];
  if (expect.status && result.status !== expect.status) failures.push(`status expected ${expect.status}, got ${result.status}`);
  if (expect.profile && result.profile.id !== expect.profile) failures.push(`profile expected ${expect.profile}, got ${result.profile.id}`);
  if (Number.isFinite(expect.minScore) && result.score < expect.minScore) failures.push(`score expected >= ${expect.minScore}, got ${result.score}`);
  if (Number.isFinite(expect.maxScore) && result.score > expect.maxScore) failures.push(`score expected <= ${expect.maxScore}, got ${result.score}`);
  for (const label of expect.labels || []) {
    if (!result.labels.includes(label)) failures.push(`missing label ${label}`);
  }
  return failures;
}

function sanitizeSourceValue(value) {
  if (typeof value === "string") return redactSensitiveStrings(truncate(value, MAX_SOURCE_STRING));
  if (Array.isArray(value)) return value.slice(0, MAX_SOURCE_ARRAY).map(sanitizeSourceValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_SOURCE_ARRAY)
      .map(([key, item]) => [key, sanitizeSourceValue(item)])
  );
}

function redactSensitiveStrings(value) {
  return value
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_PAT]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_ACCESS_KEY_ID]")
    .replace(/ASIA[0-9A-Z]{16}/g, "[REDACTED_AWS_SESSION_ACCESS_KEY_ID]")
    .replace(/AWS_SECRET_ACCESS_KEY\s*=\s*[A-Za-z0-9/+=]{20,}/g, "AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_SECRET_ACCESS_KEY]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED_OPENAI_KEY]");
}

function inferExpectedStatus(entry = {}) {
  const verdict = entry.maintainer?.verdict || "";
  if (entry.maintainer?.expectedStatus) return entry.maintainer.expectedStatus;
  if (verdict === "false-positive" || verdict === "too-harsh") return "ready-for-maintainer";
  if (verdict === "false-negative" || verdict === "too-lenient") return "needs-repair";
  if (verdict === "missed-duplicate" || verdict === "missed-upstream-fix" || verdict === "missed-concurrent-work") return "needs-repair";
  return entry.pcf?.status || "";
}

function caseSummary({ pcf, maintainer, expectedStatus }) {
  if (maintainer.verdict === "correct") {
    return `Maintainer agreed with PCF status ${pcf.status || "unknown"}.`;
  }
  return `Maintainer marked PCF as ${maintainer.verdict}; expected ${expectedStatus || "manual review"}.`;
}

function recommendedNextAction(verdict) {
  if (verdict === "correct") return "Keep as agreement evidence; no regression fixture needed.";
  if (verdict === "missed-duplicate" || verdict === "missed-upstream-fix" || verdict === "missed-concurrent-work") {
    return "Add repository-context fixture covering the missed relationship.";
  }
  if (verdict === "false-positive" || verdict === "too-harsh") return "Add regression case so reviewable work is not over-blocked.";
  if (verdict === "false-negative" || verdict === "too-lenient") return "Add regression case so risky work is not under-blocked.";
  return "Inspect manually and decide whether this becomes a regression fixture.";
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function truncate(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function feedbackItemKey(item = {}) {
  const number = item.number || "";
  if (item.repository && item.kind && number) return `${item.repository}:${item.kind}:${number}`;
  if (item.kind && number) return `${item.kind}:${number}`;
  return String(item.key || item.id || item.title || "unknown");
}

function feedbackId(seed) {
  return createHash("sha256")
    .update(JSON.stringify(seed))
    .digest("hex")
    .slice(0, 16);
}
