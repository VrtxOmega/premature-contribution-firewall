export const CALIBRATION_VERSION = "2026.05.30";
export const CALIBRATION_REVIEW_LABEL = "feedback-calibration-needed";

const CORRECTION_VERDICTS = new Set([
  "false-positive",
  "false-negative",
  "too-harsh",
  "too-lenient",
  "missed-duplicate",
  "missed-upstream-fix",
  "missed-concurrent-work",
  "needs-human-review"
]);

const CONTEXT_MISS_VERDICTS = new Set([
  "missed-duplicate",
  "missed-upstream-fix",
  "missed-concurrent-work"
]);

const STATUS_VALUES = new Set([
  "ready-for-maintainer",
  "needs-repair",
  "low-review-value"
]);

export function buildFeedbackCalibration({
  feedbackEntries = [],
  candidates = [],
  repository = "",
  generatedAt = ""
} = {}) {
  const scopedRepository = String(repository || "");
  const feedback = feedbackEntries
    .map(compactFeedbackEntry)
    .filter(Boolean)
    .filter((entry) => !scopedRepository || !entry.repository || entry.repository === scopedRepository);
  const candidateFixtures = candidates
    .map(compactCandidate)
    .filter(Boolean)
    .filter((candidate) => !scopedRepository || !candidate.repository || candidate.repository === scopedRepository);
  const repositories = [...new Set([
    ...feedback.map((entry) => entry.repository).filter(Boolean),
    ...candidateFixtures.map((candidate) => candidate.repository).filter(Boolean)
  ])];
  const corrections = feedback.filter((entry) => entry.corrective).length;
  const statusCorrections = summarizeStatusCorrections(feedback);
  const verdicts = countBy(feedback, (entry) => entry.verdict || "needs-human-review");
  const expectedStatuses = countBy([
    ...feedback.filter((entry) => entry.expectedStatus),
    ...candidateFixtures.filter((candidate) => candidate.expectedStatus)
  ], (item) => item.expectedStatus || "unknown");
  const replayPassing = candidateFixtures.filter((candidate) => candidate.replayPassed).length;
  const replayFailing = candidateFixtures.filter((candidate) => candidate.replayEvaluated && !candidate.replayPassed).length;
  const falsePositivePressure = feedback.filter((entry) => entry.verdict === "false-positive" || entry.verdict === "too-harsh").length;
  const falseNegativePressure = feedback.filter((entry) => entry.verdict === "false-negative" || entry.verdict === "too-lenient").length;
  const contextMisses = feedback.filter((entry) => CONTEXT_MISS_VERDICTS.has(entry.verdict)).length;
  const active = feedback.length > 0 || candidateFixtures.length > 0;

  return {
    ok: true,
    version: CALIBRATION_VERSION,
    generatedAt,
    active,
    repository: scopedRepository,
    summary: {
      feedbackEntries: feedback.length,
      corrections,
      agreements: feedback.length - corrections,
      correctionRate: feedback.length ? Number((corrections / feedback.length).toFixed(3)) : 0,
      verdicts,
      expectedStatuses,
      candidateFixtures: candidateFixtures.length,
      replayPassing,
      replayFailing,
      repositories,
      falsePositivePressure,
      falseNegativePressure,
      contextMisses,
      statusCorrections
    },
    feedback: feedback.slice(0, 50),
    candidates: candidateFixtures.slice(0, 100)
  };
}

export function applyFeedbackCalibration(evaluation = {}, rawInput = {}, calibration = null) {
  const profile = normalizeCalibration(calibration);
  if (!profile.active) return evaluation;

  const input = compactInput(rawInput, evaluation);
  const matches = findCalibrationMatches({ input, evaluation, profile });
  const reviewNeeded = matches.some((match) => {
    if (!STATUS_VALUES.has(match.expectedStatus)) return false;
    if (match.expectedStatus === evaluation.status) return false;
    return match.replayPassed !== false;
  });
  const status = reviewNeeded ? "review-needed" : matches.length ? "matched" : "active-no-match";
  const labels = new Set(evaluation.labels || []);
  const repairSteps = [...(evaluation.repairSteps || [])];
  if (reviewNeeded) {
    labels.add(CALIBRATION_REVIEW_LABEL);
    repairSteps.unshift(reviewMatchedFeedbackStep({ matches, evaluation }));
  }

  const calibrationResult = {
    active: true,
    status,
    summary: calibrationSummary({ profile, matches, evaluation, reviewNeeded }),
    evidence: {
      feedbackEntries: profile.summary.feedbackEntries,
      corrections: profile.summary.corrections,
      candidateFixtures: profile.summary.candidateFixtures,
      replayPassing: profile.summary.replayPassing,
      replayFailing: profile.summary.replayFailing
    },
    pressure: {
      falsePositive: profile.summary.falsePositivePressure,
      falseNegative: profile.summary.falseNegativePressure,
      contextMisses: profile.summary.contextMisses
    },
    matches
  };

  return {
    ...evaluation,
    labels: [...labels],
    repairSteps: unique(repairSteps.filter(Boolean)),
    calibration: calibrationResult
  };
}

function normalizeCalibration(calibration) {
  if (!calibration || typeof calibration !== "object") {
    return buildFeedbackCalibration();
  }
  const feedback = Array.isArray(calibration.feedback) ? calibration.feedback : [];
  const candidates = Array.isArray(calibration.candidates) ? calibration.candidates : [];
  const active = Boolean(calibration.active || feedback.length || candidates.length);
  return {
    ok: calibration.ok !== false,
    version: calibration.version || CALIBRATION_VERSION,
    active,
    repository: String(calibration.repository || ""),
    summary: {
      feedbackEntries: Number(calibration.summary?.feedbackEntries || feedback.length || 0),
      corrections: Number(calibration.summary?.corrections || feedback.filter((entry) => entry.corrective).length || 0),
      agreements: Number(calibration.summary?.agreements || 0),
      correctionRate: Number(calibration.summary?.correctionRate || 0),
      verdicts: calibration.summary?.verdicts || {},
      expectedStatuses: calibration.summary?.expectedStatuses || {},
      candidateFixtures: Number(calibration.summary?.candidateFixtures || candidates.length || 0),
      replayPassing: Number(calibration.summary?.replayPassing || candidates.filter((candidate) => candidate.replayPassed).length || 0),
      replayFailing: Number(calibration.summary?.replayFailing || candidates.filter((candidate) => candidate.replayEvaluated && !candidate.replayPassed).length || 0),
      repositories: calibration.summary?.repositories || [],
      falsePositivePressure: Number(calibration.summary?.falsePositivePressure || 0),
      falseNegativePressure: Number(calibration.summary?.falseNegativePressure || 0),
      contextMisses: Number(calibration.summary?.contextMisses || 0),
      statusCorrections: calibration.summary?.statusCorrections || {}
    },
    feedback,
    candidates
  };
}

function compactFeedbackEntry(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const verdict = String(entry.maintainer?.verdict || entry.verdict || "");
  const expectedStatus = String(entry.maintainer?.expectedStatus || entry.expectedStatus || "");
  const pcfStatus = String(entry.pcf?.status || entry.item?.status || entry.pcfStatus || "");
  const item = entry.item || {};
  return {
    id: String(entry.id || ""),
    repository: String(entry.repository || item.repository || ""),
    itemKey: String(entry.itemKey || ""),
    kind: String(item.kind || item.type || ""),
    number: item.number || "",
    title: String(item.title || ""),
    verdict,
    corrective: CORRECTION_VERDICTS.has(verdict),
    expectedStatus,
    pcfStatus,
    labels: normalizeLabels(entry.maintainer?.labels || item.labels),
    recordedAt: String(entry.recordedAt || ""),
    note: String(entry.maintainer?.note || "").slice(0, 240)
  };
}

function compactCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return null;
  const fixtureInput = candidate.fixture?.input || {};
  const fixtureExpect = candidate.fixture?.expect || {};
  const kind = candidate.kind || fixtureInput.kind || (candidate.fixture?.patchText ? "pull_request" : "");
  const replayLabels = normalizeLabels(candidate.replay?.labels);
  return {
    id: String(candidate.id || ""),
    sourceCaseId: String(candidate.sourceCaseId || ""),
    repository: String(candidate.repository || candidate.fixture?.sourceFeedback?.repository || fixtureInput.repository || ""),
    itemKey: String(candidate.itemKey || ""),
    kind: String(kind || ""),
    number: candidate.number || fixtureInput.number || "",
    title: String(candidate.title || fixtureInput.title || candidate.fixture?.name || ""),
    expectedStatus: String(candidate.expectedStatus || fixtureExpect.status || ""),
    maintainerVerdict: String(candidate.maintainerVerdict || candidate.fixture?.sourceFeedback?.maintainerVerdict || ""),
    regressionReason: String(candidate.regressionReason || ""),
    profile: String(candidate.replay?.profile || candidate.fixture?.profile || fixtureInput.profile || ""),
    replayPassed: Boolean(candidate.replay?.passed),
    replayEvaluated: Boolean(candidate.replay),
    replayActualStatus: String(candidate.replay?.actualStatus || ""),
    replayLabels,
    tokens: tokenize(`${candidate.title || ""} ${fixtureInput.title || ""} ${candidate.regressionReason || ""}`),
    fileNames: normalizeFiles(fixtureInput.files || [])
  };
}

function compactInput(input = {}, evaluation = {}) {
  return {
    repository: String(input.repository || evaluation.repositoryContext?.repository || ""),
    itemKey: input.itemKey ? String(input.itemKey) : "",
    kind: String(input.kind || evaluation.kind || ""),
    number: input.number || "",
    title: String(input.title || ""),
    profile: String(evaluation.profile?.id || input.profile || ""),
    labels: normalizeLabels(evaluation.labels || input.labels),
    tokens: tokenize(`${input.title || ""} ${input.body || ""}`),
    fileNames: normalizeFiles(input.files || [])
  };
}

function findCalibrationMatches({ input, evaluation, profile }) {
  const candidates = profile.candidates
    .map((candidate) => scoreCandidateMatch({ candidate, input, evaluation }))
    .filter((match) => match.exact || (match.matchScore >= 5 && match.strong))
    .sort((left, right) => right.matchScore - left.matchScore || left.id.localeCompare(right.id))
    .slice(0, 5);
  const feedbackMatches = profile.feedback
    .map((entry) => scoreFeedbackMatch({ entry, input, evaluation }))
    .filter((match) => match.exact || (match.matchScore >= 5 && match.strong))
    .sort((left, right) => right.matchScore - left.matchScore || left.id.localeCompare(right.id))
    .slice(0, 3);
  return [...candidates, ...feedbackMatches]
    .sort((left, right) => right.matchScore - left.matchScore || left.source.localeCompare(right.source))
    .slice(0, 5);
}

function scoreCandidateMatch({ candidate, input, evaluation }) {
  const exact = Boolean(
    (candidate.itemKey && input.itemKey && candidate.itemKey === input.itemKey)
    || (candidate.repository && input.repository && candidate.repository === input.repository && candidate.number && input.number && String(candidate.number) === String(input.number))
  );
  let score = exact ? 12 : 0;
  if (candidate.repository && input.repository && candidate.repository === input.repository) score += 5;
  if (candidate.kind && input.kind && candidate.kind === input.kind) score += 3;
  if (candidate.profile && input.profile && candidate.profile === input.profile) score += 2;
  const tokenHits = tokenOverlap(candidate.tokens, input.tokens);
  const labelHits = overlapCount(candidate.replayLabels, input.labels);
  const fileHits = overlapCount(candidate.fileNames, input.fileNames);
  const strong = exact || tokenHits >= 3 || (fileHits > 0 && tokenHits >= 2);
  score += Math.min(4, tokenHits);
  score += Math.min(3, labelHits);
  score += Math.min(2, fileHits);
  if (candidate.expectedStatus && candidate.expectedStatus !== evaluation.status) score += 1;
  return publicMatch({
    source: "candidate",
    id: candidate.id,
    title: candidate.title,
    repository: candidate.repository,
    kind: candidate.kind,
    expectedStatus: candidate.expectedStatus,
    maintainerVerdict: candidate.maintainerVerdict,
    replayPassed: candidate.replayPassed,
    replayActualStatus: candidate.replayActualStatus,
    matchScore: score,
    exact,
    strong,
    reason: candidate.regressionReason || candidate.maintainerVerdict || "feedback candidate"
  });
}

function scoreFeedbackMatch({ entry, input, evaluation }) {
  const exact = Boolean(
    (entry.itemKey && input.itemKey && entry.itemKey === input.itemKey)
    || (entry.repository && input.repository && entry.repository === input.repository && entry.number && input.number && String(entry.number) === String(input.number))
  );
  let score = exact ? 10 : 0;
  if (entry.repository && input.repository && entry.repository === input.repository) score += 5;
  if (entry.kind && input.kind && entry.kind === input.kind) score += 3;
  const tokenHits = tokenOverlap(tokenize(entry.title), input.tokens);
  const labelHits = overlapCount(entry.labels, input.labels);
  const strong = exact || tokenHits >= 3;
  score += Math.min(4, tokenHits);
  score += Math.min(3, labelHits);
  if (entry.expectedStatus && entry.expectedStatus !== evaluation.status) score += 1;
  return publicMatch({
    source: "feedback",
    id: entry.id,
    title: entry.title,
    repository: entry.repository,
    kind: entry.kind,
    expectedStatus: entry.expectedStatus,
    maintainerVerdict: entry.verdict,
    replayPassed: null,
    replayActualStatus: entry.pcfStatus,
    matchScore: score,
    exact,
    strong,
    reason: entry.note || entry.verdict || "maintainer feedback"
  });
}

function publicMatch(match) {
  return {
    source: match.source,
    id: match.id,
    title: match.title,
    repository: match.repository,
    kind: match.kind,
    expectedStatus: match.expectedStatus,
    maintainerVerdict: match.maintainerVerdict,
    replayPassed: match.replayPassed,
    replayActualStatus: match.replayActualStatus,
    matchScore: match.matchScore,
    exact: match.exact,
    strong: match.strong,
    reason: String(match.reason || "").slice(0, 240)
  };
}

function calibrationSummary({ profile, matches, evaluation, reviewNeeded }) {
  if (reviewNeeded) {
    const first = matches.find((match) => match.expectedStatus && match.expectedStatus !== evaluation.status) || matches[0];
    return `${matches.length} local feedback match(es); ${first.id || "one match"} expects ${first.expectedStatus}, while this evaluation returned ${evaluation.status}.`;
  }
  if (matches.length) {
    return `${matches.length} local feedback match(es) agree with or inform this result.`;
  }
  return `Calibration active with ${profile.summary.corrections} correction(s) and ${profile.summary.candidateFixtures} promoted candidate fixture(s); no close match found for this submission.`;
}

function reviewMatchedFeedbackStep({ matches, evaluation }) {
  const conflict = matches.find((match) => match.expectedStatus && match.expectedStatus !== evaluation.status) || matches[0];
  const id = conflict?.id || "matched feedback";
  const expected = conflict?.expectedStatus || "a different status";
  return `Review local feedback calibration ${id} before relying on this status; maintainer evidence expects ${expected} while the base heuristic returned ${evaluation.status}.`;
}

function summarizeStatusCorrections(feedback) {
  const summary = {};
  for (const entry of feedback) {
    if (!entry.corrective) continue;
    const from = entry.pcfStatus || "unknown";
    const to = entry.expectedStatus || "unspecified";
    const key = `${from}->${to}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function normalizeLabels(labels = []) {
  if (!Array.isArray(labels)) return [];
  return [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))];
}

function normalizeFiles(files = []) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map((file) => String(file.filename || file.path || file || "").trim()).filter(Boolean))];
}

function tokenize(value) {
  return [...new Set(String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  )];
}

function tokenOverlap(left = [], right = []) {
  return overlapCount(left, right);
}

function overlapCount(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function unique(items = []) {
  return [...new Set(items)];
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "pull",
  "request",
  "issue",
  "patch",
  "fix",
  "fixes",
  "update",
  "change",
  "changes",
  "problem",
  "verification",
  "expected",
  "actual",
  "ready",
  "maintainer",
  "maintainers",
  "status",
  "local",
  "evidence",
  "marked"
]);
