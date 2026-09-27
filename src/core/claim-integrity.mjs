import { createHash } from "node:crypto";

export const CLAIM_INTEGRITY_VERSION = "2026-09-27";

const PASS = new Set(["pass", "passed", "ready", "fixed", "verified", "success", "accepted"]);
const FAIL = new Set(["fail", "failed", "blocked", "rejected", "regression", "unsafe"]);
const INCONCLUSIVE = new Set(["inconclusive", "unknown", "not-evaluated", "not_evaluated", "not-executed", "not_executed", "review"]);
const HIGH_RISK = new Set(["high", "critical", "security", "kernel", "concurrency", "memory-safety", "memory_safety", "serious"]);
const NO_SURFACE_STATES = new Set(["none", "absent", "empty", "contentless", "unserved", "unavailable", "no-surface", "no_surface"]);
const ROUTE_STATES = new Set(["contributor", "maintainer", "shared", "not-applicable", "not_applicable", "unknown"]);
const CATALOGUE_STATES = new Set(["eligible", "ineligible", "unknown", "not-applicable", "not_applicable"]);

export function evaluateClaimIntegrity(input = {}) {
  input = plainObject(input);
  const claim = normalizeClaim(input.claim || input);
  const surface = normalizeSurface(input.surface || input.evidenceSurface || {});
  const controls = normalizeControls(input.controls || {}, claim);
  const evidence = normalizeEvidence(input.evidence || []);
  const rootCause = normalizeRootCause(input.rootCause || {});
  const routing = normalizeRouting(input.routing || input.routeOwnership || {});
  const freshness = normalizeFreshness(input.freshness || {}, input.generatedAt || input.observedAt || "");
  const independence = normalizeIndependence(input.independence || input.evaluatorIndependence || {});
  const blockers = [];
  const warnings = [];

  if (!claim.statement) {
    blockers.push(blocker("missing-claim", "A claim statement is required before evidence can be judged."));
  }

  if (!surface.observable) {
    blockers.push(blocker("missing-evidence-surface", "The claim does not name an observable surface that could make the verdict right or wrong."));
  }

  if (NO_SURFACE_STATES.has(surface.state) && isDecisiveVerdict(claim.assertedVerdict)) {
    blockers.push(blocker(
      "verdict-without-surface",
      `The claim asserts ${claim.assertedVerdict.toUpperCase()} while the supplied evidence surface is explicitly absent.`
    ));
  } else if (surface.state === "unknown" && isDecisiveVerdict(claim.assertedVerdict)) {
    warnings.push(warning(
      "surface-unverified",
      "The claim asserts a decisive verdict, but whether the target exposed a judgeable surface is unknown."
    ));
  }

  const allEvidence = [
    ...evidence,
    ...controls.positive.evidence,
    ...controls.negative.evidence
  ];
  for (const kind of surface.requiredEvidenceKinds) {
    if (!allEvidence.some((item) => item.kind === kind && isAuthoritativeEvidence(item) && isTangibleEvidence(item))) {
      blockers.push(blocker(
        "required-evidence-kind-missing",
        `Required authoritative evidence kind '${kind}' is missing or is only caller-asserted.`,
        { kind }
      ));
    }
  }

  const authority = resolveEvidenceAuthority(evidence, blockers, warnings);
  evaluateRootCause({ claim, rootCause, blockers, warnings });
  evaluateControls({ claim, controls, blockers, warnings });
  evaluateGeneralization({ claim, blockers, warnings });
  evaluateRouting({ routing, freshness, blockers, warnings });
  evaluateFreshness({ freshness, blockers, warnings });
  evaluateIndependence({ independence, blockers, warnings });

  const status = blockers.length ? "blocked" : warnings.length ? "review" : "pass";
  const evidencePaths = unique([
    ...evidence.map((item) => item.path).filter(Boolean),
    ...controls.positive.evidence.map((item) => item.path).filter(Boolean),
    ...controls.negative.evidence.map((item) => item.path).filter(Boolean),
    ...independence.evidence.map((item) => item.path).filter(Boolean)
  ]);

  const assessment = {
    artifact: "pcf-claim-integrity-assessment",
    version: CLAIM_INTEGRITY_VERSION,
    status,
    ok: status === "pass",
    summary: summarize({ status, blockers, warnings }),
    claim,
    surface,
    controls,
    rootCause,
    routing,
    freshness,
    independence,
    evidence,
    authority,
    blockers,
    warnings,
    gate: {
      status,
      verified: false,
      reason: summarize({ status, blockers, warnings }),
      evidence: evidencePaths.map((path) => ({ path, kind: "claim-integrity-evidence" })),
      updatedAt: input.generatedAt || input.observedAt || new Date().toISOString()
    },
    nonClaims: [
      "Claim integrity evaluates the structure and discriminating power of supplied evidence; it does not execute commands or authenticate artifacts.",
      "A pass does not prove the patch is correct, safe, mergeable, wanted, or endorsed.",
      "Observed evidence outranks caller claims only inside this supplied record; PCF does not independently fetch the underlying source."
    ]
  };
  assessment.assessmentSha256 = sha256(stableObject({
    version: assessment.version,
    claim,
    surface,
    controls,
    rootCause,
    routing,
    freshness,
    independence,
    evidence,
    authority,
    blockers,
    warnings
  }));
  return assessment;
}

export function claimIntegritySchemaResource() {
  return {
    version: CLAIM_INTEGRITY_VERSION,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "PCF Claim Integrity Input",
      type: "object",
      required: ["claim", "surface", "controls"],
      properties: {
        claim: {
          type: "object",
          required: ["statement"],
          properties: {
            id: { type: "string" },
            statement: { type: "string", minLength: 1 },
            assertedVerdict: { type: "string" },
            scope: { type: "string" },
            risk: { type: "string" },
            twoSided: { type: "boolean" },
            generalization: {
              type: "object",
              properties: {
                statement: { type: "string" },
                asserted: { type: "boolean" },
                testedShapes: { type: "array", items: { type: "string" } },
                untestedShapes: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        surface: {
          type: "object",
          required: ["observable"],
          properties: {
            observable: { type: "string", minLength: 1 },
            state: { type: "string" },
            requiredEvidenceKinds: { type: "array", items: { type: "string" } }
          }
        },
        controls: {
          type: "object",
          properties: {
            oneSidedReason: { type: "string" },
            positive: { "$ref": "#/$defs/control" },
            negative: { "$ref": "#/$defs/control" }
          }
        },
        evidence: { type: "array", items: { "$ref": "#/$defs/evidence" } },
        rootCause: { type: "object" },
        routing: { type: "object" },
        freshness: { type: "object" },
        independence: {
          type: "object",
          properties: {
            required: { type: "boolean" },
            requiredGroups: { type: "number", minimum: 1 },
            supportedGroups: { type: "number", minimum: 0 },
            basis: { type: "string", enum: ["declared", "observed", "external", "mixed", "unknown"] },
            evidence: { type: "array", items: { "$ref": "#/$defs/evidence" } }
          }
        },
        generatedAt: { type: "string" }
      },
      $defs: {
        control: {
          type: "object",
          properties: {
            description: { type: "string" },
            expectedVerdict: { type: "string" },
            observedVerdict: { type: "string" },
            executed: { type: "boolean" },
            evidence: { type: "array", items: { "$ref": "#/$defs/evidence" } }
          }
        },
        evidence: {
          type: "object",
          properties: {
            key: { type: "string" },
            kind: { type: "string" },
            source: { type: "string", enum: ["observed", "external", "derived", "claimed"] },
            value: {},
            path: { type: "string" },
            digest: { type: "string" },
            command: { type: "string" },
            exitCode: { type: ["integer", "null"] },
            observationId: { type: "string" }
          }
        }
      }
    },
    doctrine: {
      authorityOrder: ["observed", "external", "derived", "claimed"],
      twoSidedRule: "When the contract permits both outcomes, preserve a served PASS control and a served FAIL control.",
      surfaceRule: "No decisive verdict without an observable surface sufficient to support that verdict.",
      freshnessRule: "Required freshness fails closed when time bounds are missing, malformed, future-dated, or stale.",
      independenceRule: "Self-declared evaluator labels do not establish independent verification; required independence needs tangible non-claimed evidence for enough supported groups."
    }
  };
}

function normalizeClaim(value) {
  const claim = plainObject(value);
  const generalization = plainObject(claim.generalization);
  return {
    id: text(claim.id),
    statement: text(claim.statement || claim.claim || claim.summary),
    assertedVerdict: normalizeVerdict(claim.assertedVerdict || claim.verdict || claim.outcome),
    scope: text(claim.scope || claim.boundary),
    risk: normalize(claim.risk || claim.severity || "normal"),
    twoSided: claim.twoSided !== false,
    oneSidedReason: text(claim.oneSidedReason),
    generalization: {
      statement: text(generalization.statement || claim.generalizedInvariant),
      asserted: generalization.asserted === true || claim.assertsGeneralInvariant === true,
      testedShapes: strings(generalization.testedShapes || claim.testedShapes),
      untestedShapes: strings(generalization.untestedShapes || claim.untestedShapes)
    }
  };
}

function normalizeSurface(value) {
  const surface = plainObject(value);
  return {
    observable: text(surface.observable || surface.description || surface.surface),
    state: normalize(surface.state || surface.status || "unknown"),
    requiredEvidenceKinds: strings(surface.requiredEvidenceKinds || surface.requires || surface.requiredKinds)
  };
}

function normalizeControls(value, claim) {
  const controls = plainObject(value);
  const positive = normalizeControl(controls.positive || controls.pass || {}, "pass");
  const negative = normalizeControl(controls.negative || controls.fail || {}, "fail");
  return {
    required: claim.twoSided,
    oneSidedReason: text(controls.oneSidedReason || claim.oneSidedReason),
    positive,
    negative
  };
}

function normalizeControl(value, defaultVerdict) {
  const control = plainObject(value);
  return {
    description: text(control.description || control.summary || control.name),
    expectedVerdict: normalizeVerdict(control.expectedVerdict || control.expected || defaultVerdict),
    observedVerdict: normalizeVerdict(control.observedVerdict || control.observed || control.verdict || control.status),
    executed: control.executed === true || control.ran === true,
    evidence: normalizeEvidence(control.evidence || control.artifacts || [])
  };
}

function normalizeEvidence(values) {
  return (Array.isArray(values) ? values : [values])
    .map((raw) => {
      const item = plainObject(raw);
      return {
        key: text(item.key || item.field || item.name),
        kind: normalize(item.kind || item.type || "evidence"),
        source: normalizeEvidenceSource(item.source || item.authority || "claimed"),
        value: item.value ?? item.observedValue ?? item.claimedValue ?? null,
        path: text(item.path || item.uri || item.url),
        digest: text(item.digest || item.sha256 || item.hash),
        command: text(item.command || item.cmd),
        exitCode: normalizeExitCode(item.exitCode ?? item.code),
        observationId: text(item.observationId || item.eventId || item.id),
        summary: text(item.summary || item.note)
      };
    })
    .filter((item) => item.key || item.path || item.digest || item.command || item.observationId || item.summary || item.value !== null);
}

function normalizeRootCause(value) {
  const root = plainObject(value);
  return {
    required: root.required === true,
    symptom: text(root.symptom),
    reachability: text(root.reachability || root.callPath || root.path),
    invariant: text(root.invariant || root.rootCause),
    patchMechanism: text(root.patchMechanism || root.fixMechanism || root.change)
  };
}

function normalizeRouting(value) {
  const routing = plainObject(value);
  return {
    intendedAction: normalize(routing.intendedAction || routing.action),
    contributionOwner: normalizeRouteState(routing.contributionOwner),
    releaseOwner: normalizeRouteState(routing.releaseOwner),
    backportOwner: normalizeRouteState(routing.backportOwner),
    catalogueEligibility: normalizeCatalogueState(routing.catalogueEligibility),
    checkedAt: text(routing.checkedAt),
    evidencePath: text(routing.evidencePath || routing.path)
  };
}

function normalizeIndependence(value) {
  const independence = plainObject(value);
  const requiredGroupsRaw = independence.requiredGroups ?? independence.minimumGroups ?? 2;
  const supportedGroupsRaw = independence.supportedGroups ?? independence.verifiedGroups ?? independence.independentGroups;
  const requiredGroups = Number(requiredGroupsRaw);
  const supportedGroups = supportedGroupsRaw === undefined || supportedGroupsRaw === null || supportedGroupsRaw === ""
    ? null
    : Number(supportedGroupsRaw);
  const basis = normalize(independence.basis || independence.authority || "unknown");
  return {
    required: independence.required === true,
    requiredGroups,
    supportedGroups,
    basis: ["declared", "observed", "external", "mixed", "unknown"].includes(basis) ? basis : "unknown",
    evidence: normalizeEvidence(independence.evidence || independence.artifacts || []),
    requiredGroupsValid: Number.isFinite(requiredGroups) && requiredGroups >= 1,
    supportedGroupsValid: supportedGroups === null || (Number.isFinite(supportedGroups) && supportedGroups >= 0)
  };
}

function normalizeFreshness(value, fallbackAsOf) {
  const freshness = plainObject(value);
  const supplied = freshness.maxAgeHours !== undefined && freshness.maxAgeHours !== null && freshness.maxAgeHours !== "";
  const parsed = supplied ? Number(freshness.maxAgeHours) : 168;
  return {
    required: freshness.required === true,
    checkedAt: text(freshness.checkedAt),
    asOf: text(freshness.asOf || fallbackAsOf),
    maxAgeHours: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    maxAgeHoursSupplied: supplied,
    maxAgeHoursValid: Number.isFinite(parsed) && parsed >= 0,
    failOnStale: freshness.failOnStale !== false
  };
}

function evaluateRootCause({ claim, rootCause, blockers, warnings }) {
  const required = rootCause.required || HIGH_RISK.has(claim.risk);
  const fields = [
    ["symptom", rootCause.symptom],
    ["reachability", rootCause.reachability],
    ["invariant", rootCause.invariant],
    ["patchMechanism", rootCause.patchMechanism]
  ];
  const missing = fields.filter(([, value]) => !value).map(([name]) => name);
  if (required && missing.length) {
    blockers.push(blocker(
      "root-cause-chain-incomplete",
      `High-risk claim is missing root-cause chain field(s): ${missing.join(", ")}.`,
      { missing }
    ));
  } else if (!required && missing.length && claim.assertedVerdict) {
    warnings.push(warning(
      "root-cause-chain-partial",
      `Claim has a verdict but the root-cause chain is incomplete: ${missing.join(", ")}.`,
      { missing }
    ));
  }
}

function evaluateControls({ claim, controls, blockers, warnings }) {
  if (!claim.twoSided) {
    if (!controls.oneSidedReason) {
      blockers.push(blocker(
        "one-sided-contract-unjustified",
        "A one-sided claim contract must state why the opposite verdict is intentionally unreachable."
      ));
    }
    const chosen = controls.positive.description || controls.positive.evidence.length ? controls.positive : controls.negative;
    if (!controlHasTangibleExecution(chosen)) {
      blockers.push(blocker("one-sided-control-missing", "The declared one-sided contract still needs one executed, tangible control."));
    }
    return;
  }

  for (const [name, control, expected] of [
    ["positive", controls.positive, "pass"],
    ["negative", controls.negative, "fail"]
  ]) {
    if (!control.description && !control.evidence.length && !control.observedVerdict) {
      blockers.push(blocker(`missing-${name}-control`, `Two-sided claim requires a ${name} control.`));
      continue;
    }
    if (!control.executed) {
      blockers.push(blocker(`${name}-control-not-executed`, `The ${name} control was not marked as executed.`));
    }
    if (!controlHasTangibleEvidence(control)) {
      blockers.push(blocker(`${name}-control-unsubstantiated`, `The ${name} control lacks a command result, digest, observation id, or concrete artifact path.`));
    }
    if (!control.observedVerdict) {
      blockers.push(blocker(`${name}-control-no-verdict`, `The ${name} control has no observed verdict.`));
    } else if (normalizeVerdict(control.observedVerdict) !== expected) {
      blockers.push(blocker(
        `${name}-verdict-unreachable`,
        `The ${name} control should reach ${expected.toUpperCase()} but observed ${displayVerdict(control.observedVerdict)}.`
      ));
    }
  }

  if (controls.positive.observedVerdict && controls.negative.observedVerdict
      && normalizeVerdict(controls.positive.observedVerdict) === normalizeVerdict(controls.negative.observedVerdict)) {
    blockers.push(blocker(
      "controls-do-not-discriminate",
      "Positive and negative controls collapse to the same verdict; the proof mechanism does not distinguish the safe and unsafe poles."
    ));
  }

  if (isInconclusive(controls.positive.observedVerdict) || isInconclusive(controls.negative.observedVerdict)) {
    warnings.push(warning(
      "control-reachability-residue",
      "At least one control is INCONCLUSIVE. A declared verdict pole may be unreachable."
    ));
  }
}

function evaluateGeneralization({ claim, blockers, warnings }) {
  const g = claim.generalization;
  if (!g.statement) return;
  if (!g.testedShapes.length) {
    const entry = g.asserted
      ? blocker("generalization-unfalsified", "A generalized invariant is asserted, but no adjacent target shape or boundary case was tested.")
      : warning("generalization-untested", "A broader invariant is described, but no adjacent target shape or boundary case was tested.");
    (g.asserted ? blockers : warnings).push(entry);
  }
  if (g.untestedShapes.length) {
    const entry = g.asserted
      ? blocker("generalization-has-untested-shapes", `The generalized invariant still names untested shapes: ${g.untestedShapes.join(", ")}.`)
      : warning("generalization-boundary-open", `Adjacent shapes remain untested: ${g.untestedShapes.join(", ")}.`);
    (g.asserted ? blockers : warnings).push(entry);
  }
}

function evaluateRouting({ routing, freshness, blockers, warnings }) {
  const action = routing.intendedAction;
  if (!action) return;

  if (action === "mainline" && routing.contributionOwner === "maintainer") {
    blockers.push(blocker("contribution-owned-by-maintainer", "The intended mainline contribution is recorded as maintainer-owned."));
  }
  if (action === "backport" && routing.backportOwner === "maintainer") {
    blockers.push(blocker("backport-owned-by-maintainer", "Backport routing is maintainer-owned; do not open a contributor backport without invitation."));
  }
  if (action === "release" && routing.releaseOwner === "maintainer") {
    blockers.push(blocker("release-owned-by-maintainer", "Release work is maintainer-owned; stop before publishing release-side work."));
  }
  if (action === "catalogue" && routing.catalogueEligibility === "ineligible") {
    blockers.push(blocker("catalogue-shape-ineligible", "The target catalogue's product-shape boundary says this artifact is ineligible."));
  }

  const ownerState = action === "backport"
    ? routing.backportOwner
    : action === "release"
      ? routing.releaseOwner
      : routing.contributionOwner;
  if (!ownerState || ownerState === "unknown") {
    warnings.push(warning("route-ownership-unknown", `Ownership for intended action '${action}' is unknown.`));
  }
  if (!routing.checkedAt && freshness.required) {
    blockers.push(blocker("route-ownership-not-timestamped", "Fresh routing/ownership evidence is required, but routing.checkedAt is missing."));
  }
  if (!routing.evidencePath && freshness.required) {
    blockers.push(blocker("route-ownership-unsubstantiated", "Fresh routing/ownership evidence is required, but no evidencePath was supplied."));
  }
}

function evaluateFreshness({ freshness, blockers, warnings }) {
  if (!freshness.checkedAt) {
    if (freshness.required) blockers.push(blocker("freshness-check-missing", "Freshness is required, but checkedAt is missing."));
    return;
  }
  if (!freshness.asOf) {
    const entry = freshness.required
      ? blocker("freshness-asof-missing", "Freshness is required, but no asOf time was supplied, so evidence age cannot be measured.")
      : warning("freshness-asof-missing", "checkedAt is present but no asOf time was supplied, so evidence age cannot be measured.");
    (freshness.required ? blockers : warnings).push(entry);
    return;
  }
  if (!freshness.maxAgeHoursValid) {
    blockers.push(blocker("freshness-max-age-invalid", "maxAgeHours must be a finite non-negative number; invalid bounds cannot establish freshness."));
    return;
  }
  const checked = Date.parse(freshness.checkedAt);
  const asOf = Date.parse(freshness.asOf);
  if (!Number.isFinite(checked) || !Number.isFinite(asOf)) {
    blockers.push(blocker("freshness-time-invalid", "Freshness timestamps must be valid ISO-compatible times."));
    return;
  }
  if (checked > asOf) {
    blockers.push(blocker("freshness-time-from-future", "checkedAt cannot be later than the assessment asOf time."));
    return;
  }
  const ageHours = (asOf - checked) / 3_600_000;
  if (ageHours > freshness.maxAgeHours) {
    const entry = freshness.failOnStale
      ? blocker("context-evidence-stale", `Routing/overlap context is ${ageHours.toFixed(1)}h old, above the ${freshness.maxAgeHours}h limit.`, { ageHours })
      : warning("context-evidence-stale", `Routing/overlap context is ${ageHours.toFixed(1)}h old, above the ${freshness.maxAgeHours}h limit.`, { ageHours });
    (freshness.failOnStale ? blockers : warnings).push(entry);
  }
}

function evaluateIndependence({ independence, blockers, warnings }) {
  const hasSignal = independence.required
    || independence.supportedGroups !== null
    || independence.basis !== "unknown"
    || independence.evidence.length;
  if (!hasSignal) return;

  if (!independence.requiredGroupsValid) {
    blockers.push(blocker("independence-required-groups-invalid", "requiredGroups must be a finite number of at least one."));
    return;
  }
  if (!independence.supportedGroupsValid) {
    blockers.push(blocker("independence-supported-groups-invalid", "supportedGroups must be a finite non-negative number when supplied."));
    return;
  }

  const tangible = independence.evidence.some((item) => isAuthoritativeEvidence(item) && isTangibleEvidence(item));
  if (independence.required && !tangible) {
    blockers.push(blocker(
      "independence-evidence-missing",
      "Independent verification is required, but no tangible non-claimed provenance evidence supports the grouping."
    ));
  }

  if (independence.required && ["declared", "unknown"].includes(independence.basis)) {
    blockers.push(blocker(
      "independence-declared-only",
      "Self-declared evaluator labels do not establish independent verification."
    ));
  } else if (!independence.required && independence.basis === "declared") {
    warnings.push(warning(
      "independence-declared-only",
      "Evaluator grouping is based only on declared labels and must not be described as authenticated independence."
    ));
  }

  if (independence.required && independence.supportedGroups === null) {
    blockers.push(blocker("independence-count-missing", "Independent verification is required, but supportedGroups is missing."));
  } else if (independence.supportedGroups !== null && independence.supportedGroups < independence.requiredGroups) {
    const entry = independence.required
      ? blocker("independence-insufficient-groups", `Only ${independence.supportedGroups}/${independence.requiredGroups} independently supported group(s) are recorded.`)
      : warning("independence-insufficient-groups", `Only ${independence.supportedGroups}/${independence.requiredGroups} independently supported group(s) are recorded.`);
    (independence.required ? blockers : warnings).push(entry);
  }
}

function resolveEvidenceAuthority(evidence, blockers, warnings) {
  const byKey = new Map();
  for (const item of evidence) {
    if (!item.key) continue;
    const rows = byKey.get(item.key) || [];
    rows.push(item);
    byKey.set(item.key, rows);
  }
  const resolved = {};
  for (const [key, items] of byKey) {
    const ranked = [...items].sort((a, b) => authorityRank(a.source) - authorityRank(b.source));
    const authoritative = ranked[0];
    resolved[key] = {
      source: authoritative.source,
      value: authoritative.value,
      path: authoritative.path,
      digest: authoritative.digest,
      observationId: authoritative.observationId
    };

    const topRank = authorityRank(authoritative.source);
    const topValues = ranked.filter((item) => authorityRank(item.source) === topRank).map((item) => stableValue(item.value));
    if (new Set(topValues).size > 1) {
      blockers.push(blocker(
        "authoritative-evidence-conflict",
        `Authoritative evidence for '${key}' disagrees with itself.`,
        { key }
      ));
    }

    const observedLike = ranked.filter((item) => item.source !== "claimed");
    const claimed = ranked.filter((item) => item.source === "claimed");
    if (observedLike.length && claimed.length) {
      const authorityValue = stableValue(authoritative.value);
      const conflicting = claimed.some((item) => stableValue(item.value) !== authorityValue);
      if (conflicting) {
        blockers.push(blocker(
          "observed-claim-conflict",
          `Caller claim for '${key}' conflicts with higher-authority evidence; the observed value wins.`,
          { key, authoritativeSource: authoritative.source }
        ));
      }
    }
    if (!observedLike.length && claimed.length) {
      warnings.push(warning(
        "claim-only-evidence",
        `Evidence key '${key}' is caller-claimed only and has no observed/external/derived authority.`,
        { key }
      ));
    }
  }
  return resolved;
}

function controlHasTangibleExecution(control) {
  return control.executed && controlHasTangibleEvidence(control) && Boolean(control.observedVerdict);
}

function controlHasTangibleEvidence(control) {
  return control.evidence.some((item) => isAuthoritativeEvidence(item) && isTangibleEvidence(item));
}

function isTangibleEvidence(item) {
  return Boolean(item.path || item.digest || item.observationId || (item.command && item.exitCode !== null));
}

function isAuthoritativeEvidence(item) {
  return item.source !== "claimed";
}

function normalizeEvidenceSource(value) {
  const source = normalize(value);
  return ["observed", "external", "derived", "claimed"].includes(source) ? source : "claimed";
}

function authorityRank(source) {
  if (source === "observed") return 0;
  if (source === "external") return 1;
  if (source === "derived") return 2;
  return 3;
}

function normalizeRouteState(value) {
  const state = normalize(value || "unknown");
  return ROUTE_STATES.has(state) ? state.replace("_", "-") : "unknown";
}

function normalizeCatalogueState(value) {
  const state = normalize(value || "unknown");
  return CATALOGUE_STATES.has(state) ? state.replace("_", "-") : "unknown";
}

function normalizeVerdict(value) {
  const verdict = normalize(value);
  if (PASS.has(verdict)) return "pass";
  if (FAIL.has(verdict)) return "fail";
  if (INCONCLUSIVE.has(verdict)) return "inconclusive";
  return verdict;
}

function isDecisiveVerdict(value) {
  const verdict = normalizeVerdict(value);
  return verdict === "pass" || verdict === "fail";
}

function isInconclusive(value) {
  return normalizeVerdict(value) === "inconclusive";
}

function displayVerdict(value) {
  return normalizeVerdict(value || "missing").toUpperCase();
}

function blocker(id, reason, details = {}) {
  return { id, severity: "blocker", reason, ...details };
}

function warning(id, reason, details = {}) {
  return { id, severity: "warning", reason, ...details };
}

function summarize({ status, blockers, warnings }) {
  if (status === "blocked") return `Blocked: ${blockers.length} claim-integrity blocker(s), ${warnings.length} warning(s).`;
  if (status === "review") return `Review: ${warnings.length} claim-integrity warning(s).`;
  return "Pass: the supplied claim has a judgeable surface, discriminating controls, and no unresolved integrity blocker.";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function strings(values) {
  return unique((Array.isArray(values) ? values : [values]).map(text).filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function normalizeExitCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function stableValue(value) {
  return JSON.stringify(stableObject(value));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
