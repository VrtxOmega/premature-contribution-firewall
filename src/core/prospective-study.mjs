import { createHash, randomBytes } from "node:crypto";
import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { evaluateContribution } from "./evaluator.mjs";
import { validateCorpusText } from "./corpus-validation.mjs";

export const PROSPECTIVE_STUDY_VERSION = "2026.07.13";

const LANES = Object.freeze(["review-now", "repair", "defer"]);
const NEXT_ACTOR = Object.freeze({
  "review-now": "maintainer",
  repair: "reporter",
  defer: "no-action"
});
const PROCESS_CODES = new Set([
  "CLEAR",
  "MISSING_PROJECT_CONTEXT",
  "LANE_BOUNDARY_AMBIGUOUS",
  "SNAPSHOT_INTEGRITY_CONCERN",
  "SECURITY_OR_PRIVACY_CONCERN",
  "CONFLICT_OF_INTEREST",
  "OTHER_NO_QUOTE"
]);
const FORBIDDEN_POST_INTAKE_FIELDS = new Set([
  "assignment",
  "closure",
  "comments",
  "eventualOutcome",
  "laterLabels",
  "linkedPatches",
  "reactions"
]);
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const AGGREGATE_COOLING_OFF_MS = 14 * 24 * 60 * 60 * 1000;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@:+-]{0,255}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export class ProspectiveStudyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProspectiveStudyError";
  }
}

export async function initializeProspectiveStudy({
  root,
  protocol,
  samplingFrame,
  mode = "production",
  now = ""
} = {}) {
  const paths = studyPaths(root);
  await assertNoSymlinkComponents(paths.root);
  if (!protocol || typeof protocol !== "object" || Array.isArray(protocol)) {
    throw new ProspectiveStudyError("Study protocol must be an object.");
  }
  if (!samplingFrame || typeof samplingFrame !== "object" || Array.isArray(samplingFrame)) {
    throw new ProspectiveStudyError("Sampling frame must be an object.");
  }
  if (!["production", "synthetic"].includes(mode)) {
    throw new ProspectiveStudyError("Study mode must be production or synthetic.");
  }
  if (mode === "production" && now) {
    throw new ProspectiveStudyError("Production study initialization does not accept a caller-supplied clock.");
  }
  const studyId = requiredIdentifier(protocol.studyId, "Protocol studyId");
  if (samplingFrame.studyId !== studyId) {
    throw new ProspectiveStudyError("Protocol and sampling frame studyId values must match.");
  }
  validateProtocol(protocol);
  validateSamplingFrame(samplingFrame);
  if (Number(protocol.design.caseTarget) !== Number(samplingFrame.slotCount)) {
    throw new ProspectiveStudyError("Protocol caseTarget must equal the frozen sampling-frame slotCount.");
  }
  if (await pathExists(paths.study)) {
    throw new ProspectiveStudyError("Study root is already initialized.");
  }

  for (const directory of paths.directories) {
    await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
    await chmod(directory, DIRECTORY_MODE);
  }

  const initializedAt = normalizedTime(now);
  const protocolBytes = canonicalJson(protocol);
  const frameBytes = canonicalJson(samplingFrame);
  const state = {
    artifact: "pcf-prospective-study-state",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId,
    mode,
    initializedAt,
    protocolSha256: sha256(protocolBytes),
    samplingFrameSha256: sha256(frameBytes),
    targetCases: positiveInteger(protocol.design?.caseTarget, "Protocol design.caseTarget"),
    ratingsPerCase: positiveInteger(protocol.design?.ratingsPerCase, "Protocol design.ratingsPerCase"),
    aggregateLockedAt: null
  };

  await writePrivateFile(paths.protocol, protocolBytes, { exclusive: true });
  await writePrivateFile(paths.frame, frameBytes, { exclusive: true });
  await writePrivateJson(paths.participants, { participants: [] }, { exclusive: true });
  await writePrivateJson(paths.observations, { observations: [] }, { exclusive: true });
  await writePrivateJson(paths.cases, { cases: [] }, { exclusive: true });
  await writePrivateJson(paths.study, state, { exclusive: true });
  await writePrivateFile(paths.audit, "", { exclusive: true });
  await appendAudit(paths, {
    event: "STUDY_INITIALIZED",
    at: initializedAt,
    studyId,
    mode
  });

  return {
    ok: true,
    artifact: "pcf-prospective-study-initialization",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId,
    mode,
    protocolSha256: state.protocolSha256,
    samplingFrameSha256: state.samplingFrameSha256,
    status: "LOCAL_PRIVATE_STORE_READY",
    decision: "INCONCLUSIVE",
    nonClaims: [
      "Initialization does not authorize outreach or participant enrollment.",
      "Synthetic mode accepts only records explicitly marked synthetic.",
      "Filesystem permissions do not protect data from the same operating-system account."
    ]
  };
}

export async function recordStudyConsent({ root, consent, now = "" } = {}) {
  const loaded = await loadStudy(root);
  assertUnlocked(loaded.state);
  assertPlainObject(consent, "Consent record");
  assertAllowedKeys(consent, [
    "participantId",
    "hostPosition",
    "repository",
    "consentVersion",
    "consentedAt",
    "withdrawalDeadline",
    "attributionChoice",
    "allowedForValidation",
    "contactReference",
    "consentReference",
    "adultAttested",
    "maintainerRoleVerified",
    "synthetic"
  ], "Consent record");
  assertProductionActivated(loaded, "consent recording");
  if (loaded.state.mode === "synthetic" && consent.synthetic !== true) {
    throw new ProspectiveStudyError("Synthetic studies accept only consent records marked synthetic=true.");
  }
  const participantId = requiredIdentifier(consent.participantId, "Consent participantId");
  const hostPosition = requiredIdentifier(consent.hostPosition, "Consent hostPosition");
  const repository = requiredRepository(consent.repository, "Consent repository");
  const knownPosition = loaded.frame.hostPositions.find((item) => item.hostPosition === hostPosition);
  if (!knownPosition) throw new ProspectiveStudyError(`Unknown host position '${hostPosition}'.`);
  if (consent.allowedForValidation !== true || consent.adultAttested !== true || consent.maintainerRoleVerified !== true) {
    throw new ProspectiveStudyError("Consent requires validation permission, adult attestation, and verified maintainer role.");
  }
  const participants = loaded.participants.participants;
  if (participants.some((item) => item.participantId === participantId)) {
    throw new ProspectiveStudyError(`Participant '${participantId}' is already recorded.`);
  }
  if (participants.some((item) => item.hostPosition === hostPosition && item.status === "ACTIVE")) {
    throw new ProspectiveStudyError(`Host position '${hostPosition}' already has an active participant.`);
  }
  if (participants.some((item) => item.repository === repository && item.status === "ACTIVE")) {
    throw new ProspectiveStudyError(`Repository '${repository}' already has an active participant.`);
  }

  const consentedAt = normalizedTime(consent.consentedAt);
  const withdrawalDeadline = normalizedTime(consent.withdrawalDeadline);
  const recordedAt = operationTime(loaded.state, now);
  if (new Date(withdrawalDeadline).getTime() <= new Date(consentedAt).getTime()) {
    throw new ProspectiveStudyError("Consent withdrawalDeadline must be after consentedAt.");
  }
  if (new Date(consentedAt).getTime() > new Date(recordedAt).getTime()) {
    throw new ProspectiveStudyError("Consent consentedAt cannot be later than its recordedAt time.");
  }
  if (new Date(withdrawalDeadline).getTime() <= new Date(recordedAt).getTime()) {
    throw new ProspectiveStudyError("Consent withdrawalDeadline must remain open after its recordedAt time.");
  }
  if (loaded.state.mode === "production" && consent.synthetic === true) {
    throw new ProspectiveStudyError("Production studies cannot record synthetic consent records.");
  }
  const record = {
    participantId,
    hostPosition,
    repository,
    consentVersion: requiredString(consent.consentVersion, "Consent version"),
    consentedAt,
    withdrawalDeadline,
    attributionChoice: requiredString(consent.attributionChoice, "Consent attribution choice"),
    allowedForValidation: true,
    contactReference: requiredIdentifier(consent.contactReference, "Consent contactReference"),
    consentReference: requiredIdentifier(consent.consentReference, "Consent consentReference"),
    adultAttested: true,
    maintainerRoleVerified: true,
    synthetic: loaded.state.mode === "synthetic",
    status: "ACTIVE",
    recordedAt,
    withdrawnAt: null
  };
  participants.push(record);
  participants.sort((left, right) => left.hostPosition.localeCompare(right.hostPosition));
  await writePrivateJson(loaded.paths.participants, loaded.participants);
  await appendAudit(loaded.paths, {
    event: "CONSENT_RECORDED",
    at: record.recordedAt,
    hostPosition,
    repositoryHash: sha256(repository)
  });
  return {
    ok: true,
    artifact: "pcf-prospective-consent-state",
    participantId,
    hostPosition,
    status: "ACTIVE",
    synthetic: record.synthetic
  };
}

export async function recordStudyObservation({ root, observation, now = "" } = {}) {
  const loaded = await loadStudy(root);
  assertUnlocked(loaded.state);
  assertProductionActivated(loaded, "issue observation");
  assertPlainObject(observation, "Observation");
  assertAllowedKeys(observation, [
    "hostPosition",
    "repository",
    "issueNumber",
    "issueCreatedAt",
    "observedAt",
    "disposition",
    "exclusionCode",
    "eligibilityChecked",
    "pcfOutputInspected"
  ], "Observation");
  const hostPosition = requiredIdentifier(observation.hostPosition, "Observation hostPosition");
  const repository = requiredRepository(observation.repository, "Observation repository");
  const issueNumber = positiveInteger(observation.issueNumber, "Observation issueNumber");
  const issueCreatedAt = normalizedTime(observation.issueCreatedAt);
  const contextParticipant = loaded.participants.participants.find((item) => (
    item.hostPosition === hostPosition && item.repository === repository && item.status === "ACTIVE"
  ));
  if (!contextParticipant) {
    throw new ProspectiveStudyError("Observation requires an active consented context participant for the repository.");
  }
  if (observation.eligibilityChecked !== true || observation.pcfOutputInspected !== false) {
    throw new ProspectiveStudyError("Observation must lock eligibility before PCF output is inspected.");
  }
  const observedAt = normalizedTime(observation.observedAt || now);
  if (new Date(issueCreatedAt).getTime() < new Date(contextParticipant.recordedAt).getTime()) {
    throw new ProspectiveStudyError("Observed issue was created before the repository's consent activation time.");
  }
  if (new Date(issueCreatedAt).getTime() > new Date(observedAt).getTime()) {
    throw new ProspectiveStudyError("Observation cannot predate the issue creation time.");
  }
  if (new Date(observedAt).getTime() < new Date(contextParticipant.consentedAt).getTime()) {
    throw new ProspectiveStudyError("Observation cannot predate the context participant's consent.");
  }
  const disposition = requiredString(observation.disposition, "Observation disposition").toUpperCase();
  if (!["INCLUDE", "EXCLUDE"].includes(disposition)) {
    throw new ProspectiveStudyError("Observation disposition must be INCLUDE or EXCLUDE.");
  }
  const existing = loaded.observations.observations.filter((item) => (
    item.hostPosition === hostPosition && item.repository === repository
  ));
  const highestObserved = existing.reduce((maximum, item) => Math.max(maximum, item.issueNumber), 0);
  if (issueNumber <= highestObserved) {
    throw new ProspectiveStudyError("Repository issue observations must be recorded once in strictly ascending issue-number order.");
  }
  let exclusionCode = null;
  let includeOrdinal = null;
  if (disposition === "EXCLUDE") {
    exclusionCode = requiredString(observation.exclusionCode, "Observation exclusionCode");
    const allowedCodes = loaded.protocol.sampling?.objectiveExclusions || [];
    if (!allowedCodes.includes(exclusionCode)) {
      throw new ProspectiveStudyError(`Observation exclusionCode '${exclusionCode}' is not in the frozen protocol.`);
    }
  } else {
    if (observation.exclusionCode) throw new ProspectiveStudyError("Included observations cannot declare an exclusionCode.");
    includeOrdinal = existing.filter((item) => item.disposition === "INCLUDE").length + 1;
    const availableSlots = loaded.frame.slots.filter((slot) => slot.hostPosition === hostPosition).length;
    if (includeOrdinal > availableSlots) {
      throw new ProspectiveStudyError(`Host position '${hostPosition}' has already filled every frozen case slot.`);
    }
  }
  const recordedAt = operationTime(loaded.state, now);
  if (new Date(observedAt).getTime() > new Date(recordedAt).getTime()) {
    throw new ProspectiveStudyError("Observation observedAt cannot be later than its recordedAt time.");
  }
  loaded.observations.observations.push({
    hostPosition,
    repository,
    issueNumber,
    issueCreatedAt,
    observedAt,
    disposition,
    exclusionCode,
    includeOrdinal,
    frozenCaseId: null,
    eligibilityChecked: true,
    pcfOutputInspected: false,
    recordedAt
  });
  await writePrivateJson(loaded.paths.observations, loaded.observations);
  await appendAudit(loaded.paths, {
    event: "ISSUE_OBSERVED",
    at: recordedAt,
    hostPosition,
    repositoryHash: sha256(repository),
    issueNumber,
    issueCreatedAt,
    disposition,
    exclusionCode,
    includeOrdinal
  });
  return {
    ok: true,
    artifact: "pcf-prospective-issue-observation",
    hostPosition,
    issueNumber,
    disposition,
    exclusionCode,
    includeOrdinal,
    status: disposition === "INCLUDE" ? "INCLUDED_PENDING_FREEZE" : "EXCLUDED_PRE_PCF"
  };
}

export async function freezeStudyCase({ root, input, now = "" } = {}) {
  const loaded = await loadStudy(root);
  assertUnlocked(loaded.state);
  assertProductionActivated(loaded, "case collection");
  assertPlainObject(input, "Case input");
  for (const field of Object.keys(input)) {
    if (FORBIDDEN_POST_INTAKE_FIELDS.has(field)) {
      throw new ProspectiveStudyError(`Case input contains forbidden post-intake field '${field}'.`);
    }
  }
  assertAllowedKeys(input, ["caseId", "hostPosition", "repository", "issueOrdinal", "issue", "policy"], "Case input");
  const caseId = requiredIdentifier(input.caseId, "Case id");
  const hostPosition = requiredIdentifier(input.hostPosition, "Case hostPosition");
  const repository = requiredRepository(input.repository, "Case repository");
  const issueOrdinal = positiveInteger(input.issueOrdinal, "Case issueOrdinal");
  const slot = loaded.frame.slots.find((item) => item.slotId === caseId);
  if (!slot) throw new ProspectiveStudyError(`Case '${caseId}' is not present in the frozen sampling frame.`);
  if (slot.hostPosition !== hostPosition || Number(slot.issueOrdinal) !== issueOrdinal) {
    throw new ProspectiveStudyError(`Case '${caseId}' does not match its frozen host position and issue ordinal.`);
  }
  if (loaded.cases.cases.some((item) => item.caseId === caseId)) {
    throw new ProspectiveStudyError(`Case '${caseId}' is already frozen.`);
  }
  const observation = loaded.observations.observations.find((item) => (
    item.hostPosition === hostPosition
    && item.repository === repository
    && item.issueNumber === Number(input.issue?.number)
  ));
  if (!observation || observation.disposition !== "INCLUDE" || observation.frozenCaseId) {
    throw new ProspectiveStudyError(`Case '${caseId}' requires a prior unfrozen INCLUDE observation recorded before PCF evaluation.`);
  }
  if (observation.includeOrdinal !== issueOrdinal) {
    throw new ProspectiveStudyError(`Case '${caseId}' does not match the observation ledger's next included issue ordinal.`);
  }
  if (normalizedTime(input.issue?.createdAt) !== observation.issueCreatedAt) {
    throw new ProspectiveStudyError(`Case '${caseId}' creation time does not match its prior observation.`);
  }
  const frozenAt = operationTime(loaded.state, now);
  if (new Date(frozenAt).getTime() < new Date(observation.recordedAt).getTime()) {
    throw new ProspectiveStudyError(`Case '${caseId}' cannot be frozen before its eligibility observation.`);
  }

  const assignedPositions = expectedPositions(slot);
  const assignedParticipants = assignedPositions.map((position) => {
    const participant = loaded.participants.participants.find((item) => item.hostPosition === position && item.status === "ACTIVE");
    if (!participant) throw new ProspectiveStudyError(`Case '${caseId}' requires active consent for assigned position '${position}'.`);
    return participant;
  });
  const contextParticipant = assignedParticipants.find((item) => item.hostPosition === slot.contextRaterPosition);
  if (!contextParticipant || contextParticipant.repository !== repository) {
    throw new ProspectiveStudyError(`Case '${caseId}' repository does not match the consented context participant.`);
  }
  for (const participant of assignedParticipants.filter((item) => item.hostPosition !== slot.contextRaterPosition)) {
    if (participant.repository === repository) {
      throw new ProspectiveStudyError(`Case '${caseId}' has an external self-rating assignment.`);
    }
  }

  const snapshot = canonicalSnapshot({ loaded, input, slot, caseId, hostPosition, repository, issueOrdinal });
  const snapshotBytes = canonicalJson(snapshot);
  if (Buffer.byteLength(snapshotBytes, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new ProspectiveStudyError("Canonical snapshot exceeds the 2 MiB local study limit.");
  }
  const snapshotSha256 = sha256(snapshotBytes);
  const evaluation = evaluateContribution({
    kind: "issue",
    title: snapshot.issue.title,
    body: snapshot.issue.body,
    authorAssociation: snapshot.issue.authorAssociation,
    labels: snapshot.issue.labels,
    repository: snapshot.repository,
    number: snapshot.issue.number,
    createdAt: snapshot.issue.createdAt,
    repositoryFiles: snapshot.policy.files
  });
  const mapping = loaded.protocol.pcfStatusMapping?.[evaluation.status];
  if (!mapping || !LANES.includes(mapping.lane) || NEXT_ACTOR[mapping.lane] !== mapping.nextActor) {
    throw new ProspectiveStudyError(`PCF status '${evaluation.status}' has no valid frozen lane mapping.`);
  }
  const pcfSeal = {
    artifact: "pcf-prospective-sealed-decision",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId: loaded.state.studyId,
    caseId,
    snapshotSha256,
    policyId: snapshot.policy.id,
    policySnapshot: snapshot.policy.snapshot,
    pcfCommit: loaded.protocol.pcf?.commit || "",
    pcfTree: loaded.protocol.pcf?.tree || "",
    pcf: {
      status: evaluation.status,
      lane: mapping.lane,
      score: evaluation.score,
      nextActor: mapping.nextActor,
      labels: Array.isArray(evaluation.labels) ? evaluation.labels : [],
      checks: Array.isArray(evaluation.checks)
        ? evaluation.checks.map((check) => ({ id: check.id, status: check.status, label: check.label || "" }))
        : []
    }
  };
  const blinded = {
    artifact: "pcf-prospective-blinded-case",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId: loaded.state.studyId,
    caseId,
    snapshotSha256,
    hostPosition,
    stratum: slot.hostStratum,
    repository,
    issueOrdinal,
    issue: snapshot.issue,
    policy: {
      id: snapshot.policy.id,
      snapshot: snapshot.policy.snapshot,
      excerpt: snapshot.policy.excerpt,
      files: snapshot.policy.files
    },
    instructions: {
      pcfOutputHidden: true,
      peerRatingsHidden: true,
      liveIssueLookupAllowed: false
    }
  };
  const blindedBytes = canonicalJson(blinded);
  const sealBytes = canonicalJson(pcfSeal);
  const snapshotPath = join(loaded.paths.snapshots, `${caseId}.json`);
  const blindedPath = join(loaded.paths.blindedCases, `${caseId}.json`);
  const sealPath = join(loaded.paths.pcfSeals, `${caseId}.json`);
  const written = [];
  try {
    await writePrivateFile(snapshotPath, snapshotBytes, { exclusive: true });
    written.push(snapshotPath);
    await writePrivateFile(blindedPath, blindedBytes, { exclusive: true });
    written.push(blindedPath);
    await writePrivateFile(sealPath, sealBytes, { exclusive: true });
    written.push(sealPath);
    loaded.cases.cases.push({
      caseId,
      hostPosition,
      stratum: slot.hostStratum,
      repository,
      issueOrdinal,
      snapshotSha256,
      blindedSha256: sha256(blindedBytes),
      pcfSealSha256: sha256(sealBytes),
      expectedRaterPositions: assignedPositions,
      status: "FROZEN_RATING_OPEN",
      exclusionReason: null,
      frozenAt
    });
    loaded.cases.cases.sort((left, right) => left.caseId.localeCompare(right.caseId));
    observation.frozenCaseId = caseId;
    await writePrivateJson(loaded.paths.cases, loaded.cases);
    await writePrivateJson(loaded.paths.observations, loaded.observations);
    await appendAudit(loaded.paths, {
      event: "CASE_FROZEN",
      at: frozenAt,
      caseId,
      snapshotSha256,
      pcfSealSha256: sha256(sealBytes)
    });
  } catch (error) {
    for (const path of written) await rm(path, { force: true });
    throw error;
  }
  return {
    ok: true,
    artifact: "pcf-prospective-case-freeze",
    caseId,
    snapshotSha256,
    blindedSha256: sha256(blindedBytes),
    pcfSealSha256: sha256(sealBytes),
    pcf: {
      status: evaluation.status,
      lane: mapping.lane,
      score: evaluation.score,
      nextActor: mapping.nextActor
    },
    status: "FROZEN_RATING_OPEN"
  };
}

export async function submitStudyRating({ root, rating, now = "" } = {}) {
  const loaded = await loadStudy(root);
  assertUnlocked(loaded.state);
  assertPlainObject(rating, "Rating");
  assertAllowedKeys(rating, [
    "caseId",
    "participantId",
    "lane",
    "nextActor",
    "abstainReason",
    "processCode",
    "durationSeconds",
    "snapshotSha256"
  ], "Rating");
  const caseId = requiredIdentifier(rating.caseId, "Rating caseId");
  const participantId = requiredIdentifier(rating.participantId, "Rating participantId");
  const item = loaded.cases.cases.find((candidate) => candidate.caseId === caseId);
  if (!item) throw new ProspectiveStudyError(`Unknown case '${caseId}'.`);
  if (item.status !== "FROZEN_RATING_OPEN") {
    throw new ProspectiveStudyError(`Case '${caseId}' is not open for ratings.`);
  }
  if (rating.snapshotSha256 !== item.snapshotSha256) {
    throw new ProspectiveStudyError(`Rating snapshot hash does not match case '${caseId}'.`);
  }
  const participant = loaded.participants.participants.find((candidate) => candidate.participantId === participantId);
  if (!participant || participant.status !== "ACTIVE") {
    throw new ProspectiveStudyError(`Participant '${participantId}' does not have active consent.`);
  }
  const slot = loaded.frame.slots.find((candidate) => candidate.slotId === caseId);
  const positions = expectedPositions(slot);
  if (!positions.includes(participant.hostPosition)) {
    throw new ProspectiveStudyError(`Participant '${participantId}' is not assigned to case '${caseId}'.`);
  }
  const role = participant.hostPosition === slot.contextRaterPosition ? "context" : "external";
  if (role === "external" && participant.repository === item.repository) {
    throw new ProspectiveStudyError(`Participant '${participantId}' would be an external self-rater.`);
  }
  const processCode = requiredString(rating.processCode, "Rating processCode");
  if (!PROCESS_CODES.has(processCode)) {
    throw new ProspectiveStudyError(`Unsupported rating processCode '${processCode}'.`);
  }
  const abstaining = Boolean(rating.abstainReason);
  const lane = abstaining ? null : requiredLane(rating.lane, "Rating lane");
  const nextActor = abstaining ? null : requiredString(rating.nextActor, "Rating nextActor");
  if (!abstaining && NEXT_ACTOR[lane] !== nextActor) {
    throw new ProspectiveStudyError(`Rating lane '${lane}' requires nextActor '${NEXT_ACTOR[lane]}'.`);
  }
  if (abstaining && (rating.lane || rating.nextActor)) {
    throw new ProspectiveStudyError("An abstention cannot also declare a lane or next actor.");
  }
  const durationSeconds = optionalNonNegativeNumber(rating.durationSeconds, "Rating durationSeconds");
  const lockedAt = operationTime(loaded.state, now);
  if (new Date(lockedAt).getTime() < new Date(item.frozenAt).getTime()) {
    throw new ProspectiveStudyError(`Rating for case '${caseId}' cannot be locked before case freeze.`);
  }
  const record = {
    artifact: "pcf-prospective-locked-rating",
    version: PROSPECTIVE_STUDY_VERSION,
    caseId,
    participantId,
    raterPosition: participant.hostPosition,
    raterRole: role,
    consentReference: participant.consentReference,
    lane,
    nextActor,
    abstainReason: abstaining ? requiredString(rating.abstainReason, "Rating abstainReason") : null,
    processCode,
    durationSeconds,
    snapshotSha256: item.snapshotSha256,
    submittedAt: lockedAt,
    lockedAt
  };
  const ratingDirectory = join(loaded.paths.ratings, caseId);
  await mkdir(ratingDirectory, { recursive: true, mode: DIRECTORY_MODE });
  await chmod(ratingDirectory, DIRECTORY_MODE);
  const ratingPath = join(ratingDirectory, `${participant.hostPosition}.json`);
  try {
    await writePrivateJson(ratingPath, record, { exclusive: true });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new ProspectiveStudyError(`Rating for position '${participant.hostPosition}' on case '${caseId}' is already locked.`);
    }
    throw error;
  }
  await appendAudit(loaded.paths, {
    event: abstaining ? "RATING_ABSTAINED" : "RATING_LOCKED",
    at: lockedAt,
    caseId,
    raterPosition: participant.hostPosition,
    role,
    snapshotSha256: item.snapshotSha256
  });
  return {
    ok: true,
    artifact: "pcf-prospective-rating-lock",
    caseId,
    raterPosition: participant.hostPosition,
    raterRole: role,
    status: abstaining ? "LOCKED_ABSTENTION" : "LOCKED_RATING",
    lockedAt
  };
}

export async function withdrawStudyParticipant({ root, participantId, now = "" } = {}) {
  const loaded = await loadStudy(root);
  assertUnlocked(loaded.state);
  const id = requiredIdentifier(participantId, "Withdrawal participantId");
  const participant = loaded.participants.participants.find((item) => item.participantId === id);
  if (!participant || participant.status !== "ACTIVE") {
    throw new ProspectiveStudyError(`Participant '${id}' does not have active consent.`);
  }
  const withdrawnAt = operationTime(loaded.state, now);
  if (new Date(withdrawnAt).getTime() < new Date(participant.recordedAt).getTime()) {
    throw new ProspectiveStudyError(`Participant '${id}' cannot withdraw before consent was recorded.`);
  }
  for (const item of loaded.cases.cases) {
    if (!item.expectedRaterPositions.includes(participant.hostPosition)) continue;
    const ratingPath = join(loaded.paths.ratings, item.caseId, `${participant.hostPosition}.json`);
    if (!(await pathExists(ratingPath))) continue;
    const rating = await readPrivateJson(ratingPath);
    if (new Date(rating.lockedAt).getTime() > new Date(withdrawnAt).getTime()) {
      throw new ProspectiveStudyError(`Participant '${id}' cannot withdraw before a locked rating was submitted.`);
    }
  }
  participant.status = "WITHDRAWN";
  participant.withdrawnAt = withdrawnAt;
  let deletedRatings = 0;
  const excludedCases = [];
  for (const item of loaded.cases.cases) {
    if (!item.expectedRaterPositions.includes(participant.hostPosition)) continue;
    const ratingPath = join(loaded.paths.ratings, item.caseId, `${participant.hostPosition}.json`);
    if (await pathExists(ratingPath)) {
      await rm(ratingPath, { force: true });
      deletedRatings += 1;
    }
    if (item.status === "FROZEN_RATING_OPEN") {
      item.status = "EXCLUDED_WITHDRAWAL";
      item.exclusionReason = "PARTICIPANT_WITHDRAWAL_BEFORE_AGGREGATE_LOCK";
      excludedCases.push(item.caseId);
    }
  }
  await writePrivateJson(loaded.paths.participants, loaded.participants);
  await writePrivateJson(loaded.paths.cases, loaded.cases);
  await appendAudit(loaded.paths, {
    event: "PARTICIPANT_WITHDRAWN",
    at: withdrawnAt,
    hostPosition: participant.hostPosition,
    deletedRatings,
    excludedCases
  });
  return {
    ok: true,
    artifact: "pcf-prospective-withdrawal",
    status: "WITHDRAWN_BEFORE_AGGREGATE_LOCK",
    deletedRatings,
    excludedCases: excludedCases.sort()
  };
}

export async function readProspectiveStudyStatus({ root } = {}) {
  const loaded = await loadStudy(root);
  let lockedRatings = 0;
  let completeCases = 0;
  for (const item of loaded.cases.cases) {
    const ratings = await readCaseRatings(loaded.paths, item);
    lockedRatings += ratings.length;
    if (item.status !== "EXCLUDED_WITHDRAWAL" && ratings.length === item.expectedRaterPositions.length && ratings.every((rating) => rating.lane)) {
      completeCases += 1;
    }
  }
  return {
    ok: true,
    artifact: "pcf-prospective-study-status",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId: loaded.state.studyId,
    mode: loaded.state.mode,
    aggregateLocked: Boolean(loaded.state.aggregateLockedAt),
    aggregateLockedAt: loaded.state.aggregateLockedAt,
    counts: {
      activeParticipants: loaded.participants.participants.filter((item) => item.status === "ACTIVE").length,
      withdrawnParticipants: loaded.participants.participants.filter((item) => item.status === "WITHDRAWN").length,
      frozenCases: loaded.cases.cases.length,
      excludedCases: loaded.cases.cases.filter((item) => item.status === "EXCLUDED_WITHDRAWAL").length,
      observedIssues: loaded.observations.observations.length,
      lockedRatings,
      completeCases
    },
    decision: "INCONCLUSIVE",
    outreachAuthorized: loaded.protocol.status?.outreachAuthorized === true
  };
}

export async function analyzeProspectiveStudy({ root, write = false, lock = false, now = "" } = {}) {
  const loaded = await loadStudy(root);
  if (loaded.state.aggregateLockedAt && write) {
    throw new ProspectiveStudyError("Study aggregate is locked; analysis artifacts cannot be rewritten.");
  }
  if (loaded.state.aggregateLockedAt && lock) {
    throw new ProspectiveStudyError("Study aggregate is already locked.");
  }
  const completed = [];
  const incomplete = [];
  for (const item of loaded.cases.cases) {
    if (item.status === "EXCLUDED_WITHDRAWAL") {
      incomplete.push({ caseId: item.caseId, reason: item.exclusionReason });
      continue;
    }
    const ratings = await readCaseRatings(loaded.paths, item);
    if (ratings.length !== item.expectedRaterPositions.length) {
      incomplete.push({ caseId: item.caseId, reason: "MISSING_RATING" });
      continue;
    }
    if (ratings.some((rating) => !rating.lane)) {
      incomplete.push({ caseId: item.caseId, reason: "ABSTENTION" });
      continue;
    }
    const seal = await readPrivateJson(join(loaded.paths.pcfSeals, `${item.caseId}.json`));
    completed.push({ item, ratings, seal });
  }
  if (!completed.length) {
    throw new ProspectiveStudyError("No complete, non-abstaining cases are available for analysis.");
  }
  let requestedLockAt = loaded.state.aggregateLockedAt;
  let lockBoundary = null;
  if (lock) {
    if (completed.length !== loaded.state.targetCases) {
      throw new ProspectiveStudyError(`Aggregate lock requires exactly ${loaded.state.targetCases} complete cases.`);
    }
    requestedLockAt = operationTime(loaded.state, now);
    lockBoundary = aggregateLockBoundary(loaded, completed);
    if (new Date(requestedLockAt).getTime() < new Date(lockBoundary.notBefore).getTime()) {
      throw new ProspectiveStudyError(
        `Aggregate lock cannot occur before ${lockBoundary.notBefore}; frozen consent requires every active withdrawal deadline and a 14-day cooling-off period after the final rating.`
      );
    }
  }

  completed.sort((left, right) => left.item.caseId.localeCompare(right.item.caseId));
  const corpusRecords = completed.map(({ item, ratings, seal }) => ({
    id: item.caseId,
    repository: item.repository,
    policyId: seal.policyId,
    consent: {
      allowedForValidation: true,
      reference: `consent-set-${sha256(ratings.map((rating) => rating.consentReference).sort().join("\n")).slice(0, 24)}`
    },
    pcf: {
      lane: seal.pcf.lane,
      score: seal.pcf.score,
      nextActor: seal.pcf.nextActor
    },
    ratings: ratings.map((rating) => ({
      raterId: rating.raterPosition,
      lane: rating.lane,
      nextActor: rating.nextActor
    })),
    provenance: {
      dataset: loaded.state.studyId,
      caseRef: item.caseId,
      policySnapshot: seal.policySnapshot,
      collectedAt: item.frozenAt
    }
  }));
  const corpusText = corpusRecords.map((record) => JSON.stringify(sortDeep(record))).join("\n") + "\n";
  const validation = validateCorpusText(corpusText, {
    inputFormat: "jsonl",
    sourceName: "consented.jsonl"
  });
  const caseResults = completed.map(({ item, ratings, seal }) => ({
    caseId: item.caseId,
    stratum: item.stratum,
    pcfLane: seal.pcf.lane,
    consensusLane: strictMajority(ratings.map((rating) => rating.lane)),
    contextLane: ratings.find((rating) => rating.raterRole === "context")?.lane || null,
    externalLanes: ratings.filter((rating) => rating.raterRole === "external").map((rating) => rating.lane)
  }));
  const falseReviewNow = caseResults.filter((item) => item.pcfLane === "review-now" && item.consensusLane !== "review-now");
  const predictedReviewNow = caseResults.filter((item) => item.pcfLane === "review-now");
  const missedReviewNow = caseResults.filter((item) => item.pcfLane !== "review-now" && item.consensusLane === "review-now");
  const consensusReviewNow = caseResults.filter((item) => item.consensusLane === "review-now");
  const contextPairs = caseResults.flatMap((item) => item.externalLanes.map((externalLane) => item.contextLane === externalLane));
  const perStratum = buildPerStratum(caseResults);
  const analysisCore = {
    ok: true,
    artifact: "pcf-prospective-study-analysis",
    version: PROSPECTIVE_STUDY_VERSION,
    studyId: loaded.state.studyId,
    mode: loaded.state.mode,
    cases: {
      frozen: loaded.cases.cases.length,
      complete: completed.length,
      incompleteOrExcluded: incomplete.length,
      target: loaded.state.targetCases
    },
    errors: {
      falseReviewNow: wilsonSummary(falseReviewNow.length, predictedReviewNow.length),
      missedReviewNow: wilsonSummary(missedReviewNow.length, consensusReviewNow.length)
    },
    contextExternalAgreement: {
      agreeingPairs: contextPairs.filter(Boolean).length,
      totalPairs: contextPairs.length,
      rate: ratio(contextPairs.filter(Boolean).length, contextPairs.length)
    },
    perStratum,
    incomplete,
    validation,
    decision: {
      status: "INCONCLUSIVE",
      reason: "Prospective measurement does not establish product validity, safety, maintainer endorsement, or causal time savings."
    },
    limitations: [
      "Wilson intervals are descriptive and naive because cases cluster by repository and raters repeat.",
      "Consent, maintainer role, rater independence, and restricted-store governance require operator verification beyond this local runner.",
      "No evaluator tuning or threshold selection is authorized on this pilot."
    ]
  };
  const analysisSha256 = sha256(canonicalJson(analysisCore));
  const lockedAt = lock ? requestedLockAt : loaded.state.aggregateLockedAt;
  const result = {
    ...analysisCore,
    analysisSha256,
    aggregateLock: {
      locked: Boolean(loaded.state.aggregateLockedAt || lock),
      lockedAt: lockedAt || null,
      notBefore: lockBoundary?.notBefore || null,
      finalRatingAt: lockBoundary?.finalRatingAt || null,
      finalWithdrawalDeadline: lockBoundary?.finalWithdrawalDeadline || null
    }
  };
  if (write || lock) {
    await writePrivateFile(join(loaded.paths.corpus, "consented.jsonl"), corpusText);
    await writePrivateJson(join(loaded.paths.output, "analysis.json"), result);
  }
  if (lock) {
    loaded.state.aggregateLockedAt = lockedAt;
    for (const item of loaded.cases.cases) {
      if (item.status === "FROZEN_RATING_OPEN") item.status = "AGGREGATE_LOCKED";
    }
    await writePrivateJson(loaded.paths.study, loaded.state);
    await writePrivateJson(loaded.paths.cases, loaded.cases);
    await appendAudit(loaded.paths, {
      event: "AGGREGATE_LOCKED",
      at: lockedAt,
      completeCases: completed.length,
      corpusSha256: validation.corpus.sha256,
      analysisSha256
    });
  }
  return result;
}

export function renderProspectiveStudySummary(result = {}) {
  if (result.artifact === "pcf-prospective-study-status") {
    return [
      `PCF prospective study: ${result.studyId || "unknown"}`,
      `Mode: ${result.mode || "unknown"}`,
      `Participants active/withdrawn: ${result.counts?.activeParticipants || 0}/${result.counts?.withdrawnParticipants || 0}`,
      `Cases complete/frozen: ${result.counts?.completeCases || 0}/${result.counts?.frozenCases || 0}`,
      `Aggregate locked: ${result.aggregateLocked ? "yes" : "no"}`,
      "Decision boundary: INCONCLUSIVE",
      ""
    ].join("\n");
  }
  return [
    `PCF prospective study analysis: ${result.studyId || "unknown"}`,
    `Cases: ${result.cases?.complete || 0} complete, ${result.cases?.incompleteOrExcluded || 0} incomplete or excluded`,
    `False review-now: ${result.errors?.falseReviewNow?.count || 0}/${result.errors?.falseReviewNow?.total || 0}`,
    `Missed review-now: ${result.errors?.missedReviewNow?.count || 0}/${result.errors?.missedReviewNow?.total || 0}`,
    `Context/external agreement: ${formatRate(result.contextExternalAgreement?.rate)}`,
    `Analysis SHA-256: ${result.analysisSha256 || ""}`,
    `Decision boundary: ${result.decision?.status || "INCONCLUSIVE"}`,
    ""
  ].join("\n");
}

export function renderProspectiveStudyMarkdown(result = {}) {
  if (result.artifact === "pcf-prospective-study-status") {
    return [
      "# PCF Prospective Study Status",
      "",
      `- Study: \`${escapeCode(result.studyId || "unknown")}\``,
      `- Mode: **${escapeCode(result.mode || "unknown")}**`,
      `- Active participants: ${result.counts?.activeParticipants || 0}`,
      `- Withdrawn participants: ${result.counts?.withdrawnParticipants || 0}`,
      `- Complete/frozen cases: ${result.counts?.completeCases || 0}/${result.counts?.frozenCases || 0}`,
      `- Aggregate locked: **${result.aggregateLocked ? "yes" : "no"}**`,
      "- Decision boundary: **INCONCLUSIVE**",
      ""
    ].join("\n");
  }
  return [
    "# PCF Prospective Study Analysis",
    "",
    `- Study: \`${escapeCode(result.studyId || "unknown")}\``,
    `- Complete cases: ${result.cases?.complete || 0}`,
    `- Incomplete or excluded: ${result.cases?.incompleteOrExcluded || 0}`,
    `- False \`review-now\`: ${result.errors?.falseReviewNow?.count || 0}/${result.errors?.falseReviewNow?.total || 0}`,
    `- Missed \`review-now\`: ${result.errors?.missedReviewNow?.count || 0}/${result.errors?.missedReviewNow?.total || 0}`,
    `- Context/external agreement: ${formatRate(result.contextExternalAgreement?.rate)}`,
    `- Analysis SHA-256: \`${result.analysisSha256 || ""}\``,
    `- Decision boundary: **${result.decision?.status || "INCONCLUSIVE"}**`,
    "",
    "Wilson intervals are descriptive and naive because cases cluster by repository and raters repeat. No tuning or product-validity claim is authorized.",
    ""
  ].join("\n");
}

function canonicalSnapshot({ loaded, input, slot, caseId, hostPosition, repository, issueOrdinal }) {
  assertPlainObject(input.issue, "Case issue");
  assertAllowedKeys(input.issue, [
    "number",
    "title",
    "body",
    "authorAssociation",
    "labels",
    "createdAt",
    "language",
    "humanAuthored",
    "labelsAtCreationVerified",
    "securitySensitive",
    "privateDataDetected"
  ], "Case issue");
  assertPlainObject(input.policy, "Case policy");
  assertAllowedKeys(input.policy, ["id", "snapshot", "excerpt", "files"], "Case policy");
  const association = requiredString(input.issue.authorAssociation, "Issue authorAssociation");
  const eligibleAssociations = loaded.protocol.sampling?.eligibleAuthorAssociations || [];
  if (!eligibleAssociations.includes(association)) {
    throw new ProspectiveStudyError(`Issue authorAssociation '${association}' is not eligible under the frozen protocol.`);
  }
  if (input.issue.humanAuthored !== true) throw new ProspectiveStudyError("Issue must be verified human-authored.");
  if (input.issue.labelsAtCreationVerified !== true) throw new ProspectiveStudyError("Creation-time label provenance must be verified.");
  if (input.issue.securitySensitive !== false) throw new ProspectiveStudyError("Security-sensitive issues cannot enter the study snapshot.");
  if (input.issue.privateDataDetected !== false) throw new ProspectiveStudyError("Issues with detected private data cannot enter the study snapshot.");
  if (input.issue.language !== "en") throw new ProspectiveStudyError("Frozen rating instrument currently requires language='en'.");
  const labels = Array.isArray(input.issue.labels)
    ? input.issue.labels.map((label) => requiredString(label, "Issue label")).sort()
    : [];
  const files = normalizePolicyFiles(input.policy.files);
  return {
    schemaVersion: "1.0.0",
    studyId: loaded.state.studyId,
    caseId,
    slotId: slot.slotId,
    hostPosition,
    stratum: requiredIdentifier(slot.hostStratum, "Slot hostStratum"),
    repository,
    issueOrdinal,
    issue: {
      number: positiveInteger(input.issue.number, "Issue number"),
      title: requiredString(input.issue.title, "Issue title"),
      body: requiredString(input.issue.body, "Issue body"),
      authorAssociation: association,
      labels,
      createdAt: normalizedTime(input.issue.createdAt),
      language: "en"
    },
    policy: {
      id: requiredIdentifier(input.policy.id, "Policy id"),
      snapshot: requiredReference(input.policy.snapshot, "Policy snapshot"),
      excerpt: requiredString(input.policy.excerpt, "Policy excerpt"),
      files
    }
  };
}

function normalizePolicyFiles(files) {
  if (!Array.isArray(files)) throw new ProspectiveStudyError("Policy files must be an array.");
  if (files.length > 50) throw new ProspectiveStudyError("Policy files exceed the 50-file study limit.");
  return files.map((file, index) => {
    assertPlainObject(file, `Policy file ${index + 1}`);
    assertAllowedKeys(file, ["path", "content"], `Policy file ${index + 1}`);
    const path = requiredString(file.path, `Policy file ${index + 1} path`);
    if (path.startsWith("/") || path.split(/[\\/]/).includes("..")) {
      throw new ProspectiveStudyError(`Policy file ${index + 1} has an unsafe path.`);
    }
    return { path, content: requiredString(file.content, `Policy file ${index + 1} content`) };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function buildPerStratum(caseResults) {
  const output = {};
  for (const item of caseResults) {
    if (!output[item.stratum]) {
      output[item.stratum] = {
        cases: 0,
        confusionMatrix: emptyConfusionMatrix(),
        falseReviewNow: 0,
        missedReviewNow: 0
      };
    }
    const entry = output[item.stratum];
    entry.cases += 1;
    entry.confusionMatrix[item.pcfLane][item.consensusLane] += 1;
    if (item.pcfLane === "review-now" && item.consensusLane !== "review-now") entry.falseReviewNow += 1;
    if (item.pcfLane !== "review-now" && item.consensusLane === "review-now") entry.missedReviewNow += 1;
  }
  return Object.fromEntries(Object.entries(output).sort(([left], [right]) => left.localeCompare(right)));
}

function emptyConfusionMatrix() {
  return Object.fromEntries(LANES.map((predicted) => [
    predicted,
    Object.fromEntries(LANES.map((actual) => [actual, 0]))
  ]));
}

function wilsonSummary(count, total) {
  const rate = ratio(count, total);
  if (!total) return { count, total, rate: null, lower95: null, upper95: null };
  const z = 1.959963984540054;
  const denominator = 1 + (z * z) / total;
  const center = (rate + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((rate * (1 - rate) / total) + (z * z) / (4 * total * total));
  return {
    count,
    total,
    rate: round(rate),
    lower95: round(Math.max(0, center - margin)),
    upper95: round(Math.min(1, center + margin))
  };
}

function strictMajority(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let winner = null;
  let winnerCount = 0;
  for (const [value, count] of counts) {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  }
  return winnerCount > values.length / 2 ? winner : null;
}

function aggregateLockBoundary(loaded, completed) {
  const ratingTimes = completed.flatMap(({ ratings }) => (
    ratings.map((rating) => new Date(normalizedTime(rating.lockedAt)).getTime())
  ));
  if (!ratingTimes.length) throw new ProspectiveStudyError("Aggregate lock requires locked ratings.");
  const finalRatingMs = Math.max(...ratingTimes);
  const withdrawalDeadlines = loaded.participants.participants
    .filter((participant) => participant.status === "ACTIVE")
    .map((participant) => new Date(normalizedTime(participant.withdrawalDeadline)).getTime());
  if (!withdrawalDeadlines.length) {
    throw new ProspectiveStudyError("Aggregate lock requires active participant consent records.");
  }
  const finalWithdrawalDeadlineMs = Math.max(...withdrawalDeadlines);
  return {
    finalRatingAt: new Date(finalRatingMs).toISOString(),
    finalWithdrawalDeadline: new Date(finalWithdrawalDeadlineMs).toISOString(),
    notBefore: new Date(Math.max(
      finalRatingMs + AGGREGATE_COOLING_OFF_MS,
      finalWithdrawalDeadlineMs
    )).toISOString()
  };
}

async function loadStudy(root) {
  const paths = studyPaths(root);
  await assertNoSymlinkComponents(paths.root);
  if (!(await pathExists(paths.study))) throw new ProspectiveStudyError("Study root is not initialized.");
  for (const directory of paths.directories) await assertPrivateDirectory(directory);
  const [state, protocol, frame, participants, observations, cases] = await Promise.all([
    readPrivateJson(paths.study),
    readPrivateJson(paths.protocol),
    readPrivateJson(paths.frame),
    readPrivateJson(paths.participants),
    readPrivateJson(paths.observations),
    readPrivateJson(paths.cases)
  ]);
  if (state.protocolSha256 !== sha256(canonicalJson(protocol))) {
    throw new ProspectiveStudyError("Stored protocol hash does not match initialized state.");
  }
  if (state.samplingFrameSha256 !== sha256(canonicalJson(frame))) {
    throw new ProspectiveStudyError("Stored sampling frame hash does not match initialized state.");
  }
  return { paths, state, protocol, frame, participants, observations, cases };
}

function validateProtocol(protocol) {
  requiredIdentifier(protocol.studyId, "Protocol studyId");
  positiveInteger(protocol.design?.caseTarget, "Protocol design.caseTarget");
  const ratingsPerCase = positiveInteger(protocol.design?.ratingsPerCase, "Protocol design.ratingsPerCase");
  if (ratingsPerCase !== 3) throw new ProspectiveStudyError("Prospective study requires exactly three ratings per case.");
  if (protocol.analysis?.consensus !== "STRICT_MAJORITY") {
    throw new ProspectiveStudyError("Protocol analysis.consensus must be STRICT_MAJORITY.");
  }
  if (protocol.analysis?.tuneOnPilotAllowed !== false) {
    throw new ProspectiveStudyError("Protocol must set tuneOnPilotAllowed=false.");
  }
  for (const status of ["ready-for-maintainer", "needs-repair", "low-review-value"]) {
    const mapping = protocol.pcfStatusMapping?.[status];
    if (!mapping || !LANES.includes(mapping.lane) || NEXT_ACTOR[mapping.lane] !== mapping.nextActor) {
      throw new ProspectiveStudyError(`Protocol has an invalid PCF mapping for '${status}'.`);
    }
  }
}

function validateSamplingFrame(frame) {
  if (!Array.isArray(frame.hostPositions) || !frame.hostPositions.length) {
    throw new ProspectiveStudyError("Sampling frame requires hostPositions.");
  }
  if (!Array.isArray(frame.slots) || !frame.slots.length) {
    throw new ProspectiveStudyError("Sampling frame requires slots.");
  }
  const positions = new Set();
  for (const item of frame.hostPositions) {
    const position = requiredIdentifier(item.hostPosition, "Sampling hostPosition");
    if (positions.has(position)) throw new ProspectiveStudyError(`Duplicate host position '${position}'.`);
    positions.add(position);
  }
  const slots = new Set();
  for (const slot of frame.slots) {
    const slotId = requiredIdentifier(slot.slotId, "Sampling slotId");
    if (slots.has(slotId)) throw new ProspectiveStudyError(`Duplicate sampling slot '${slotId}'.`);
    slots.add(slotId);
    const expected = expectedPositions(slot);
    if (expected.length !== 3 || new Set(expected).size !== 3) {
      throw new ProspectiveStudyError(`Sampling slot '${slotId}' must have three distinct rater positions.`);
    }
    for (const position of expected) {
      if (!positions.has(position)) throw new ProspectiveStudyError(`Sampling slot '${slotId}' references unknown position '${position}'.`);
    }
  }
  if (Number(frame.slotCount) !== frame.slots.length) {
    throw new ProspectiveStudyError("Sampling frame slotCount does not match its slots array.");
  }
  if (Number(frame.hostPositionCount) !== frame.hostPositions.length) {
    throw new ProspectiveStudyError("Sampling frame hostPositionCount does not match its hostPositions array.");
  }
}

function expectedPositions(slot) {
  if (!slot) return [];
  const context = requiredIdentifier(slot.contextRaterPosition, "Slot contextRaterPosition");
  const external = Array.isArray(slot.externalRaterPositions)
    ? slot.externalRaterPositions.map((position) => requiredIdentifier(position, "Slot externalRaterPosition"))
    : [];
  return [context, ...external];
}

async function readCaseRatings(paths, item) {
  const ratings = [];
  for (const position of item.expectedRaterPositions) {
    const path = join(paths.ratings, item.caseId, `${position}.json`);
    if (await pathExists(path)) ratings.push(await readPrivateJson(path));
  }
  return ratings;
}

function studyPaths(root) {
  if (!root || !isAbsolute(String(root))) {
    throw new ProspectiveStudyError("Study root must be an explicit absolute path.");
  }
  const resolved = resolve(String(root));
  const paths = {
    root: resolved,
    config: join(resolved, "config"),
    restricted: join(resolved, "restricted"),
    participantsDirectory: join(resolved, "restricted", "participants"),
    snapshots: join(resolved, "restricted", "snapshots"),
    ratings: join(resolved, "restricted", "ratings"),
    corpus: join(resolved, "restricted", "corpus"),
    sealed: join(resolved, "sealed"),
    pcfSeals: join(resolved, "sealed", "pcf"),
    blinded: join(resolved, "blinded"),
    blindedCases: join(resolved, "blinded", "cases"),
    output: join(resolved, "output"),
    auditDirectory: join(resolved, "audit"),
    study: join(resolved, "config", "study.json"),
    protocol: join(resolved, "config", "protocol.json"),
    frame: join(resolved, "config", "sampling-frame.json"),
    participants: join(resolved, "restricted", "participants.json"),
    observations: join(resolved, "restricted", "observations.json"),
    cases: join(resolved, "restricted", "cases.json"),
    audit: join(resolved, "audit", "events.jsonl")
  };
  paths.directories = [
    paths.root,
    paths.config,
    paths.restricted,
    paths.participantsDirectory,
    paths.snapshots,
    paths.ratings,
    paths.corpus,
    paths.sealed,
    paths.pcfSeals,
    paths.blinded,
    paths.blindedCases,
    paths.output,
    paths.auditDirectory
  ];
  return paths;
}

async function assertNoSymlinkComponents(target) {
  const absolute = resolve(target);
  const root = parse(absolute).root;
  const parts = absolute.slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new ProspectiveStudyError("Study paths may not contain a symbolic link.");
      if (!details.isDirectory() && current !== absolute) {
        throw new ProspectiveStudyError("Study path parent components must be directories.");
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function readPrivateJson(path) {
  const details = await lstat(path);
  if (details.isSymbolicLink() || !details.isFile()) {
    throw new ProspectiveStudyError("Study data path is not a regular file.");
  }
  if ((details.mode & 0o077) !== 0) {
    throw new ProspectiveStudyError("Study data permissions are broader than owner-only access.");
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProspectiveStudyError("Study data contains invalid JSON.");
    throw error;
  }
}

async function assertPrivateDirectory(path) {
  const details = await lstat(path);
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new ProspectiveStudyError("Study storage path is not a private directory.");
  }
  if ((details.mode & 0o077) !== 0) {
    throw new ProspectiveStudyError("Study directory permissions are broader than owner-only access.");
  }
}

async function writePrivateJson(path, value, options = {}) {
  return writePrivateFile(path, canonicalJson(value), options);
}

async function writePrivateFile(path, text, { exclusive = false } = {}) {
  await assertSafeDestination(path);
  await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
  await chmod(dirname(path), DIRECTORY_MODE);
  if (exclusive) {
    const handle = await open(path, "wx", FILE_MODE);
    try {
      await handle.writeFile(String(text), "utf8");
      await handle.chmod(FILE_MODE);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return;
  }
  const temporary = join(dirname(path), `.${randomBytes(12).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", FILE_MODE);
  try {
    await handle.writeFile(String(text), "utf8");
    await handle.chmod(FILE_MODE);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await assertSafeDestination(path);
    await rename(temporary, path);
    await chmod(path, FILE_MODE);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function assertSafeDestination(path) {
  await assertNoSymlinkComponents(dirname(path));
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink() || !details.isFile()) {
      throw new ProspectiveStudyError("Study output destination is not a regular file.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function appendAudit(paths, event) {
  await assertSafeDestination(paths.audit);
  await appendFile(paths.audit, `${JSON.stringify(sortDeep(event))}\n`, { encoding: "utf8", mode: FILE_MODE });
  await chmod(paths.audit, FILE_MODE);
}

function canonicalJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertUnlocked(state) {
  if (state.aggregateLockedAt) throw new ProspectiveStudyError("Study aggregate is locked; mutation is not allowed.");
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProspectiveStudyError(`${label} must be an object.`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value || {})) {
    if (!allowedSet.has(key)) throw new ProspectiveStudyError(`${label} contains unsupported field '${key}'.`);
  }
}

function requiredIdentifier(value, label) {
  const result = requiredString(value, label);
  if (!IDENTIFIER.test(result)) throw new ProspectiveStudyError(`${label} must be a safe opaque identifier.`);
  return result;
}

function requiredRepository(value, label) {
  const result = requiredString(value, label);
  if (!REPOSITORY.test(result) || result.includes("..")) throw new ProspectiveStudyError(`${label} must use owner/repository form.`);
  return result;
}

function requiredReference(value, label) {
  const result = requiredString(value, label);
  if (!REFERENCE.test(result)) throw new ProspectiveStudyError(`${label} must be a safe single-line reference.`);
  return result;
}

function requiredString(value, label) {
  const result = String(value ?? "").trim();
  if (!result || result.includes("\0")) throw new ProspectiveStudyError(`${label} is required.`);
  return result;
}

function requiredLane(value, label) {
  const result = requiredString(value, label);
  if (!LANES.includes(result)) throw new ProspectiveStudyError(`${label} must be review-now, repair, or defer.`);
  return result;
}

function positiveInteger(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new ProspectiveStudyError(`${label} must be a positive integer.`);
  return result;
}

function optionalNonNegativeNumber(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new ProspectiveStudyError(`${label} must be a non-negative number.`);
  return result;
}

function normalizedTime(value) {
  const source = value || new Date().toISOString();
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) throw new ProspectiveStudyError("Study timestamps must be valid ISO-8601 values.");
  return parsed.toISOString();
}

function operationTime(state, value) {
  if (state.mode === "production" && value) {
    throw new ProspectiveStudyError("Production study mutations do not accept a caller-supplied clock.");
  }
  return normalizedTime(value);
}

function assertProductionActivated(loaded, activity) {
  if (loaded.state.mode !== "production") return;
  if (loaded.protocol.status?.outreachAuthorized !== true) {
    throw new ProspectiveStudyError(`Production ${activity} requires outreachAuthorized=true in the activated protocol.`);
  }
  if (loaded.protocol.snapshot?.restrictedSnapshotStoreCreated !== true) {
    throw new ProspectiveStudyError(`Production ${activity} requires restrictedSnapshotStoreCreated=true in the activated protocol.`);
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function ratio(numerator, denominator) {
  return denominator ? round(numerator / denominator) : null;
}

function round(value) {
  return Number(Number(value).toFixed(4));
}

function formatRate(value) {
  return value === null || value === undefined ? "n/a" : Number(value).toFixed(4);
}

function escapeCode(value) {
  return String(value).replace(/`/g, "\\`");
}
