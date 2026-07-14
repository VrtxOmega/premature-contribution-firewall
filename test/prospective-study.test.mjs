import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ProspectiveStudyError,
  analyzeProspectiveStudy,
  freezeStudyCase,
  initializeProspectiveStudy,
  readProspectiveStudyStatus,
  recordStudyObservation,
  recordStudyConsent,
  submitStudyRating,
  withdrawStudyParticipant
} from "../src/core/prospective-study.mjs";

const NOW = "2026-07-13T21:00:00.000Z";
const OBSERVED_AT = "2026-07-13T21:05:00.000Z";
const FREEZE_AT = "2026-07-13T21:06:00.000Z";
const RATING_AT = "2026-07-13T21:10:00.000Z";
const AGGREGATE_LOCK_AT = "2026-07-28T00:00:00.000Z";

test("study initialization creates a private local store and rejects symlink roots", async () => {
  const parent = await temporaryParent();
  const root = join(parent, "study");
  try {
    const initialized = await initializeProspectiveStudy({
      root,
      protocol: studyProtocol(),
      samplingFrame: studyFrame(),
      mode: "synthetic",
      now: NOW
    });

    assert.equal(initialized.ok, true);
    assert.equal(initialized.mode, "synthetic");
    assert.match(initialized.protocolSha256, /^[a-f0-9]{64}$/);
    assert.match(initialized.samplingFrameSha256, /^[a-f0-9]{64}$/);
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal((await stat(join(root, "restricted", "participants.json"))).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, "audit", "events.jsonl"))).mode & 0o777, 0o600);

    const status = await readProspectiveStudyStatus({ root });
    assert.deepEqual(status.counts, {
      activeParticipants: 0,
      withdrawnParticipants: 0,
      frozenCases: 0,
      excludedCases: 0,
      observedIssues: 0,
      lockedRatings: 0,
      completeCases: 0
    });
    assert.equal(status.aggregateLocked, false);

    await assert.rejects(
      () => initializeProspectiveStudy({
        root: "relative-study-root",
        protocol: studyProtocol(),
        samplingFrame: studyFrame(),
        mode: "synthetic",
        now: NOW
      }),
      (error) => error instanceof ProspectiveStudyError && /absolute path/i.test(error.message)
    );

    await assert.rejects(
      () => initializeProspectiveStudy({
        root: join(parent, "production-with-clock"),
        protocol: studyProtocol(),
        samplingFrame: studyFrame(),
        mode: "production",
        now: NOW
      }),
      (error) => error instanceof ProspectiveStudyError && /caller-supplied clock/i.test(error.message)
    );

    await assert.rejects(
      () => recordStudyConsent({
        root,
        consent: {
          ...consent("future-H1", "H1", "synthetic/high", "consent-future-H1", "contact-future-H1"),
          consentedAt: "2026-07-13T22:00:00.000Z"
        },
        now: NOW
      }),
      (error) => error instanceof ProspectiveStudyError && /cannot be later than its recordedAt time/i.test(error.message)
    );

    const productionRoot = join(parent, "production-blocked");
    await initializeProspectiveStudy({
      root: productionRoot,
      protocol: studyProtocol(),
      samplingFrame: studyFrame(),
      mode: "production"
    });
    await assert.rejects(
      () => recordStudyConsent({
        root: productionRoot,
        consent: {
          ...consent(
            "production-H1",
            "H1",
            "production/high",
            "consent-production-H1",
            "contact-production-H1"
          ),
          synthetic: false
        }
      }),
      (error) => error instanceof ProspectiveStudyError && /outreachAuthorized=true/i.test(error.message)
    );

    await chmod(join(root, "restricted", "participants.json"), 0o640);
    await assert.rejects(
      () => readProspectiveStudyStatus({ root }),
      (error) => error instanceof ProspectiveStudyError && /permissions/i.test(error.message)
    );
    await chmod(join(root, "restricted", "participants.json"), 0o600);

    const real = join(parent, "real-root");
    const linked = join(parent, "linked-root");
    await mkdir(real);
    await symlink(real, linked);
    await assert.rejects(
      () => initializeProspectiveStudy({
        root: linked,
        protocol: studyProtocol(),
        samplingFrame: studyFrame(),
        mode: "synthetic",
        now: NOW
      }),
      (error) => error instanceof ProspectiveStudyError && /symbolic link/i.test(error.message)
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("synthetic workflow seals PCF output, enforces assignments, and produces privacy-safe analysis", async () => {
  const parent = await temporaryParent();
  const root = join(parent, "study");
  try {
    await initializeSyntheticStudy(root);
    await enrollSyntheticPanel(root);

    await assert.rejects(
      () => freezeStudyCase({ root, input: readyCase(), now: FREEZE_AT }),
      (error) => error instanceof ProspectiveStudyError && /prior unfrozen INCLUDE observation/i.test(error.message)
    );
    await observeSyntheticIssue(root, 101);

    await assert.rejects(
      () => observeSyntheticIssue(root, 100),
      (error) => error instanceof ProspectiveStudyError && /ascending issue-number order/i.test(error.message)
    );

    await assert.rejects(
      () => freezeStudyCase({
        root,
        input: { ...readyCase(), comments: ["later outcome must not enter the snapshot"] },
        now: FREEZE_AT
      }),
      (error) => error instanceof ProspectiveStudyError && /forbidden post-intake field 'comments'/i.test(error.message)
    );

    await assert.rejects(
      () => freezeStudyCase({ root, input: readyCase(), now: NOW }),
      (error) => error instanceof ProspectiveStudyError && /before its eligibility observation/i.test(error.message)
    );
    const first = await freezeStudyCase({ root, input: readyCase(), now: FREEZE_AT });
    await observeSyntheticIssue(root, 102);
    const second = await freezeStudyCase({ root, input: unreadyCase(), now: FREEZE_AT });
    assert.equal(first.pcf.lane, "review-now");
    assert.notEqual(second.pcf.lane, "review-now");
    assert.match(first.snapshotSha256, /^[a-f0-9]{64}$/);

    const snapshotBytes = await readFile(join(root, "restricted", "snapshots", "P48-001.json"));
    assert.equal(createHash("sha256").update(snapshotBytes).digest("hex"), first.snapshotSha256);
    const blinded = await readFile(join(root, "blinded", "cases", "P48-001.json"), "utf8");
    assert.equal(blinded.includes('"pcf"'), false);
    assert.equal(blinded.includes("ready-for-maintainer"), false);
    assert.equal(blinded.includes("contact-H1"), false);
    assert.equal(blinded.includes("consent-H1"), false);
    const sealed = JSON.parse(await readFile(join(root, "sealed", "pcf", "P48-001.json"), "utf8"));
    assert.equal(sealed.pcf.lane, "review-now");
    assert.equal(sealed.snapshotSha256, first.snapshotSha256);

    await assert.rejects(
      () => submitStudyRating({
        root,
        rating: rating("P48-001", "participant-H1", "repair", "reporter", first.snapshotSha256),
        now: NOW
      }),
      (error) => error instanceof ProspectiveStudyError && /before case freeze/i.test(error.message)
    );

    await assert.rejects(
      () => submitStudyRating({
        root,
        rating: rating("P48-001", "participant-L1", "repair", "reporter", first.snapshotSha256),
        now: RATING_AT
      }),
      (error) => error instanceof ProspectiveStudyError && /not assigned/i.test(error.message)
    );

    for (const participantId of ["participant-H1", "participant-MH1", "participant-M1"]) {
      await submitStudyRating({
        root,
        rating: rating("P48-001", participantId, "repair", "reporter", first.snapshotSha256),
        now: RATING_AT
      });
      await submitStudyRating({
        root,
        rating: rating("P48-002", participantId, "review-now", "maintainer", second.snapshotSha256),
        now: RATING_AT
      });
    }
    await assert.rejects(
      () => submitStudyRating({
        root,
        rating: rating("P48-001", "participant-H1", "repair", "reporter", first.snapshotSha256),
        now: RATING_AT
      }),
      (error) => error instanceof ProspectiveStudyError && /already locked/i.test(error.message)
    );

    await assert.rejects(
      () => analyzeProspectiveStudy({
        root,
        write: true,
        lock: true,
        now: "2026-07-20T00:00:00.000Z"
      }),
      (error) => error instanceof ProspectiveStudyError
        && /2026-07-27T21:10:00.000Z/.test(error.message)
        && /14-day cooling-off period/i.test(error.message)
    );
    const analysis = await analyzeProspectiveStudy({
      root,
      write: true,
      lock: true,
      now: AGGREGATE_LOCK_AT
    });
    assert.equal(analysis.decision.status, "INCONCLUSIVE");
    assert.equal(analysis.cases.complete, 2);
    assert.equal(analysis.errors.falseReviewNow.count, 1);
    assert.equal(analysis.errors.missedReviewNow.count, 1);
    assert.equal(analysis.contextExternalAgreement.rate, 1);
    assert.equal(analysis.perStratum.HIGH.cases, 2);
    assert.equal(analysis.validation.corpus.totalCases, 2);
    assert.equal(analysis.aggregateLock.lockedAt, AGGREGATE_LOCK_AT);
    assert.equal(analysis.aggregateLock.notBefore, "2026-07-27T21:10:00.000Z");
    assert.match(analysis.analysisSha256, /^[a-f0-9]{64}$/);
    const publicAnalysis = JSON.stringify(analysis);
    for (const forbidden of [
      "participant-H1",
      "participant-MH1",
      "participant-M1",
      "contact-H1",
      "consent-H1",
      "Webhook returns 401",
      root
    ]) {
      assert.equal(publicAnalysis.includes(forbidden), false, `analysis leaked ${forbidden}`);
    }
    assert.equal((await stat(join(root, "restricted", "corpus", "consented.jsonl"))).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, "output", "analysis.json"))).mode & 0o777, 0o600);

    await assert.rejects(
      () => submitStudyRating({
        root,
        rating: rating("P48-002", "participant-H1", "review-now", "maintainer", second.snapshotSha256),
        now: "2026-07-28T00:01:00.000Z"
      }),
      (error) => error instanceof ProspectiveStudyError && /aggregate is locked/i.test(error.message)
    );
    await assert.rejects(
      () => analyzeProspectiveStudy({ root, write: true }),
      (error) => error instanceof ProspectiveStudyError && /cannot be rewritten/i.test(error.message)
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("aggregate lock waits for the later disclosed withdrawal deadline", async () => {
  const parent = await temporaryParent();
  const root = join(parent, "study");
  try {
    await initializeSyntheticStudy(root);
    await enrollSyntheticPanel(root, "2026-08-13T00:00:00.000Z");
    await observeSyntheticIssue(root, 101);
    const first = await freezeStudyCase({ root, input: readyCase(), now: FREEZE_AT });
    await observeSyntheticIssue(root, 102);
    const second = await freezeStudyCase({ root, input: unreadyCase(), now: FREEZE_AT });
    for (const participantId of ["participant-H1", "participant-MH1", "participant-M1"]) {
      await submitStudyRating({
        root,
        rating: rating("P48-001", participantId, "repair", "reporter", first.snapshotSha256),
        now: RATING_AT
      });
      await submitStudyRating({
        root,
        rating: rating("P48-002", participantId, "review-now", "maintainer", second.snapshotSha256),
        now: RATING_AT
      });
    }
    await assert.rejects(
      () => analyzeProspectiveStudy({ root, lock: true, now: AGGREGATE_LOCK_AT }),
      (error) => error instanceof ProspectiveStudyError && /2026-08-13T00:00:00.000Z/.test(error.message)
    );
    const analysis = await analyzeProspectiveStudy({
      root,
      lock: true,
      now: "2026-08-14T00:00:00.000Z"
    });
    assert.equal(analysis.aggregateLock.notBefore, "2026-08-13T00:00:00.000Z");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("withdrawal deletes the participant rating before lock and excludes affected cases", async () => {
  const parent = await temporaryParent();
  const root = join(parent, "study");
  try {
    await initializeSyntheticStudy(root);
    await enrollSyntheticPanel(root);
    await observeSyntheticIssue(root, 101);
    const frozen = await freezeStudyCase({ root, input: readyCase(), now: FREEZE_AT });
    await submitStudyRating({
      root,
      rating: rating("P48-001", "participant-MH1", "review-now", "maintainer", frozen.snapshotSha256),
      now: RATING_AT
    });

    await assert.rejects(
      () => withdrawStudyParticipant({
        root,
        participantId: "participant-MH1",
        now: FREEZE_AT
      }),
      (error) => error instanceof ProspectiveStudyError && /before a locked rating was submitted/i.test(error.message)
    );

    const result = await withdrawStudyParticipant({
      root,
      participantId: "participant-MH1",
      now: "2026-07-13T21:30:00.000Z"
    });
    assert.equal(result.deletedRatings, 1);
    assert.deepEqual(result.excludedCases, ["P48-001"]);
    await assert.rejects(
      () => readFile(join(root, "restricted", "ratings", "P48-001", "MH1.json")),
      (error) => error?.code === "ENOENT"
    );
    const status = await readProspectiveStudyStatus({ root });
    assert.equal(status.counts.withdrawnParticipants, 1);
    assert.equal(status.counts.excludedCases, 1);
    assert.equal(status.counts.lockedRatings, 0);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("pcf study CLI initializes and reports a synthetic study without network access", async () => {
  const parent = await temporaryParent();
  const root = join(parent, "study");
  const protocolPath = join(parent, "protocol.json");
  const framePath = join(parent, "sampling-frame.json");
  await writeFile(protocolPath, `${JSON.stringify(studyProtocol(), null, 2)}\n`);
  await writeFile(framePath, `${JSON.stringify(studyFrame(), null, 2)}\n`);
  try {
    const initialized = runCli([
      "study", "init", "--root", root,
      "--protocol", protocolPath,
      "--sampling-frame", framePath,
      "--mode", "synthetic",
      "--now", NOW,
      "--format", "json"
    ]);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal(JSON.parse(initialized.stdout).mode, "synthetic");

    const status = runCli(["study", "status", "--root", root, "--format", "json"]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).counts.frozenCases, 0);
    assert.equal(status.stderr, "");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

async function initializeSyntheticStudy(root) {
  return initializeProspectiveStudy({
    root,
    protocol: studyProtocol(),
    samplingFrame: studyFrame(),
    mode: "synthetic",
    now: NOW
  });
}

async function enrollSyntheticPanel(root, withdrawalDeadline = "2026-07-14T00:00:00.000Z") {
  const records = [
    consent("participant-H1", "H1", "synthetic/high", "consent-H1", "contact-H1", withdrawalDeadline),
    consent("participant-MH1", "MH1", "synthetic/medium-high", "consent-MH1", "contact-MH1", withdrawalDeadline),
    consent("participant-M1", "M1", "synthetic/medium", "consent-M1", "contact-M1", withdrawalDeadline),
    consent("participant-L1", "L1", "synthetic/low", "consent-L1", "contact-L1", withdrawalDeadline)
  ];
  for (const record of records) await recordStudyConsent({ root, consent: record, now: NOW });
}

async function observeSyntheticIssue(root, issueNumber) {
  return recordStudyObservation({
    root,
    observation: {
      hostPosition: "H1",
      repository: "synthetic/high",
      issueNumber,
      issueCreatedAt: "2026-07-13T21:02:00.000Z",
      observedAt: OBSERVED_AT,
      disposition: "INCLUDE",
      eligibilityChecked: true,
      pcfOutputInspected: false
    },
    now: OBSERVED_AT
  });
}

function studyProtocol() {
  return {
    artifact: "pcf-prospective-study-protocol",
    studyId: "pcf-prospective-synthetic-test",
    version: "1.0.0-test",
    pcf: {
      commit: "502672cb2ca0ddeeb67088dcd2102a617370d186",
      tree: "9ff6313ab4a9959985661becc93a96a4c12398a1",
      policyId: "pcf-standard-maintainer-triage-v1"
    },
    status: {
      registration: "LOCAL_FROZEN_DRAFT",
      outreachAuthorized: false,
      participantConsentObtained: false,
      productValidityAsserted: false
    },
    design: {
      caseTarget: 2,
      repositoryTarget: 1,
      ratingsPerCase: 3
    },
    sampling: {
      eligibleAuthorAssociations: ["NONE", "CONTRIBUTOR"],
      objectiveExclusions: ["security-or-private-channel-required"]
    },
    pcfStatusMapping: {
      "ready-for-maintainer": { lane: "review-now", nextActor: "maintainer" },
      "needs-repair": { lane: "repair", nextActor: "reporter" },
      "low-review-value": { lane: "defer", nextActor: "no-action" },
      unknown: "EXCLUDE_AND_REPORT"
    },
    analysis: {
      consensus: "STRICT_MAJORITY",
      countsBeforeRates: true,
      naiveWilson95: true,
      clusterCaveatRequired: true,
      tuneOnPilotAllowed: false
    },
    consent: {
      requiredBeforeRating: true,
      withdrawalBeforeAggregateLockDeletesUnaggregatedRatings: true,
      identityStoredOutsideCorpus: true,
      opaqueRaterIds: true
    }
  };
}

function studyFrame() {
  const slots = [1, 2].map((issueOrdinal) => ({
    slotId: `P48-00${issueOrdinal}`,
    hostPosition: "H1",
    hostIndex: 0,
    hostStratum: "HIGH",
    repository: null,
    issueOrdinal,
    contextRaterPosition: "H1",
    externalRaterPositions: ["MH1", "M1"],
    status: "UNASSIGNED_NO_CONSENT"
  }));
  return {
    artifact: "pcf-prospective-sampling-frame",
    studyId: "pcf-prospective-synthetic-test",
    status: "FROZEN_UNASSIGNED_NO_CONSENT",
    hostPositionCount: 4,
    slotCount: 2,
    hostPositions: [
      hostPosition("H1", "HIGH"),
      hostPosition("MH1", "MEDIUM_HIGH"),
      hostPosition("M1", "MEDIUM"),
      hostPosition("L1", "LOW")
    ],
    slots
  };
}

function hostPosition(id, stratum) {
  return {
    hostPosition: id,
    stratum,
    repository: null,
    participantId: null,
    status: "UNASSIGNED_NO_CONSENT"
  };
}

function consent(
  participantId,
  hostPosition,
  repository,
  consentReference,
  contactReference,
  withdrawalDeadline = "2026-07-14T00:00:00.000Z"
) {
  return {
    participantId,
    hostPosition,
    repository,
    consentVersion: "1.0-test",
    consentedAt: NOW,
    withdrawalDeadline,
    attributionChoice: "NONE",
    allowedForValidation: true,
    contactReference,
    consentReference,
    adultAttested: true,
    maintainerRoleVerified: true,
    synthetic: true
  };
}

function readyCase() {
  return caseInput({
    caseId: "P48-001",
    issueOrdinal: 1,
    number: 101,
    title: "Webhook returns 401 when signature header hex is uppercase",
    body: "## Version\ncommit 7ab12cd on main\n\n## Steps to reproduce\n1. Start the server with PCF_WEBHOOK_SECRET set.\n2. Send a payload signed with uppercase SHA-256 hex.\n3. Observe the webhook response.\n\n## Expected\nThe signature verifies.\n\n## Actual\nThe server returns 401.\n\n## Logs\n```text\ninvalid webhook signature\n```\n\n## Duplicate search\nI searched existing issues for uppercase signature and webhook digest.\n\n## Technical analysis\nThe likely root cause is strict digest normalization before timing-safe comparison."
  });
}

function unreadyCase() {
  return caseInput({
    caseId: "P48-002",
    issueOrdinal: 2,
    number: 102,
    title: "Bug",
    body: "The app is broken. Please fix it quickly."
  });
}

function caseInput({ caseId, issueOrdinal, number, title, body }) {
  return {
    caseId,
    hostPosition: "H1",
    repository: "synthetic/high",
    issueOrdinal,
    issue: {
      number,
      title,
      body,
      authorAssociation: "NONE",
      labels: ["bug"],
      createdAt: "2026-07-13T21:02:00.000Z",
      language: "en",
      humanAuthored: true,
      labelsAtCreationVerified: true,
      securitySensitive: false,
      privateDataDetected: false
    },
    policy: {
      id: "pcf-standard-maintainer-triage-v1",
      snapshot: "policy-v1@abc123",
      excerpt: "Use the issue template and include reproduction evidence.",
      files: [{ path: "CONTRIBUTING.md", content: "Include reproduction evidence for bug reports." }]
    }
  };
}

function rating(caseId, participantId, lane, nextActor, snapshotSha256) {
  return {
    caseId,
    participantId,
    lane,
    nextActor,
    processCode: "CLEAR",
    durationSeconds: 60,
    snapshotSha256
  };
}

async function temporaryParent() {
  const path = join(tmpdir(), `pcf-study-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(path, { recursive: true });
  return path;
}

function runCli(args) {
  return spawnSync(process.execPath, ["src/cli.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      http_proxy: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
      HTTP_PROXY: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9"
    }
  });
}
