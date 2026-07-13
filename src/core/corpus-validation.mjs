import { createHash } from "node:crypto";

export const CORPUS_VALIDATION_VERSION = "2026.07.13";
export const VALIDATION_LANES = Object.freeze(["review-now", "repair", "defer"]);

const MAX_CORPUS_BYTES = 10 * 1024 * 1024;
const MAX_CASES = 10_000;
const MAX_RATINGS_PER_CASE = 50;
const MAX_IDENTIFIER_CHARS = 256;

const FORBIDDEN_RAW_FIELDS = new Set([
  "body",
  "comment",
  "comments",
  "content",
  "diff",
  "patch",
  "payload",
  "raw",
  "text",
  "title"
]);

const CSV_COLUMNS = Object.freeze([
  "id",
  "repository",
  "policyId",
  "dataset",
  "caseRef",
  "policySnapshot",
  "consentReference",
  "consentAllowed",
  "pcfLane",
  "pcfScore",
  "pcfNextActor",
  "raterId",
  "raterLane",
  "raterNextActor",
  "baselineSeconds",
  "pcfSeconds"
]);

const CALIBRATION_BINS = Object.freeze([
  { id: "0-19", min: 0, max: 19 },
  { id: "20-39", min: 20, max: 39 },
  { id: "40-59", min: 40, max: 59 },
  { id: "60-79", min: 60, max: 79 },
  { id: "80-100", min: 80, max: 100 }
]);

export class CorpusValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CorpusValidationError";
  }
}

export function validateCorpusText(text, {
  inputFormat = "",
  sourceName = ""
} = {}) {
  const rawText = String(text ?? "");
  if (!rawText.trim()) throw new CorpusValidationError("Corpus input is empty.");
  if (Buffer.byteLength(rawText, "utf8") > MAX_CORPUS_BYTES) {
    throw new CorpusValidationError("Corpus input exceeds the 10 MiB offline validation limit.");
  }
  const format = resolveInputFormat(rawText, inputFormat, sourceName);
  const parsed = format === "csv" ? parseCsvCorpus(rawText) : parseJsonlCorpus(rawText);
  const cases = normalizeCases(parsed);
  const sha256 = createHash("sha256").update(rawText, "utf8").digest("hex");
  return buildValidationResult(cases, {
    format,
    sha256,
    sourceName: safeSourceName(sourceName)
  });
}

export function renderCorpusValidationSummary(result = {}) {
  const corpus = result.corpus || {};
  const review = result.lanes?.["review-now"] || {};
  const agreement = result.agreement || {};
  const timing = result.timing || {};
  return [
    "Premature Contribution Firewall corpus validation",
    `Corpus: ${corpus.totalCases || 0} case(s), ${corpus.scoredCases || 0} scored, ${corpus.ambiguousCases || 0} ambiguous`,
    `Corpus SHA-256: ${corpus.sha256 || ""}`,
    `Review-now precision/recall: ${formatMetric(review.precision)} / ${formatMetric(review.recall)}`,
    `False review-now: ${result.falseReviewNow?.count || 0}`,
    `Inter-rater agreement: ${formatMetric(agreement.pairwiseAgreement)} (nominal kappa ${formatMetric(agreement.nominalKappa)})`,
    `Paired timing: ${timing.pairedCases || 0} case(s), median ${formatSeconds(timing.medianSecondsSaved)} saved`,
    `Decision boundary: ${result.decision?.status || "INCONCLUSIVE"}`,
    "Non-claim: measurement only; no benchmark mutation, model training, or maintainer endorsement.",
    ""
  ].join("\n");
}

export function renderCorpusValidationMarkdown(result = {}) {
  const corpus = result.corpus || {};
  const provenance = result.provenance || {};
  const agreement = result.agreement || {};
  const timing = result.timing || {};
  const lines = [
    "# PCF Corpus Validation Receipt",
    "",
    `- Result: **${result.ok ? "PASS" : "FAIL"}** for deterministic corpus measurement`,
    `- Decision boundary: **${result.decision?.status || "INCONCLUSIVE"}**`,
    `- Cases: ${corpus.totalCases || 0} total; ${corpus.scoredCases || 0} scored; ${corpus.ambiguousCases || 0} excluded as ambiguous`,
    `- Ratings: ${corpus.totalRatings || 0} across ${agreement.distinctRaters || 0} caller-asserted rater IDs`,
    `- Corpus SHA-256: \`${corpus.sha256 || ""}\``,
    `- Input: \`${escapeCode(corpus.sourceName || "unspecified")}\` (${corpus.inputFormat || "unknown"})`,
    "",
    "## Evidence provenance",
    "",
    `- Datasets: ${formatCodeList(provenance.datasets)}`,
    `- Policy snapshots: ${formatCodeList(provenance.policySnapshots)}`,
    `- Repositories represented: ${provenance.repositories || 0}`,
    `- Consented cases: ${provenance.consentedCases || 0}/${corpus.totalCases || 0}`,
    "",
    "## Lane metrics",
    "",
    "| Lane | Precision | Recall | TP | FP | FN | Support |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const lane of VALIDATION_LANES) {
    const metrics = result.lanes?.[lane] || {};
    lines.push(`| \`${lane}\` | ${formatMetric(metrics.precision)} | ${formatMetric(metrics.recall)} | ${metrics.truePositive || 0} | ${metrics.falsePositive || 0} | ${metrics.falseNegative || 0} | ${metrics.support || 0} |`);
  }

  lines.push(
    "",
    "## Confusion matrix",
    "",
    "Rows are PCF lanes; columns are strict-majority maintainer consensus.",
    "",
    "| PCF \\ Maintainer | review-now | repair | defer |",
    "| --- | ---: | ---: | ---: | ---: |"
  );
  for (const predicted of VALIDATION_LANES) {
    const row = result.confusionMatrix?.[predicted] || {};
    lines.push(`| \`${predicted}\` | ${row["review-now"] || 0} | ${row.repair || 0} | ${row.defer || 0} |`);
  }

  lines.push(
    "",
    "## False `review-now`",
    "",
    `Count: **${result.falseReviewNow?.count || 0}**`
  );
  if (result.falseReviewNow?.cases?.length) {
    lines.push(
      "",
      "| Opaque case | Repository | Policy | Approved case reference | Consensus | PCF score |",
      "| --- | --- | --- | --- | --- | ---: |"
    );
    for (const item of result.falseReviewNow.cases) {
      lines.push(`| \`${escapeCode(item.id)}\` | \`${escapeCode(item.repository || "-")}\` | \`${escapeCode(item.policyId || "-")}\` | \`${escapeCode(item.caseRef || "-")}\` | \`${escapeCode(item.consensusLane)}\` | ${item.pcfScore} |`);
    }
  } else {
    lines.push("", "None in this corpus.");
  }

  lines.push(
    "",
    "## Inter-rater agreement",
    "",
    `- Eligible multi-rater cases: ${agreement.eligibleCases || 0}`,
    `- Rating pairs: ${agreement.totalPairs || 0}`,
    `- Pairwise agreement: ${formatMetric(agreement.pairwiseAgreement)}`,
    `- Nominal kappa: ${formatMetric(agreement.nominalKappa)}`,
    `- Next-actor pairwise agreement: ${formatMetric(agreement.nextActorPairwiseAgreement)}`,
    "",
    "Rater IDs are caller-asserted identifiers. This receipt does not verify identity or independence.",
    "",
    "## Score calibration",
    "",
    "| PCF score | Cases | Mean score | Consensus review-now | PCF review-now | Absolute gap |",
    "| --- | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const bin of result.calibration || []) {
    lines.push(`| ${bin.id} | ${bin.count} | ${formatMetric(bin.meanScore)} | ${formatMetric(bin.observedReviewNowRate)} | ${formatMetric(bin.predictedReviewNowRate)} | ${formatMetric(bin.absoluteGap)} |`);
  }

  lines.push(
    "",
    "## Paired triage time",
    "",
    `- Paired cases: ${timing.pairedCases || 0}`,
    `- Mean seconds saved: ${formatSeconds(timing.meanSecondsSaved)}`,
    `- Median seconds saved: ${formatSeconds(timing.medianSecondsSaved)}`,
    `- Median percent saved: ${formatPercent(timing.medianPercentSaved)}`,
    `- Faster / equal / slower: ${timing.fasterCases || 0} / ${timing.equalCases || 0} / ${timing.slowerCases || 0}`,
    "",
    "## Exclusions",
    ""
  );
  if (result.exclusions?.length) {
    for (const item of result.exclusions) lines.push(`- \`${escapeCode(item.id)}\`: ${item.reason}`);
  } else {
    lines.push("None.");
  }

  lines.push(
    "",
    "## Boundaries and non-claims",
    "",
    `- **${result.decision?.status || "INCONCLUSIVE"}:** ${result.decision?.reason || "Measurement requires human interpretation."}`
  );
  for (const claim of result.nonClaims || []) lines.push(`- ${claim}`);
  return `${lines.join("\n")}\n`;
}

function buildValidationResult(cases, { format, sha256, sourceName }) {
  const confusionMatrix = emptyConfusionMatrix();
  const exclusions = [];
  const scored = [];
  for (const item of cases) {
    const consensusLane = strictMajority(item.ratings.map((rating) => rating.lane));
    const consensusNextActor = strictMajority(item.ratings.map((rating) => rating.nextActor).filter(Boolean));
    if (!consensusLane) {
      exclusions.push({ id: item.id, reason: "NO_STRICT_MAJORITY" });
      continue;
    }
    confusionMatrix[item.pcf.lane][consensusLane] += 1;
    scored.push({ ...item, consensusLane, consensusNextActor });
  }

  const falseReviewCases = scored
    .filter((item) => item.pcf.lane === "review-now" && item.consensusLane !== "review-now")
    .map((item) => ({
      id: item.id,
      repository: item.repository,
      policyId: item.policyId,
      caseRef: item.provenance.caseRef,
      consensusLane: item.consensusLane,
      pcfScore: item.pcf.score
    }));

  return {
    ok: true,
    artifact: "pcf-corpus-validation",
    version: CORPUS_VALIDATION_VERSION,
    corpus: {
      sourceName,
      inputFormat: format,
      sha256,
      totalCases: cases.length,
      scoredCases: scored.length,
      ambiguousCases: exclusions.length,
      totalRatings: cases.reduce((sum, item) => sum + item.ratings.length, 0)
    },
    provenance: buildProvenance(cases),
    confusionMatrix,
    lanes: buildLaneMetrics(confusionMatrix),
    falseReviewNow: {
      count: falseReviewCases.length,
      rateAmongPredictedReviewNow: ratio(
        falseReviewCases.length,
        scored.filter((item) => item.pcf.lane === "review-now").length
      ),
      cases: falseReviewCases
    },
    agreement: buildAgreement(cases),
    calibration: buildCalibration(scored),
    timing: buildTiming(cases),
    nextActor: buildNextActorMetrics(scored),
    exclusions,
    decision: {
      status: "INCONCLUSIVE",
      reason: "This command measures a consented corpus but cannot establish product validity, maintainer endorsement, or release readiness by itself."
    },
    nonClaims: [
      "No evaluator weights, policies, fixtures, or permanent benchmark expectations were changed.",
      "No model was trained and no corpus case was promoted automatically.",
      "No network access or GitHub write is required by the validation core.",
      "Consent, rater identity, rater independence, and provenance are caller assertions; PCF validates their declared shape, not their external truth.",
      "Raw issue bodies, titles, patches, diffs, comments, text, and payloads are rejected by the corpus contract."
    ]
  };
}

function normalizeCases(rawCases) {
  if (!Array.isArray(rawCases) || !rawCases.length) {
    throw new CorpusValidationError("Corpus must contain at least one case.");
  }
  if (rawCases.length > MAX_CASES) {
    throw new CorpusValidationError(`Corpus exceeds the ${MAX_CASES} case validation limit.`);
  }
  const ids = new Set();
  return rawCases.map((rawCase, index) => {
    assertNoForbiddenFields(rawCase, `case ${index + 1}`);
    const item = normalizeCase(rawCase, index);
    if (ids.has(item.id)) throw new CorpusValidationError(`Duplicate case id '${item.id}'.`);
    ids.add(item.id);
    return item;
  });
}

function normalizeCase(rawCase, index) {
  if (!rawCase || typeof rawCase !== "object" || Array.isArray(rawCase)) {
    throw new CorpusValidationError(`Case ${index + 1} must be an object.`);
  }
  assertAllowedKeys(rawCase, ["id", "repository", "policyId", "consent", "pcf", "ratings", "timing", "provenance"], `Case ${index + 1}`);
  const id = requiredString(rawCase.id, `Case ${index + 1} id`);
  const repository = boundedOptionalString(rawCase.repository, `Case '${id}' repository`);
  const policyId = boundedOptionalString(rawCase.policyId, `Case '${id}' policyId`);
  if (!repository && !policyId) {
    throw new CorpusValidationError(`Case '${id}' requires repository or policyId provenance.`);
  }
  const consent = rawCase.consent;
  if (!consent || consent.allowedForValidation !== true) {
    throw new CorpusValidationError(`Case '${id}' requires consent.allowedForValidation=true and a consent reference.`);
  }
  assertAllowedKeys(consent, ["allowedForValidation", "reference"], `Case '${id}' consent`);
  if (!boundedOptionalString(consent.reference, `Case '${id}' consent reference`)) {
    throw new CorpusValidationError(`Case '${id}' requires consent.allowedForValidation=true and a consent reference.`);
  }
  const pcf = rawCase.pcf || {};
  assertAllowedKeys(pcf, ["lane", "score", "nextActor"], `Case '${id}' pcf`);
  const lane = validLane(pcf.lane, `Case '${id}' PCF lane`);
  const score = boundedNumber(pcf.score, 0, 100, `Case '${id}' PCF score`);
  const ratings = Array.isArray(rawCase.ratings) ? rawCase.ratings : [];
  if (!ratings.length) throw new CorpusValidationError(`Case '${id}' requires at least one maintainer rating.`);
  if (ratings.length > MAX_RATINGS_PER_CASE) {
    throw new CorpusValidationError(`Case '${id}' exceeds the ${MAX_RATINGS_PER_CASE} rating limit.`);
  }
  const raterIds = new Set();
  const normalizedRatings = ratings.map((rating, ratingIndex) => {
    assertAllowedKeys(rating, ["raterId", "lane", "nextActor"], `Case '${id}' rating ${ratingIndex + 1}`);
    const raterId = requiredString(rating?.raterId, `Case '${id}' rating ${ratingIndex + 1} raterId`);
    if (raterIds.has(raterId)) throw new CorpusValidationError(`Case '${id}' has duplicate rater '${raterId}'.`);
    raterIds.add(raterId);
    return {
      raterId,
      lane: validLane(rating?.lane, `Case '${id}' rating ${ratingIndex + 1} lane`),
      nextActor: boundedOptionalString(rating?.nextActor, `Case '${id}' rating ${ratingIndex + 1} nextActor`)
    };
  });
  const provenance = rawCase.provenance || {};
  assertAllowedKeys(provenance, ["dataset", "caseRef", "policySnapshot", "collectedAt"], `Case '${id}' provenance`);
  const normalizedProvenance = {
    dataset: requiredString(provenance.dataset, `Case '${id}' provenance.dataset`),
    caseRef: requiredString(provenance.caseRef, `Case '${id}' provenance.caseRef`),
    policySnapshot: requiredString(provenance.policySnapshot, `Case '${id}' provenance.policySnapshot`),
    collectedAt: boundedOptionalString(provenance.collectedAt, `Case '${id}' provenance.collectedAt`)
  };
  return {
    id,
    repository,
    policyId,
    pcf: { lane, score, nextActor: boundedOptionalString(pcf.nextActor, `Case '${id}' pcf.nextActor`) },
    ratings: normalizedRatings,
    timing: normalizeTiming(rawCase.timing, id),
    provenance: normalizedProvenance
  };
}

function normalizeTiming(timing, id) {
  if (timing === undefined || timing === null) return null;
  assertAllowedKeys(timing, ["baselineSeconds", "pcfSeconds"], `Case '${id}' timing`);
  const baselinePresent = timing.baselineSeconds !== "" && timing.baselineSeconds !== undefined && timing.baselineSeconds !== null;
  const pcfPresent = timing.pcfSeconds !== "" && timing.pcfSeconds !== undefined && timing.pcfSeconds !== null;
  if (!baselinePresent && !pcfPresent) return null;
  const baselineSeconds = Number(timing.baselineSeconds);
  const pcfSeconds = Number(timing.pcfSeconds);
  if (!(baselineSeconds > 0) || !(pcfSeconds >= 0)) {
    throw new CorpusValidationError(`Case '${id}' timing requires baselineSeconds > 0 and pcfSeconds >= 0.`);
  }
  return { baselineSeconds, pcfSeconds };
}

function parseJsonlCorpus(text) {
  const cases = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      cases.push(JSON.parse(line));
    } catch (error) {
      throw new CorpusValidationError(`Invalid JSONL on line ${index + 1}: ${error.message}`);
    }
  }
  return cases;
}

function parseCsvCorpus(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((value) => value !== ""));
  if (rows.length < 2) throw new CorpusValidationError("CSV corpus requires a header and at least one data row.");
  const headers = rows[0].map((value) => value.trim());
  headers[0] = headers[0].replace(/^\uFEFF/, "");
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new CorpusValidationError(`CSV corpus has duplicate column(s): ${unique(duplicateHeaders).join(", ")}.`);
  const missing = CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new CorpusValidationError(`CSV corpus is missing required column(s): ${missing.join(", ")}.`);
  const unsupported = headers.filter((column) => !CSV_COLUMNS.includes(column));
  if (unsupported.length) throw new CorpusValidationError(`CSV corpus has unsupported column(s): ${unsupported.join(", ")}.`);
  const groups = new Map();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex];
    if (values.length > headers.length) throw new CorpusValidationError(`CSV row ${rowIndex + 1} has too many columns.`);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const id = requiredString(row.id, `CSV row ${rowIndex + 1} id`);
    const metadata = csvMetadata(row);
    let group = groups.get(id);
    if (!group) {
      group = {
        signature: JSON.stringify(metadata),
        item: {
          id,
          repository: row.repository,
          policyId: row.policyId,
          consent: {
            allowedForValidation: row.consentAllowed.trim().toLowerCase() === "true",
            reference: row.consentReference
          },
          pcf: {
            lane: row.pcfLane,
            score: row.pcfScore,
            nextActor: row.pcfNextActor
          },
          ratings: [],
          timing: row.baselineSeconds || row.pcfSeconds
            ? { baselineSeconds: row.baselineSeconds, pcfSeconds: row.pcfSeconds }
            : null,
          provenance: {
            dataset: row.dataset,
            caseRef: row.caseRef,
            policySnapshot: row.policySnapshot
          }
        }
      };
      groups.set(id, group);
    } else if (group.signature !== JSON.stringify(metadata)) {
      throw new CorpusValidationError(`CSV case '${id}' has inconsistent metadata across rater rows.`);
    }
    group.item.ratings.push({
      raterId: row.raterId,
      lane: row.raterLane,
      nextActor: row.raterNextActor
    });
  }
  return [...groups.values()].map((group) => group.item);
}

function csvMetadata(row) {
  return Object.fromEntries(CSV_COLUMNS
    .filter((column) => !["raterId", "raterLane", "raterNextActor"].includes(column))
    .map((column) => [column, row[column]]));
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new CorpusValidationError("CSV input ends inside a quoted field.");
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function buildLaneMetrics(matrix) {
  return Object.fromEntries(VALIDATION_LANES.map((lane) => {
    const truePositive = matrix[lane][lane];
    const predicted = VALIDATION_LANES.reduce((sum, actual) => sum + matrix[lane][actual], 0);
    const support = VALIDATION_LANES.reduce((sum, prediction) => sum + matrix[prediction][lane], 0);
    return [lane, {
      truePositive,
      falsePositive: predicted - truePositive,
      falseNegative: support - truePositive,
      precision: ratio(truePositive, predicted),
      recall: ratio(truePositive, support),
      support
    }];
  }));
}

function buildAgreement(cases) {
  const eligible = cases.filter((item) => item.ratings.length >= 2);
  let totalPairs = 0;
  let agreeingPairs = 0;
  let nextActorPairs = 0;
  let nextActorAgreeing = 0;
  const laneCounts = Object.fromEntries(VALIDATION_LANES.map((lane) => [lane, 0]));
  const raters = new Set();
  for (const item of cases) {
    for (const rating of item.ratings) raters.add(rating.raterId);
  }
  for (const item of eligible) {
    for (const rating of item.ratings) laneCounts[rating.lane] += 1;
    for (let left = 0; left < item.ratings.length; left += 1) {
      for (let right = left + 1; right < item.ratings.length; right += 1) {
        totalPairs += 1;
        if (item.ratings[left].lane === item.ratings[right].lane) agreeingPairs += 1;
        if (item.ratings[left].nextActor && item.ratings[right].nextActor) {
          nextActorPairs += 1;
          if (item.ratings[left].nextActor === item.ratings[right].nextActor) nextActorAgreeing += 1;
        }
      }
    }
  }
  const totalRatings = Object.values(laneCounts).reduce((sum, count) => sum + count, 0);
  const observed = ratio(agreeingPairs, totalPairs);
  const expected = totalRatings
    ? round(Object.values(laneCounts).reduce((sum, count) => sum + (count / totalRatings) ** 2, 0))
    : null;
  const nominalKappa = observed === null || expected === null || expected === 1
    ? null
    : round((observed - expected) / (1 - expected));
  return {
    eligibleCases: eligible.length,
    distinctRaters: raters.size,
    totalPairs,
    agreeingPairs,
    pairwiseAgreement: observed,
    expectedAgreement: expected,
    nominalKappa,
    nextActorPairs,
    nextActorPairwiseAgreement: ratio(nextActorAgreeing, nextActorPairs)
  };
}

function buildCalibration(scored) {
  return CALIBRATION_BINS.map((bin) => {
    const items = scored.filter((item) => item.pcf.score >= bin.min && item.pcf.score <= bin.max);
    const observed = ratio(items.filter((item) => item.consensusLane === "review-now").length, items.length);
    const predicted = ratio(items.filter((item) => item.pcf.lane === "review-now").length, items.length);
    return {
      id: bin.id,
      count: items.length,
      meanScore: items.length ? round(mean(items.map((item) => item.pcf.score))) : null,
      observedReviewNowRate: observed,
      predictedReviewNowRate: predicted,
      absoluteGap: observed === null || predicted === null ? null : round(Math.abs(observed - predicted))
    };
  });
}

function buildTiming(cases) {
  const pairs = cases.filter((item) => item.timing).map((item) => {
    const secondsSaved = item.timing.baselineSeconds - item.timing.pcfSeconds;
    return {
      secondsSaved,
      percentSaved: (secondsSaved / item.timing.baselineSeconds) * 100
    };
  });
  return {
    pairedCases: pairs.length,
    meanSecondsSaved: pairs.length ? round(mean(pairs.map((item) => item.secondsSaved))) : null,
    medianSecondsSaved: pairs.length ? round(median(pairs.map((item) => item.secondsSaved))) : null,
    meanPercentSaved: pairs.length ? round(mean(pairs.map((item) => item.percentSaved))) : null,
    medianPercentSaved: pairs.length ? round(median(pairs.map((item) => item.percentSaved))) : null,
    fasterCases: pairs.filter((item) => item.secondsSaved > 0).length,
    equalCases: pairs.filter((item) => item.secondsSaved === 0).length,
    slowerCases: pairs.filter((item) => item.secondsSaved < 0).length
  };
}

function buildNextActorMetrics(scored) {
  const eligible = scored.filter((item) => item.consensusNextActor && item.pcf.nextActor);
  const matching = eligible.filter((item) => item.consensusNextActor === item.pcf.nextActor).length;
  return { eligibleCases: eligible.length, matchingCases: matching, accuracy: ratio(matching, eligible.length) };
}

function buildProvenance(cases) {
  return {
    consentedCases: cases.length,
    datasets: unique(cases.map((item) => item.provenance.dataset)).sort(),
    policySnapshots: unique(cases.map((item) => item.provenance.policySnapshot)).sort(),
    repositories: unique(cases.map((item) => item.repository).filter(Boolean)).length,
    policyIds: unique(cases.map((item) => item.policyId).filter(Boolean)).length,
    caseReferences: unique(cases.map((item) => item.provenance.caseRef)).length
  };
}

function emptyConfusionMatrix() {
  return Object.fromEntries(VALIDATION_LANES.map((predicted) => [
    predicted,
    Object.fromEntries(VALIDATION_LANES.map((actual) => [actual, 0]))
  ]));
}

function strictMajority(values) {
  if (!values.length) return "";
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return ordered[0][1] > values.length / 2 ? ordered[0][0] : "";
}

function assertNoForbiddenFields(value, path) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_RAW_FIELDS.has(normalizedKey)) {
      throw new CorpusValidationError(`${path} contains forbidden raw-content field '${key}'.`);
    }
    assertNoForbiddenFields(nested, `${path}.${key}`);
  }
}

function assertAllowedKeys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CorpusValidationError(`${path} must be an object.`);
  }
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) {
    throw new CorpusValidationError(`${path} has unsupported field(s): ${unsupported.join(", ")}.`);
  }
}

function resolveInputFormat(text, requested, sourceName) {
  const format = optionalString(requested).toLowerCase();
  if (format) {
    if (!new Set(["jsonl", "csv"]).has(format)) throw new CorpusValidationError(`Unsupported input format '${format}'. Use jsonl or csv.`);
    return format;
  }
  if (/\.csv$/i.test(sourceName)) return "csv";
  if (/\.jsonl$/i.test(sourceName)) return "jsonl";
  return text.trimStart().startsWith("{") ? "jsonl" : "csv";
}

function validLane(value, label) {
  const lane = requiredString(value, label);
  if (!VALIDATION_LANES.includes(lane)) {
    throw new CorpusValidationError(`${label} must be one of: ${VALIDATION_LANES.join(", ")}.`);
  }
  return lane;
}

function boundedNumber(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new CorpusValidationError(`${label} must be a number from ${min} to ${max}.`);
  }
  return number;
}

function requiredString(value, label) {
  const normalized = boundedOptionalString(value, label);
  if (!normalized) throw new CorpusValidationError(`${label} is required.`);
  return normalized;
}

function boundedOptionalString(value, label) {
  const normalized = optionalString(value);
  if (!normalized) return "";
  if (normalized.length > MAX_IDENTIFIER_CHARS) {
    throw new CorpusValidationError(`${label} exceeds ${MAX_IDENTIFIER_CHARS} characters.`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new CorpusValidationError(`${label} must be a single-line identifier without control characters.`);
  }
  return normalized;
}

function optionalString(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function safeSourceName(value) {
  const normalized = optionalString(value);
  return normalized ? normalized.split(/[\\/]/).pop() : "unspecified";
}

function ratio(numerator, denominator) {
  return denominator ? round(numerator / denominator) : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value) {
  return Number(Number(value).toFixed(4));
}

function unique(values) {
  return [...new Set(values)];
}

function formatMetric(value) {
  return value === null || value === undefined ? "n/a" : String(value);
}

function formatSeconds(value) {
  return value === null || value === undefined ? "n/a" : `${value}s`;
}

function formatPercent(value) {
  return value === null || value === undefined ? "n/a" : `${value}%`;
}

function formatCodeList(values = []) {
  return values.length ? values.map((value) => `\`${escapeCode(value)}\``).join(", ") : "none";
}

function escapeCode(value) {
  return String(value ?? "").replaceAll("`", "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
