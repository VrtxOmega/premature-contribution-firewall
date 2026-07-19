import { createHash } from "node:crypto";

export const CONTRIBUTION_LIFECYCLE_VERSION = "2026.07.19";

export const LIFECYCLE_CLASSIFICATIONS = Object.freeze({
  CURRENT_AND_APPLICABLE: lifecycleDefinition(
    "review-current-patch",
    "contributor",
    "The defect is still present and the original patch still applies to the checked upstream state."
  ),
  DRIFTED_BUT_REBASEABLE: lifecycleDefinition(
    "refresh-against-current-main",
    "contributor",
    "The defect is still present and the patch needs a bounded refresh against current upstream."
  ),
  SALVAGEABLE_INVARIANT: lifecycleDefinition(
    "prepare-salvage-packet",
    "contributor/maintainer",
    "The original patch is stale, but the reproduced defect and invariant remain live."
  ),
  PARTIALLY_SUPERSEDED: lifecycleDefinition(
    "extract-surviving-claim",
    "contributor/maintainer",
    "Some atomic claims are already covered upstream while at least one live claim remains."
  ),
  SUPERSEDED_EQUIVALENT: lifecycleDefinition(
    "document-superseding-work",
    "contributor",
    "Equivalent upstream work resolved every atomic claim in the contribution."
  ),
  INVALIDATED: lifecycleDefinition(
    "close-as-invalidated",
    "contributor",
    "Current evidence shows the original invariant or defect claim is no longer valid."
  ),
  NEEDS_MAINTAINER_DECISION: lifecycleDefinition(
    "request-maintainer-decision",
    "maintainer",
    "The supplied lifecycle evidence is unknown, contradictory, or cannot be reduced safely."
  )
});

const CLAIM_STATES = Object.freeze({
  CURRENT_AND_APPLICABLE: "CURRENT_AND_APPLICABLE",
  DRIFTED_BUT_REBASEABLE: "DRIFTED_BUT_REBASEABLE",
  SALVAGEABLE_INVARIANT: "SALVAGEABLE_INVARIANT",
  SUPERSEDED_EQUIVALENT: "SUPERSEDED_EQUIVALENT",
  INVALIDATED: "INVALIDATED",
  NEEDS_MAINTAINER_DECISION: "NEEDS_MAINTAINER_DECISION"
});
const DEFECT_STATES = new Set(["present", "resolved", "invalidated", "unknown"]);
const PATCH_STATES = new Set(["applies", "needs-rebase", "stale", "not-needed", "unknown"]);
const COVERAGE_STATES = new Set(["none", "equivalent", "unknown"]);
const ORIGINAL_STATES = new Set(["open", "closed", "merged", "unknown"]);
const ASSESSMENT_MODES = new Set(["live", "retrospective"]);
const OUTCOME_STATES = new Set([
  "landed-directly",
  "landed-by-salvage",
  "partially-salvaged",
  "superseded-independent",
  "closed-without-landing",
  "unknown"
]);
const CREDIT_STATES = new Set(["commit-author", "co-author", "acknowledged", "none", "unknown"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
const COMMIT = /^[a-f0-9]{7,64}$/i;

export class ContributionLifecycleError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContributionLifecycleError";
  }
}

export function assessContributionLifecycle(input = {}) {
  assertPlainObject(input, "Lifecycle input");
  assertAllowedKeys(input, [
    "artifact",
    "version",
    "assessmentMode",
    "repository",
    "observedAt",
    "originalContribution",
    "currentUpstream",
    "claimUnits",
    "outcome"
  ], "Lifecycle input");
  if (input.artifact !== "pcf-contribution-lifecycle-input") {
    throw new ContributionLifecycleError("Lifecycle input artifact must be 'pcf-contribution-lifecycle-input'.");
  }
  if (input.version !== CONTRIBUTION_LIFECYCLE_VERSION) {
    throw new ContributionLifecycleError(`Lifecycle input version must be '${CONTRIBUTION_LIFECYCLE_VERSION}'.`);
  }

  const assessmentMode = requiredEnum(input.assessmentMode, ASSESSMENT_MODES, "Lifecycle assessmentMode");
  const repository = requiredRepository(input.repository);
  const observedAt = requiredTime(input.observedAt, "Lifecycle observedAt");
  const originalContribution = normalizeOriginalContribution(input.originalContribution);
  const currentUpstream = normalizeCurrentUpstream(input.currentUpstream, observedAt);
  const claimUnits = normalizeClaimUnits(input.claimUnits);
  const assessedClaims = claimUnits.map(assessClaimUnit);
  const classification = aggregateClassification(assessedClaims);
  const definition = LIFECYCLE_CLASSIFICATIONS[classification];
  const outcome = normalizeOutcome(input.outcome, observedAt);
  const assessmentEvidence = {
    artifact: input.artifact,
    version: input.version,
    assessmentMode,
    repository,
    observedAt,
    originalContribution,
    currentUpstream,
    claimUnits
  };

  return {
    artifact: "pcf-contribution-lifecycle-assessment",
    version: CONTRIBUTION_LIFECYCLE_VERSION,
    assessmentSha256: sha256(assessmentEvidence),
    assessmentMode,
    repository,
    observedAt,
    originalContribution,
    currentUpstream,
    classification,
    nextAction: {
      id: definition.nextAction,
      owner: definition.owner,
      summary: definition.summary,
      publicWriteAuthorized: false
    },
    summary: definition.summary,
    counts: summarizeClaims(assessedClaims),
    claimUnits: assessedClaims,
    salvagePacket: buildSalvagePacket({
      classification,
      repository,
      observedAt,
      originalContribution,
      currentUpstream,
      assessedClaims
    }),
    outcome,
    publicProof: publicProofFor(outcome),
    boundaries: {
      dryRun: true,
      networkAccess: false,
      githubWrites: false,
      outcomeUsedForClassification: false,
      classificationBasis: "observation-time claim evidence only"
    },
    nonClaims: [
      "This assessment does not prove correctness, mergeability, maintainer endorsement, or permission to publish.",
      "Recorded outcomes and credit are caller-supplied provenance and are never used to improve the observation-time classification.",
      assessmentMode === "retrospective"
        ? "A retrospective fixture can calibrate the lifecycle model; it does not prove PCF predicted the later outcome."
        : "A live assessment can become stale as soon as upstream state changes; recheck before acting."
    ]
  };
}

export function renderContributionLifecycleMarkdown(result = {}) {
  const lines = [
    "# PCF Contribution Lifecycle Assessment",
    "",
    `- Repository: ${markdownText(result.repository)}`,
    `- Observed at: ${markdownText(result.observedAt)}`,
    `- Assessment mode: ${markdownText(result.assessmentMode)}`,
    `- Classification: **${markdownText(result.classification)}**`,
    `- Next action: \`${markdownText(result.nextAction?.id)}\``,
    `- Owner: ${markdownText(result.nextAction?.owner)}`,
    `- Assessment SHA-256: \`${markdownText(result.assessmentSha256)}\``,
    "",
    markdownText(result.summary),
    "",
    "## Atomic Claims",
    "",
    "| Claim | Lifecycle state | Defect | Patch | Upstream coverage |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const claim of result.claimUnits || []) {
    lines.push(`| ${markdownCell(claim.title)} | ${markdownCell(claim.lifecycleState)} | ${markdownCell(claim.defectState)} | ${markdownCell(claim.patchState)} | ${markdownCell(claim.upstreamCoverage)} |`);
  }

  lines.push("", "## Salvage Packet", "");
  if (result.salvagePacket?.needed) {
    lines.push(`Mode: \`${markdownText(result.salvagePacket.mode)}\``, "", "Surviving claims:");
    for (const claim of result.salvagePacket.survivingClaims || []) {
      lines.push(`- **${markdownText(claim.id)}:** ${markdownText(claim.invariant)}`);
    }
    if (!(result.salvagePacket.survivingClaims || []).length) lines.push("- None.");
  } else {
    lines.push("No salvage packet is required for this classification.");
  }

  lines.push(
    "",
    "## Recorded Outcome",
    "",
    `- State: ${markdownText(result.outcome?.state)}`,
    `- Credit: ${markdownText(result.outcome?.credit)}`,
    `- Used for classification: ${result.outcome?.usedForClassification ? "yes" : "no"}`,
    "",
    markdownText(result.publicProof?.guidance),
    "",
    "## Boundaries",
    ""
  );
  for (const claim of result.nonClaims || []) lines.push(`- ${markdownText(claim)}`);
  return `${lines.join("\n")}\n`;
}

export function renderContributionLifecycleSummary(result = {}) {
  const lines = [
    `PCF contribution lifecycle: ${result.classification}`,
    `Repository: ${result.repository}`,
    `Observed at: ${result.observedAt}`,
    `Next action: ${result.nextAction?.id} (owner: ${result.nextAction?.owner})`,
    `Outcome excluded from classification: ${result.outcome?.usedForClassification === false ? "yes" : "no"}`,
    "",
    result.summary,
    "",
    "Claims:"
  ];
  for (const claim of result.claimUnits || []) {
    lines.push(`- ${claim.id}: ${claim.lifecycleState} — ${claim.reason}`);
  }
  lines.push("", `Public proof boundary: ${result.publicProof?.guidance || "No provenance guidance available."}`);
  return `${lines.join("\n")}\n`;
}

function lifecycleDefinition(nextAction, owner, summary) {
  return Object.freeze({ nextAction, owner, summary });
}

function normalizeOriginalContribution(value) {
  assertPlainObject(value, "Lifecycle originalContribution");
  assertAllowedKeys(value, ["url", "number", "title", "baseCommit", "state"], "Lifecycle originalContribution");
  return {
    url: requiredUrl(value.url, "Lifecycle originalContribution.url"),
    number: optionalPositiveInteger(value.number, "Lifecycle originalContribution.number"),
    title: optionalString(value.title, "Lifecycle originalContribution.title", 500),
    baseCommit: optionalCommit(value.baseCommit, "Lifecycle originalContribution.baseCommit"),
    state: requiredEnum(value.state, ORIGINAL_STATES, "Lifecycle originalContribution.state")
  };
}

function normalizeCurrentUpstream(value, observedAt) {
  assertPlainObject(value, "Lifecycle currentUpstream");
  assertAllowedKeys(value, ["ref", "commit", "checkedAt"], "Lifecycle currentUpstream");
  const checkedAt = requiredTime(value.checkedAt, "Lifecycle currentUpstream.checkedAt");
  if (Date.parse(checkedAt) > Date.parse(observedAt)) {
    throw new ContributionLifecycleError("Lifecycle currentUpstream.checkedAt cannot be later than observedAt.");
  }
  return {
    ref: requiredString(value.ref, "Lifecycle currentUpstream.ref", 255),
    commit: requiredCommit(value.commit, "Lifecycle currentUpstream.commit"),
    checkedAt
  };
}

function normalizeClaimUnits(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ContributionLifecycleError("Lifecycle claimUnits must contain at least one atomic claim.");
  }
  if (value.length > 50) throw new ContributionLifecycleError("Lifecycle claimUnits cannot contain more than 50 claims.");
  const seen = new Set();
  return value.map((claim, index) => {
    const label = `Lifecycle claimUnits[${index}]`;
    assertPlainObject(claim, label);
    assertAllowedKeys(claim, [
      "id",
      "title",
      "invariant",
      "originalReproduction",
      "defectState",
      "patchState",
      "upstreamCoverage",
      "evidence"
    ], label);
    const id = requiredIdentifier(claim.id, `${label}.id`);
    if (seen.has(id)) throw new ContributionLifecycleError(`Lifecycle claim id '${id}' is duplicated.`);
    seen.add(id);
    if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
      throw new ContributionLifecycleError(`${label}.evidence must contain at least one observation-time evidence item.`);
    }
    if (claim.evidence.length > 25) throw new ContributionLifecycleError(`${label}.evidence cannot contain more than 25 items.`);
    return {
      id,
      title: requiredString(claim.title, `${label}.title`, 500),
      invariant: requiredString(claim.invariant, `${label}.invariant`, 2000),
      originalReproduction: requiredString(claim.originalReproduction, `${label}.originalReproduction`, 4000),
      defectState: requiredEnum(claim.defectState, DEFECT_STATES, `${label}.defectState`),
      patchState: requiredEnum(claim.patchState, PATCH_STATES, `${label}.patchState`),
      upstreamCoverage: requiredEnum(claim.upstreamCoverage, COVERAGE_STATES, `${label}.upstreamCoverage`),
      evidence: claim.evidence.map((item, evidenceIndex) => requiredString(item, `${label}.evidence[${evidenceIndex}]`, 4000))
    };
  });
}

function assessClaimUnit(claim) {
  let lifecycleState = CLAIM_STATES.NEEDS_MAINTAINER_DECISION;
  let reason = "Evidence is incomplete or contradictory; the claim needs maintainer judgment.";
  const unknown = claim.defectState === "unknown" || claim.patchState === "unknown" || claim.upstreamCoverage === "unknown";

  if (!unknown && claim.defectState === "invalidated" && claim.patchState === "not-needed" && claim.upstreamCoverage === "none") {
    lifecycleState = CLAIM_STATES.INVALIDATED;
    reason = "Current evidence invalidates the original defect or invariant, and no replacement patch is needed.";
  } else if (!unknown && claim.defectState === "resolved" && claim.patchState === "not-needed" && claim.upstreamCoverage === "equivalent") {
    lifecycleState = CLAIM_STATES.SUPERSEDED_EQUIVALENT;
    reason = "Equivalent upstream work resolved this atomic claim, so the original patch is no longer needed.";
  } else if (!unknown && claim.defectState === "present" && claim.upstreamCoverage === "none") {
    if (claim.patchState === "applies") {
      lifecycleState = CLAIM_STATES.CURRENT_AND_APPLICABLE;
      reason = "The defect remains present and the original patch still applies to the checked upstream state.";
    } else if (claim.patchState === "needs-rebase") {
      lifecycleState = CLAIM_STATES.DRIFTED_BUT_REBASEABLE;
      reason = "The defect remains present and the patch needs a bounded rebase or refresh.";
    } else if (claim.patchState === "stale") {
      lifecycleState = CLAIM_STATES.SALVAGEABLE_INVARIANT;
      reason = "The defect and invariant remain present, but the original implementation cannot be applied safely.";
    }
  }

  return { ...claim, lifecycleState, reason };
}

function aggregateClassification(claims) {
  const states = claims.map((claim) => claim.lifecycleState);
  if (states.includes(CLAIM_STATES.NEEDS_MAINTAINER_DECISION)) return "NEEDS_MAINTAINER_DECISION";
  const hasInvalidated = states.includes(CLAIM_STATES.INVALIDATED);
  if (hasInvalidated && states.some((state) => state !== CLAIM_STATES.INVALIDATED)) return "NEEDS_MAINTAINER_DECISION";
  if (hasInvalidated) return "INVALIDATED";

  const hasSuperseded = states.includes(CLAIM_STATES.SUPERSEDED_EQUIVALENT);
  const liveStates = new Set([
    CLAIM_STATES.CURRENT_AND_APPLICABLE,
    CLAIM_STATES.DRIFTED_BUT_REBASEABLE,
    CLAIM_STATES.SALVAGEABLE_INVARIANT
  ]);
  const hasLive = states.some((state) => liveStates.has(state));
  if (hasSuperseded && hasLive) return "PARTIALLY_SUPERSEDED";
  if (hasSuperseded) return "SUPERSEDED_EQUIVALENT";
  if (states.includes(CLAIM_STATES.SALVAGEABLE_INVARIANT)) return "SALVAGEABLE_INVARIANT";
  if (states.includes(CLAIM_STATES.DRIFTED_BUT_REBASEABLE)) return "DRIFTED_BUT_REBASEABLE";
  if (states.every((state) => state === CLAIM_STATES.CURRENT_AND_APPLICABLE)) return "CURRENT_AND_APPLICABLE";
  return "NEEDS_MAINTAINER_DECISION";
}

function normalizeOutcome(value, observedAt) {
  if (value === undefined) {
    return {
      recorded: false,
      recordedAt: "",
      state: "not-recorded",
      landingContribution: "",
      landingCommit: "",
      credit: "unknown",
      summary: "",
      usedForClassification: false,
      verification: "not-supplied"
    };
  }
  assertPlainObject(value, "Lifecycle outcome");
  assertAllowedKeys(value, ["recordedAt", "state", "landingContribution", "landingCommit", "credit", "summary"], "Lifecycle outcome");
  const recordedAt = requiredTime(value.recordedAt, "Lifecycle outcome.recordedAt");
  if (Date.parse(recordedAt) < Date.parse(observedAt)) {
    throw new ContributionLifecycleError("Lifecycle outcome.recordedAt cannot be earlier than observedAt.");
  }
  const state = requiredEnum(value.state, OUTCOME_STATES, "Lifecycle outcome.state");
  const landingContribution = optionalUrl(value.landingContribution, "Lifecycle outcome.landingContribution");
  const landingCommit = optionalCommit(value.landingCommit, "Lifecycle outcome.landingCommit");
  const credit = requiredEnum(value.credit, CREDIT_STATES, "Lifecycle outcome.credit");
  if (["landed-directly", "landed-by-salvage", "partially-salvaged"].includes(state) && (!landingContribution || !landingCommit)) {
    throw new ContributionLifecycleError(`Lifecycle outcome '${state}' requires landingContribution and landingCommit.`);
  }
  if (["commit-author", "co-author"].includes(credit) && !landingCommit) {
    throw new ContributionLifecycleError(`Lifecycle outcome credit '${credit}' requires landingCommit.`);
  }
  return {
    recorded: true,
    recordedAt,
    state,
    landingContribution,
    landingCommit,
    credit,
    summary: optionalString(value.summary, "Lifecycle outcome.summary", 4000),
    usedForClassification: false,
    verification: "caller-supplied; verify against the cited host before publishing"
  };
}

function buildSalvagePacket({ classification, repository, observedAt, originalContribution, currentUpstream, assessedClaims }) {
  const survivingStates = new Set([
    CLAIM_STATES.CURRENT_AND_APPLICABLE,
    CLAIM_STATES.DRIFTED_BUT_REBASEABLE,
    CLAIM_STATES.SALVAGEABLE_INVARIANT
  ]);
  const needed = ["DRIFTED_BUT_REBASEABLE", "SALVAGEABLE_INVARIANT", "PARTIALLY_SUPERSEDED"].includes(classification);
  return {
    needed,
    mode: needed ? LIFECYCLE_CLASSIFICATIONS[classification].nextAction : "none",
    repository,
    observedAt,
    originalContribution,
    currentUpstream,
    survivingClaims: assessedClaims.filter((claim) => survivingStates.has(claim.lifecycleState)).map(compactClaim),
    supersededClaims: assessedClaims.filter((claim) => claim.lifecycleState === CLAIM_STATES.SUPERSEDED_EQUIVALENT).map(compactClaim),
    invalidatedClaims: assessedClaims.filter((claim) => claim.lifecycleState === CLAIM_STATES.INVALIDATED).map(compactClaim),
    uncertainClaims: assessedClaims.filter((claim) => claim.lifecycleState === CLAIM_STATES.NEEDS_MAINTAINER_DECISION).map(compactClaim),
    requiredBeforeAction: needed ? [
      "Reproduce each surviving claim on the recorded current-upstream commit.",
      "Search current open and closed work for exact and semantic overlap.",
      "Preserve the original invariant and tests while replacing stale implementation details.",
      "Re-run contribution policy, diff-shape, and public-approval gates before publishing."
    ] : []
  };
}

function compactClaim(claim) {
  return {
    id: claim.id,
    title: claim.title,
    invariant: claim.invariant,
    originalReproduction: claim.originalReproduction,
    lifecycleState: claim.lifecycleState,
    evidence: claim.evidence
  };
}

function summarizeClaims(claims) {
  const byState = {};
  for (const state of Object.values(CLAIM_STATES)) byState[state] = 0;
  for (const claim of claims) byState[claim.lifecycleState] += 1;
  return { total: claims.length, byState };
}

function publicProofFor(outcome) {
  if (!outcome.recorded) {
    return {
      level: "none",
      guidance: "No later outcome was supplied. Do not make a landing or attribution claim from this assessment."
    };
  }
  if (outcome.credit === "commit-author") {
    return {
      level: "commit-author",
      guidance: `Supplied provenance records commit-author credit on ${outcome.landingCommit}. Verify that commit before publishing, and do not describe the original contribution as directly merged unless the original host record says so.`
    };
  }
  if (outcome.credit === "co-author") {
    return {
      level: "co-author",
      guidance: `Supplied provenance records co-author credit on ${outcome.landingCommit}. Verify that commit before publishing.`
    };
  }
  if (outcome.credit === "acknowledged") {
    return {
      level: "acknowledged",
      guidance: "Supplied provenance supports acknowledgment only, not commit authorship or a directly merged contribution claim."
    };
  }
  return {
    level: "unsupported",
    guidance: "The supplied outcome does not support a public authorship claim."
  };
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContributionLifecycleError(`${label} must be an object.`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) throw new ContributionLifecycleError(`${label} contains unsupported field '${unknown[0]}'.`);
}

function requiredRepository(value) {
  const repository = requiredString(value, "Lifecycle repository", 255);
  if (!REPOSITORY.test(repository)) throw new ContributionLifecycleError("Lifecycle repository must use owner/name format.");
  return repository;
}

function requiredIdentifier(value, label) {
  const normalized = requiredString(value, label, 128);
  if (!IDENTIFIER.test(normalized)) throw new ContributionLifecycleError(`${label} must be a stable identifier.`);
  return normalized;
}

function requiredString(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new ContributionLifecycleError(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ContributionLifecycleError(`${label} exceeds ${maxLength} characters.`);
  return normalized;
}

function optionalString(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requiredString(value, label, maxLength);
}

function requiredEnum(value, allowed, label) {
  const normalized = requiredString(value, label, 128);
  if (!allowed.has(normalized)) throw new ContributionLifecycleError(`${label} has unsupported value '${normalized}'.`);
  return normalized;
}

function requiredTime(value, label) {
  const normalized = requiredString(value, label, 128);
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new ContributionLifecycleError(`${label} must be an ISO-8601 timestamp.`);
  return new Date(timestamp).toISOString();
}

function optionalPositiveInteger(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isInteger(value) || value <= 0) throw new ContributionLifecycleError(`${label} must be a positive integer.`);
  return value;
}

function requiredCommit(value, label) {
  const normalized = requiredString(value, label, 64);
  if (!COMMIT.test(normalized)) throw new ContributionLifecycleError(`${label} must be a 7-64 character hexadecimal commit id.`);
  return normalized.toLowerCase();
}

function optionalCommit(value, label) {
  if (value === undefined || value === null || value === "") return "";
  return requiredCommit(value, label);
}

function requiredUrl(value, label) {
  const normalized = requiredString(value, label, 2000);
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("unsafe URL");
    return parsed.toString();
  } catch {
    throw new ContributionLifecycleError(`${label} must be a public HTTP(S) URL without embedded credentials.`);
  }
}

function optionalUrl(value, label) {
  if (value === undefined || value === null || value === "") return "";
  return requiredUrl(value, label);
}

function markdownText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

function markdownCell(value) {
  return markdownText(value).replace(/\|/g, "\\|");
}
