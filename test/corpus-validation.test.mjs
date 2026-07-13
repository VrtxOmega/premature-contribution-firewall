import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CorpusValidationError,
  renderCorpusValidationMarkdown,
  renderCorpusValidationSummary,
  validateCorpusText
} from "../src/core/corpus-validation.mjs";

test("JSONL validation measures lanes, false review-now, agreement, calibration, and timing", () => {
  const result = validateCorpusText(validJsonl(), {
    inputFormat: "jsonl",
    sourceName: "consented.jsonl"
  });

  assert.equal(result.ok, true);
  assert.equal(result.artifact, "pcf-corpus-validation");
  assert.equal(result.corpus.totalCases, 5);
  assert.equal(result.corpus.scoredCases, 4);
  assert.equal(result.corpus.ambiguousCases, 1);
  assert.equal(result.corpus.totalRatings, 10);
  assert.equal(result.confusionMatrix["review-now"]["review-now"], 1);
  assert.equal(result.confusionMatrix["review-now"].repair, 1);
  assert.equal(result.confusionMatrix.defer["review-now"], 1);
  assert.equal(result.lanes["review-now"].precision, 0.5);
  assert.equal(result.lanes["review-now"].recall, 0.5);
  assert.equal(result.lanes.repair.precision, 1);
  assert.equal(result.lanes.repair.recall, 0.5);
  assert.equal(result.falseReviewNow.count, 1);
  assert.deepEqual(result.falseReviewNow.cases, [{
    id: "case-2",
    repository: "owner/repo",
    policyId: "policy-v1",
    caseRef: "alpha-2",
    consensusLane: "repair",
    pcfScore: 84
  }]);
  assert.equal(result.agreement.eligibleCases, 5);
  assert.equal(result.agreement.pairwiseAgreement, 0.8);
  assert.equal(result.agreement.nominalKappa, 0.6);
  assert.equal(result.calibration.find((bin) => bin.id === "80-100").count, 2);
  assert.equal(result.timing.pairedCases, 2);
  assert.equal(result.timing.meanSecondsSaved, 34);
  assert.equal(result.timing.medianPercentSaved, 30);
  assert.deepEqual(result.provenance.datasets, ["alpha"]);
  assert.deepEqual(result.provenance.policySnapshots, ["policy-v1@abc123"]);
  assert.match(result.corpus.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.decision.status, "INCONCLUSIVE");
});

test("CSV validation groups one row per rater into consented cases", () => {
  const result = validateCorpusText(validCsv(), {
    inputFormat: "csv",
    sourceName: "consented.csv"
  });

  assert.equal(result.corpus.totalCases, 2);
  assert.equal(result.corpus.totalRatings, 4);
  assert.equal(result.corpus.scoredCases, 2);
  assert.equal(result.falseReviewNow.count, 1);
  assert.equal(result.agreement.pairwiseAgreement, 1);
  assert.deepEqual(result.provenance.datasets, ["csv-alpha"]);
});

test("validation fails closed on consent, privacy, schema, timing, and duplicate raters", () => {
  const missingConsent = caseRecord({ id: "missing-consent" });
  delete missingConsent.consent;
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(missingConsent)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /consent/i.test(error.message)
  );

  const rawContent = caseRecord({ id: "raw-content", body: "private issue body" });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(rawContent)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /forbidden raw-content field 'body'/i.test(error.message)
  );

  const unknownContent = caseRecord({ id: "unknown-content", description: "undeclared private material" });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(unknownContent)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /unsupported field.*description/i.test(error.message)
  );

  const invalidTiming = caseRecord({
    id: "invalid-timing",
    timing: { baselineSeconds: "unknown", pcfSeconds: "unknown" }
  });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(invalidTiming)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /timing requires/i.test(error.message)
  );

  const duplicateRater = caseRecord({
    id: "duplicate-rater",
    ratings: [rating("maintainer-a", "repair"), rating("maintainer-a", "repair")]
  });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(duplicateRater)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /duplicate rater/i.test(error.message)
  );

  const tooManyRatings = caseRecord({
    id: "too-many-ratings",
    ratings: Array.from({ length: 51 }, (_, index) => rating(`rater-${index}`, "repair"))
  });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(tooManyRatings)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /50 rating limit/i.test(error.message)
  );

  const multilineReference = caseRecord({
    id: "multiline-reference",
    provenance: provenance("line-one\nline-two")
  });
  assert.throws(
    () => validateCorpusText(`${JSON.stringify(multilineReference)}\n`, { inputFormat: "jsonl" }),
    (error) => error instanceof CorpusValidationError && /single-line identifier/i.test(error.message)
  );

  const csvWithExtraColumn = validCsv().replace("pcfSeconds\n", "pcfSeconds,body\n");
  assert.throws(
    () => validateCorpusText(csvWithExtraColumn, { inputFormat: "csv" }),
    (error) => error instanceof CorpusValidationError && /unsupported column.*body/i.test(error.message)
  );
});

test("strict-majority ties are excluded explicitly and identical bytes replay deterministically", () => {
  const text = `${JSON.stringify(caseRecord({
    id: "tie-case",
    ratings: [rating("maintainer-a", "review-now"), rating("maintainer-b", "repair")]
  }))}\n`;
  const first = validateCorpusText(text, { inputFormat: "jsonl", sourceName: "stdin" });
  const second = validateCorpusText(text, { inputFormat: "jsonl", sourceName: "stdin" });

  assert.equal(first.corpus.scoredCases, 0);
  assert.deepEqual(first.exclusions, [{ id: "tie-case", reason: "NO_STRICT_MAJORITY" }]);
  assert.deepEqual(first, second);
});

test("receipts are concise, aggregate, and omit rater identities and local paths", () => {
  const result = validateCorpusText(validJsonl(), { inputFormat: "jsonl", sourceName: "consented.jsonl" });
  const markdown = renderCorpusValidationMarkdown(result);
  const summary = renderCorpusValidationSummary(result);

  assert.match(markdown, /False `review-now`/);
  assert.match(markdown, /Inter-rater agreement/);
  assert.match(markdown, /INCONCLUSIVE/);
  assert.match(summary, /False review-now: 1/);
  assert.equal(markdown.includes("maintainer-a"), false);
  assert.equal(markdown.includes("private issue body"), false);
  assert.equal(markdown.includes("/home/"), false);
});

test("CLI emits JSON and Markdown offline and returns a concise validation error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-corpus-validation-"));
  const validPath = join(dir, "consented.jsonl");
  const invalidPath = join(dir, "unconsented.jsonl");
  await writeFile(validPath, validJsonl());
  const unconsented = caseRecord({ id: "unconsented" });
  delete unconsented.consent;
  await writeFile(invalidPath, `${JSON.stringify(unconsented)}\n`);

  try {
    const jsonRun = runCli(["validate-corpus", validPath, "--format", "json"]);
    assert.equal(jsonRun.status, 0, jsonRun.stderr);
    const parsed = JSON.parse(jsonRun.stdout);
    assert.equal(parsed.corpus.totalCases, 5);
    assert.equal(parsed.decision.status, "INCONCLUSIVE");

    const markdownRun = runCli(["validate-corpus", validPath, "--format", "markdown"]);
    assert.equal(markdownRun.status, 0, markdownRun.stderr);
    assert.match(markdownRun.stdout, /# PCF Corpus Validation Receipt/);

    const invalidRun = runCli(["validate-corpus", invalidPath]);
    assert.equal(invalidRun.status, 1);
    assert.match(invalidRun.stderr, /^PCF corpus validation failed:/);
    assert.equal(invalidRun.stderr.includes(" at "), false);

    const missingRun = runCli(["validate-corpus", join(dir, "missing.jsonl")]);
    assert.equal(missingRun.status, 1);
    assert.match(missingRun.stderr, /^PCF corpus validation failed: Cannot read corpus file 'missing.jsonl'\./);
    assert.equal(missingRun.stderr.includes("ENOENT"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function validJsonl() {
  return [
    caseRecord({
      id: "case-1",
      pcf: { lane: "review-now", score: 92, nextActor: "maintainer" },
      ratings: [rating("maintainer-a", "review-now"), rating("maintainer-b", "review-now")],
      timing: { baselineSeconds: 120, pcfSeconds: 72 },
      provenance: provenance("alpha-1")
    }),
    caseRecord({
      id: "case-2",
      pcf: { lane: "review-now", score: 84, nextActor: "maintainer" },
      ratings: [rating("maintainer-a", "repair"), rating("maintainer-b", "repair")],
      timing: { baselineSeconds: 100, pcfSeconds: 80 },
      provenance: provenance("alpha-2")
    }),
    caseRecord({
      id: "case-3",
      pcf: { lane: "repair", score: 65, nextActor: "reporter" },
      ratings: [rating("maintainer-a", "repair"), rating("maintainer-b", "repair")],
      provenance: provenance("alpha-3")
    }),
    caseRecord({
      id: "case-4",
      pcf: { lane: "defer", score: 40, nextActor: "maintainer" },
      ratings: [rating("maintainer-a", "review-now"), rating("maintainer-b", "review-now")],
      provenance: provenance("alpha-4")
    }),
    caseRecord({
      id: "case-5",
      pcf: { lane: "repair", score: 58, nextActor: "reporter" },
      ratings: [rating("maintainer-a", "review-now"), rating("maintainer-b", "repair")],
      provenance: provenance("alpha-5")
    })
  ].map((item) => JSON.stringify(item)).join("\n") + "\n";
}

function validCsv() {
  return [
    "id,repository,policyId,dataset,caseRef,policySnapshot,consentReference,consentAllowed,pcfLane,pcfScore,pcfNextActor,raterId,raterLane,raterNextActor,baselineSeconds,pcfSeconds",
    "csv-1,owner/repo,policy-v1,csv-alpha,csv-1,policy-v1@abc,consent-csv,true,review-now,90,maintainer,maintainer-a,review-now,maintainer,100,70",
    "csv-1,owner/repo,policy-v1,csv-alpha,csv-1,policy-v1@abc,consent-csv,true,review-now,90,maintainer,maintainer-b,review-now,maintainer,100,70",
    "csv-2,owner/repo,policy-v1,csv-alpha,csv-2,policy-v1@abc,consent-csv,true,review-now,82,maintainer,maintainer-a,repair,reporter,,",
    "csv-2,owner/repo,policy-v1,csv-alpha,csv-2,policy-v1@abc,consent-csv,true,review-now,82,maintainer,maintainer-b,repair,reporter,,"
  ].join("\n") + "\n";
}

function caseRecord(overrides = {}) {
  return {
    id: "case",
    repository: "owner/repo",
    policyId: "policy-v1",
    consent: { allowedForValidation: true, reference: "consent-alpha" },
    pcf: { lane: "repair", score: 60, nextActor: "reporter" },
    ratings: [rating("maintainer-a", "repair")],
    provenance: provenance("alpha-case"),
    ...overrides
  };
}

function rating(raterId, lane, nextActor = lane === "repair" ? "reporter" : "maintainer") {
  return { raterId, lane, nextActor };
}

function provenance(caseRef) {
  return {
    dataset: "alpha",
    caseRef,
    policySnapshot: "policy-v1@abc123",
    collectedAt: "2026-07-13T12:00:00Z"
  };
}

function runCli(args) {
  return spawnSync(process.execPath, ["src/cli.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, http_proxy: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9" }
  });
}
