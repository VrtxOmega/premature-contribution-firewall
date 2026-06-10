import { resolveShieldedPosture } from "./shielded-posture.mjs";
import { analyzeBehavioralSignals } from "./behavioral-signals.mjs";
import { buildAuthorContext } from "./author-context.mjs";
import { analyzeVouchContext } from "./vouch-context.mjs";
import { validateIssueFormCompliance } from "./issue-form-validator.mjs";
import { buildSemanticDuplicateAssist } from "./semantic-duplicate-assist.mjs";
import { buildPolicyProfile } from "./policy.mjs";
import { formatReadinessComment } from "../github/templates.mjs";

const ISSUE_LINK = /\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#\d+\b|github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i;

export function enrichWithMaintainerStack(input = {}, baseResult = {}, options = {}, env = process.env) {
  const posture = resolveShieldedPosture(options, env);
  if (!posture.stackEnabled) {
    return {
      ...baseResult,
      shieldedPosture: publicShieldedPosture(posture),
      maintainerStack: null,
      readinessComment: ""
    };
  }

  const policyProfile = baseResult.policyProfile?.hasPolicy
    ? baseResult.policyProfile
    : publicPolicyProfile(buildPolicyProfile(input));
  const authorContext = posture.authorContext ? buildAuthorContext(input) : null;
  const layers = {};

  if (posture.behavioralSignals) {
    layers.behavioral = analyzeBehavioralSignals(input, authorContext);
  }
  if (posture.authorContext) {
    layers.author = authorContext || buildAuthorContext(input);
  }
  if (posture.vouchContext) {
    layers.vouch = analyzeVouchContext(input, layers.author?.login || input.author || input.authorLogin || "");
  }
  if (posture.strictIssueForms && input.kind === "issue") {
    layers.issueForm = validateIssueFormCompliance(input, policyProfile);
  }
  if (posture.semanticDuplicateAssist) {
    layers.duplicateAssist = buildSemanticDuplicateAssist(input, baseResult.repositoryContext);
  }

  const linkedIssue = evaluateMissingLinkedIssue(input, policyProfile);
  const enriched = applyStackEffects(baseResult, layers, linkedIssue, posture);
  const maintainerStack = publicMaintainerStack(layers, linkedIssue);

  return {
    ...enriched,
    shieldedPosture: publicShieldedPosture(posture),
    maintainerStack,
    readinessComment: formatReadinessComment({
      result: enriched,
      posture,
      maintainerStack
    })
  };
}

function evaluateMissingLinkedIssue(input = {}, policyProfile = null) {
  if (input.kind !== "pull_request" && input.kind !== "pull request") {
    return {
      enabled: false,
      checkStatus: "pass",
      labels: [],
      summary: "Linked-issue policy applies to pull requests only."
    };
  }

  const requiresIssueLink = Boolean(policyProfile?.requires?.issueLink);
  if (!requiresIssueLink) {
    return {
      enabled: false,
      checkStatus: "pass",
      labels: [],
      summary: "Repository policy does not require a linked issue."
    };
  }

  const body = String(input.body || "");
  const hasIssueLink = ISSUE_LINK.test(body);
  if (hasIssueLink) {
    return {
      enabled: true,
      checkStatus: "pass",
      labels: [],
      summary: "Pull request links to an issue as required by repository policy."
    };
  }

  return {
    enabled: true,
    checkStatus: "fail",
    labels: ["missing-linked-issue"],
    summary: "Repository policy requires a linked issue, but the pull request body does not reference one."
  };
}

function applyStackEffects(baseResult = {}, layers = {}, linkedIssue = null, posture = {}) {
  const checks = [...(baseResult.checks || [])];
  const labels = new Set(baseResult.labels || []);
  let score = Number(baseResult.score) || 0;
  let status = baseResult.status || "needs-repair";

  if (layers.behavioral?.enabled) {
    mergeLayerCheck(checks, labels, {
      id: "behavioral-signals",
      title: "Behavioral slop and rapid-submission signals",
      status: layers.behavioral.checkStatus,
      label: "behavioral-risk",
      labels: layers.behavioral.labels,
      penalty: behavioralPenalty(layers.behavioral.checkStatus),
      reason: layers.behavioral.summary
    });
    for (const label of layers.behavioral.labels || []) labels.add(label);
  }

  if (layers.issueForm?.enabled) {
    mergeLayerCheck(checks, labels, {
      id: "issue-form-compliance",
      title: "Issue form compliance",
      status: layers.issueForm.checkStatus,
      label: "issue-form-incomplete",
      labels: layers.issueForm.labels,
      penalty: layers.issueForm.checkStatus === "fail" ? 14 : layers.issueForm.checkStatus === "warn" ? 8 : 0,
      reason: layers.issueForm.summary
    });
    for (const label of layers.issueForm.labels || []) labels.add(label);
  }

  if (linkedIssue?.enabled) {
    mergeLayerCheck(checks, labels, {
      id: "linked-issue-policy",
      title: "Linked issue policy",
      status: linkedIssue.checkStatus,
      label: "missing-linked-issue",
      labels: linkedIssue.labels,
      penalty: linkedIssue.checkStatus === "fail" ? 16 : 0,
      blocking: linkedIssue.checkStatus === "fail",
      reason: linkedIssue.summary
    });
    for (const label of linkedIssue.labels || []) labels.add(label);
  }

  const stackChecks = checks.slice(baseResult.checks?.length || 0);
  const addedPenalty = stackChecks.reduce((sum, check) => sum + (check.status === "pass" ? 0 : check.penalty || 0), 0);
  score = Math.max(0, Math.min(100, score - addedPenalty));
  status = reclassifyStatus(status, score, checks, posture);

  const publicChecks = checks.map(publicCheck);
  const blockers = publicChecks.filter((check) => check.status === "fail" && check.blocking);

  return {
    ...baseResult,
    status,
    score,
    labels: [...labels],
    checks: publicChecks,
    blockers,
    repairSteps: mergeRepairSteps(baseResult.repairSteps, stackChecks),
    summary: appendStackSummary(baseResult.summary, layers, linkedIssue, posture)
  };
}

function behavioralPenalty(checkStatus) {
  if (checkStatus === "fail") return 18;
  if (checkStatus === "warn") return 8;
  return 0;
}

function mergeLayerCheck(checks, labels, check) {
  const repair = repairForStack(check);
  const normalized = {
    blocking: false,
    penalty: check.status === "pass" ? 0 : check.penalty || 0,
    ...check,
    repair
  };
  checks.push(normalized);
  if (normalized.status !== "pass" && normalized.label) labels.add(normalized.label);
  for (const label of normalized.labels || []) {
    if (normalized.status !== "pass" && label) labels.add(label);
  }
}

function reclassifyStatus(currentStatus, score, checks, posture) {
  const blocking = checks.some((check) => check.status === "fail" && check.blocking);
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  if (blocking || score < 50) return "low-review-value";
  if (score >= 80 && failures === 0 && warnings === 0) return "ready-for-maintainer";
  if (currentStatus === "ready-for-maintainer" && failures === 0 && warnings === 0 && score >= 80) {
    return "ready-for-maintainer";
  }
  if (posture.assuranceLevel === "high" && failures > 0 && score < 80) return "needs-repair";
  return currentStatus === "low-review-value" ? "low-review-value" : "needs-repair";
}

function mergeRepairSteps(existing = [], checks = []) {
  const repairs = [...(existing || [])];
  for (const check of checks) {
    if (check.status !== "pass" && check.repair) repairs.push(check.repair);
  }
  return unique(repairs);
}

function appendStackSummary(summary = "", layers = {}, linkedIssue = null, posture = {}) {
  const parts = [summary].filter(Boolean);
  if (posture.shielded) {
    parts.push(`Shielded maintainer stack active (${posture.assuranceLabel}).`);
  } else if (posture.stackEnabled) {
    parts.push(`Maintainer stack active (${posture.assuranceLabel}).`);
  }
  if (layers.behavioral?.findings?.length) {
    parts.push(`Behavioral context: ${layers.behavioral.findings.length} signal(s).`);
  }
  if (layers.vouch?.configured && layers.vouch.status !== "unknown") {
    parts.push(`Vouch context: ${layers.vouch.status}.`);
  }
  if (linkedIssue?.checkStatus === "fail") {
    parts.push("Repository policy requires a linked issue.");
  }
  return parts.join(" ");
}

function repairForStack(check) {
  const map = {
    "behavioral-risk": "Tighten the description, branch naming, and submission pacing so maintainers can trust the change narrative.",
    "rapid-submission": "Slow down large submissions; split work and explain verification between commits.",
    "high-pr-volume": "Reduce burst PR volume or coordinate with maintainers before flooding the queue.",
    "issue-form-incomplete": "Complete the required issue template sections before requesting maintainer attention.",
    "missing-linked-issue": "Link the pull request to the issue it fixes using Fixes #123 or an explicit issue URL."
  };
  return map[check.label] || "";
}

function publicCheck(check) {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    reason: check.reason,
    label: check.label,
    blocking: Boolean(check.blocking),
    repair: check.repair || ""
  };
}

function publicShieldedPosture(posture = {}) {
  return {
    shielded: Boolean(posture.shielded),
    stackEnabled: Boolean(posture.stackEnabled),
    assuranceLevel: posture.assuranceLevel || "standard",
    assuranceLabel: posture.assuranceLabel || "Standard assurance",
    stackVersion: posture.stackVersion || "",
    dryRunRequired: Boolean(posture.dryRunRequired),
    writesDisabled: Boolean(posture.writesDisabled),
    layers: {
      behavioralSignals: Boolean(posture.behavioralSignals),
      authorContext: Boolean(posture.authorContext),
      vouchContext: Boolean(posture.vouchContext),
      semanticDuplicateAssist: Boolean(posture.semanticDuplicateAssist),
      strictIssueForms: Boolean(posture.strictIssueForms)
    },
    nonClaims: posture.nonClaims || []
  };
}

function publicMaintainerStack(layers = {}, linkedIssue = null) {
  return {
    behavioral: publicBehavioralLayer(layers.behavioral),
    author: publicAuthorLayer(layers.author),
    vouch: publicVouchLayer(layers.vouch),
    issueForm: publicIssueFormLayer(layers.issueForm),
    duplicateAssist: publicDuplicateAssistLayer(layers.duplicateAssist),
    linkedIssue: linkedIssue?.enabled
      ? {
          enabled: true,
          checkStatus: linkedIssue.checkStatus,
          labels: linkedIssue.labels || [],
          summary: linkedIssue.summary
        }
      : null,
    summary: summarizeMaintainerStack(layers, linkedIssue)
  };
}

function publicBehavioralLayer(layer) {
  if (!layer) return null;
  return {
    enabled: Boolean(layer.enabled),
    checkStatus: layer.checkStatus || "pass",
    labels: layer.labels || [],
    findings: (layer.findings || []).slice(0, 8),
    summary: layer.summary || ""
  };
}

function publicAuthorLayer(layer) {
  if (!layer?.enabled) return null;
  return {
    enabled: true,
    login: layer.login || "",
    association: layer.association || "",
    trustBand: layer.trustBand || "unknown",
    signals: layer.signals || [],
    maintainerContextOnly: true,
    summary: layer.summary || ""
  };
}

function publicVouchLayer(layer) {
  if (!layer) return null;
  return {
    enabled: Boolean(layer.enabled),
    configured: Boolean(layer.configured),
    status: layer.status || "not-configured",
    login: layer.login || "",
    path: layer.path || "",
    summary: layer.summary || ""
  };
}

function publicIssueFormLayer(layer) {
  if (!layer?.enabled) return null;
  return {
    enabled: true,
    checkStatus: layer.checkStatus || "pass",
    labels: layer.labels || [],
    missingSections: layer.missingSections || [],
    summary: layer.summary || ""
  };
}

function publicDuplicateAssistLayer(layer) {
  if (!layer) return null;
  return {
    enabled: Boolean(layer.enabled),
    degraded: Boolean(layer.degraded),
    deterministic: Boolean(layer.deterministic),
    suggestions: (layer.suggestions || []).slice(0, 5),
    summary: layer.summary || "",
    nonClaims: layer.nonClaims || []
  };
}

function summarizeMaintainerStack(layers = {}, linkedIssue = null) {
  const parts = [];
  if (layers.behavioral?.enabled) parts.push(`behavioral=${layers.behavioral.checkStatus}`);
  if (layers.author?.enabled) parts.push(`author trust=${layers.author.trustBand}`);
  if (layers.vouch?.configured) parts.push(`vouch=${layers.vouch.status}`);
  if (layers.issueForm?.enabled) parts.push(`issue-form=${layers.issueForm.checkStatus}`);
  if (layers.duplicateAssist?.enabled) parts.push(`duplicate-assist=${layers.duplicateAssist.suggestions?.length || 0}`);
  if (linkedIssue?.enabled && linkedIssue.checkStatus !== "pass") parts.push(`linked-issue=${linkedIssue.checkStatus}`);
  return parts.length ? `Maintainer stack: ${parts.join(", ")}.` : "Maintainer stack layers attached.";
}

function publicPolicyProfile(policyProfile) {
  return {
    hasPolicy: Boolean(policyProfile?.hasPolicy),
    summary: policyProfile?.summary || "no repository policy supplied",
    sources: policyProfile?.sources || [],
    requiredSections: policyProfile?.requiredSections || [],
    testCommands: policyProfile?.testCommands || [],
    requires: policyProfile?.requires || {},
    ownerMatches: (policyProfile?.ownerMatches || []).slice(0, 20),
    maintainerMatches: (policyProfile?.maintainerMatches || []).slice(0, 20)
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}