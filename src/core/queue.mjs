import { evaluateContribution } from "./evaluator.mjs";

export const QUEUE_VERSION = "2026.05.31";
export const DEFAULT_QUEUE_LIMIT = 25;
export const MAX_QUEUE_LIMIT = 100;

export const NEXT_ACTIONS = {
  "review-now": {
    id: "review-now",
    title: "Review now",
    target: "maintainer",
    owner: "maintainer",
    order: 10,
    summary: "Ready for maintainer review.",
    maintainerAction: "Start normal review now."
  },
  "ask-reporter-for-evidence": {
    id: "ask-reporter-for-evidence",
    title: "Ask reporter",
    target: "reporter",
    owner: "reporter",
    order: 20,
    summary: "Ask the submitter for missing evidence, verification, or clearer reproduction details.",
    maintainerAction: "Send a focused repair request to the submitter."
  },
  "check-duplicate-or-fixed-first": {
    id: "check-duplicate-or-fixed-first",
    title: "Check duplicate or fixed first",
    target: "maintainer",
    owner: "maintainer",
    order: 30,
    summary: "Check related, duplicate, solved, concurrent, or upstream-fixed work before spending fresh review time.",
    maintainerAction: "Check related, solved, concurrent, or upstream-fixed work before fresh review."
  },
  "route-to-subsystem-or-process": {
    id: "route-to-subsystem-or-process",
    title: "Route to subsystem or process",
    target: "maintainer/process",
    owner: "process",
    order: 40,
    summary: "Route through the repository's subsystem, policy, ownership, or project process before normal review.",
    maintainerAction: "Route through the right owner, subsystem, policy, or contribution process."
  },
  "needs-maintainer-decision": {
    id: "needs-maintainer-decision",
    title: "Needs maintainer decision",
    target: "maintainer",
    owner: "maintainer",
    order: 50,
    summary: "Requires maintainer judgment because the next step is not obvious from reporter evidence alone.",
    maintainerAction: "Make a judgment call; PCF cannot reduce the next move further."
  },
  "not-actionable-yet": {
    id: "not-actionable-yet",
    title: "Not actionable yet",
    target: "external-state",
    owner: "external-state",
    order: 60,
    summary: "No useful maintainer action is available until external state changes.",
    maintainerAction: "Wait or leave parked until the external blocker changes."
  }
};

const RESPONSE_TEMPLATES = {
  "review-now": {
    title: "Review-now maintainer note",
    audience: "maintainer",
    channel: "maintainer-note",
    summary: "Internal note for work that can enter normal review."
  },
  "ask-reporter-for-evidence": {
    title: "Reporter repair request",
    audience: "reporter",
    channel: "github-comment-draft",
    summary: "Comment draft asking the submitter for the missing evidence PCF found."
  },
  "check-duplicate-or-fixed-first": {
    title: "Duplicate or fixed-first check",
    audience: "maintainer",
    channel: "maintainer-note",
    summary: "Internal note for checking related, solved, concurrent, or upstream-fixed work before fresh review."
  },
  "route-to-subsystem-or-process": {
    title: "Routing and process note",
    audience: "maintainer/process",
    channel: "maintainer-note",
    summary: "Internal note for routing the item through the right owner, repository, subsystem, or contribution process."
  },
  "needs-maintainer-decision": {
    title: "Maintainer decision note",
    audience: "maintainer",
    channel: "maintainer-note",
    summary: "Internal note for judgment calls that PCF cannot safely reduce to a reporter request."
  },
  "not-actionable-yet": {
    title: "Parked or blocked note",
    audience: "maintainer",
    channel: "maintainer-note",
    summary: "Internal note for work that should stay out of active review until external state changes."
  }
};

const STATUS_ORDER = {
  "ready-for-maintainer": 0,
  "needs-repair": 1,
  "low-review-value": 2
};

const STATUS_ACTIONS = {
  "ready-for-maintainer": "review-now",
  "needs-repair": "send-repair-request",
  "low-review-value": "do-not-review-yet"
};

const CONTEXT_NEXT_ACTION_LABELS = new Set([
  "possibly-duplicate",
  "possibly-solved",
  "linked-issue-closed",
  "concurrent-work",
  "possibly-upstream-fixed"
]);

const ROUTE_NEXT_ACTION_LABELS = new Set([
  "wrong-repository",
  "policy-failed",
  "needs-maintainer-targeting",
  "drive-by-risk",
  "kernel-subject-discipline",
  "needs-series-split"
]);

const NOT_ACTIONABLE_NEXT_ACTION_LABELS = new Set([
  "maintainer-backlog",
  "maintainer-pending-clarification",
  "draft-pr"
]);

const MAINTAINER_DECISION_NEXT_ACTION_LABELS = new Set([
  "maintainer-approved",
  "maintainer-authored"
]);

const REPORTER_EVIDENCE_NEXT_ACTION_LABELS = new Set([
  "needs-clear-summary",
  "needs-context",
  "too-broad",
  "suspicious-path",
  "needs-tests",
  "needs-human-verification",
  "ci-missing",
  "ci-failed",
  "dependency-review",
  "generated-artifact-review",
  "secrets-risk",
  "prompt-injection-risk",
  "maintainer-attention-risk",
  "needs-reproducer",
  "needs-use-case",
  "needs-feature-solution",
  "needs-feature-scope",
  "needs-expected-actual",
  "needs-environment",
  "needs-logs",
  "duplicate-search-needed",
  "needs-technical-analysis",
  "security-claim-needs-reproducer",
  "needs-real-evidence",
  "needs-project-test-command",
  "needs-dco-signoff",
  "needs-patch-rationale",
  "needs-fixes-tag",
  "stable-discipline-failed",
  "needs-kernel-build-evidence",
  "needs-tool-provenance",
  "review-budget-high"
]);

export function buildMaintainerQueue(payload = {}, options = {}) {
  const limit = clampLimit(payload.limit ?? options.limit ?? DEFAULT_QUEUE_LIMIT);
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
  const items = rawItems.slice(0, limit).map((item, index) => evaluateQueueItem(item, {
    index,
    profile: item.profile || payload.profile || options.profile,
    feedbackCalibration: item.feedbackCalibration || payload.feedbackCalibration || options.feedbackCalibration
  }));
  const sortedItems = items.sort(compareQueueItems);
  const summary = summarizeQueue(sortedItems);
  const nextActionGroups = buildNextActionGroups(sortedItems);

  return {
    ok: true,
    name: "Premature Contribution Firewall Maintainer Queue",
    version: QUEUE_VERSION,
    dryRun: payload.dryRun !== false,
    source: payload.source || options.source || "supplied",
    repository: String(payload.repository || options.repository || ""),
    upstreamRepository: String(payload.upstreamRepository || options.upstreamRepository || ""),
    limit,
    truncated: rawItems.length > limit,
    generatedAt: options.now || new Date().toISOString(),
    summary,
    nextActionGroups,
    items: sortedItems,
    markdown: formatMaintainerQueueMarkdown({
      repository: String(payload.repository || options.repository || ""),
      upstreamRepository: String(payload.upstreamRepository || options.upstreamRepository || ""),
      summary,
      nextActionGroups,
      items: sortedItems
    })
  };
}

export function evaluateQueueItem(rawItem = {}, { index = 0, profile = "", feedbackCalibration = null } = {}) {
  const input = normalizeQueueInput(rawItem);
  const evaluation = evaluateContribution(input, {
    profile: profile || input.profile,
    feedbackCalibration
  });
  const signals = queueSignals(evaluation);
  const id = String(rawItem.id || input.id || `${input.kind}-${input.number || index + 1}`);
  const action = STATUS_ACTIONS[evaluation.status] || "inspect";
  const nextAction = classifyNextAction(evaluation, { coarseAction: action });

  const item = {
    id,
    index,
    kind: evaluation.kind,
    number: input.number || "",
    title: input.title,
    repository: input.repository || "",
    htmlUrl: input.htmlUrl || "",
    authorAssociation: input.authorAssociation || "",
    updatedAt: input.updatedAt || "",
    status: evaluation.status,
    action,
    nextAction,
    score: evaluation.score,
    labels: evaluation.labels,
    topReasons: signals.topReasons,
    contextSummary: evaluation.repositoryContext?.summary || "No repository context supplied.",
    contextFindings: evaluation.repositoryContext?.findings?.length || 0,
    calibration: publicQueueCalibration(evaluation.calibration),
    reviewBudget: evaluation.reviewBudget,
    blockerCount: evaluation.blockers.length,
    failureCount: evaluation.checks.filter((check) => check.status === "fail").length,
    warningCount: evaluation.checks.filter((check) => check.status === "warn").length,
    fixtureInput: buildFixtureInput(input),
    evaluation
  };
  item.responseTemplate = buildResponseTemplate(item);
  return item;
}

export function normalizeQueueInput(rawItem = {}) {
  const input = rawItem.input && typeof rawItem.input === "object" ? rawItem.input : rawItem;
  return {
    ...input,
    kind: input.kind || input.type || "pull_request",
    title: String(input.title || ""),
    body: String(input.body || ""),
    repository: input.repository || rawItem.repository || "",
    number: input.number || rawItem.number || "",
    id: rawItem.id || input.id || "",
    htmlUrl: input.htmlUrl || input.html_url || rawItem.htmlUrl || rawItem.html_url || "",
    updatedAt: input.updatedAt || input.updated_at || rawItem.updatedAt || rawItem.updated_at || "",
    files: Array.isArray(input.files) ? input.files : [],
    checks: Array.isArray(input.checks) ? input.checks : [],
    repositoryContext: input.repositoryContext || input.repoContext || rawItem.repositoryContext || rawItem.repoContext || null
  };
}

export function formatMaintainerQueueMarkdown(queue = {}) {
  const summary = queue.summary || summarizeQueue(queue.items || []);
  const nextActionGroups = queue.nextActionGroups || buildNextActionGroups(queue.items || []);
  const repositoryLine = queue.repository ? `Repository: ${queue.repository}` : "Repository: not specified";
  const upstreamLine = queue.upstreamRepository ? `Upstream: ${queue.upstreamRepository}` : "";
  const lines = [
    "# Premature Contribution Firewall Maintainer Queue",
    "",
    repositoryLine,
    upstreamLine,
    "",
    `Total: ${summary.total}`,
    `Ready: ${summary.statuses["ready-for-maintainer"] || 0}`,
    `Needs repair: ${summary.statuses["needs-repair"] || 0}`,
    `Low review value: ${summary.statuses["low-review-value"] || 0}`,
    `Estimated review budget: ${summary.reviewBudgetMinutes} minutes`,
    `Repository context findings: ${summary.contextFindings}`,
    `Feedback calibration matches: ${summary.calibrationMatches}`,
    "",
    "## Queue"
  ].filter((line) => line !== "");
  const nextActionLines = formatCountLines(summary.nextActions);
  if (nextActionLines.length) {
    lines.splice(lines.length - 1, 0, "Next actions:", ...nextActionLines.map((line) => `- ${line}`), "");
  }
  const laneLines = nextActionGroups
    .filter((group) => group.count > 0)
    .map((group) => `- ${group.id}: ${group.count} item(s), owner ${group.owner}, next maintainer move: ${group.maintainerAction}`);
  if (laneLines.length) {
    lines.splice(lines.length - 1, 0, "Next action lanes:", ...laneLines, "");
  }

  for (const item of queue.items || []) {
    const number = item.number ? `#${item.number} ` : "";
    const reasons = item.topReasons?.length
      ? item.topReasons.map((reason) => `  - ${reason.status}: ${reason.title} - ${reason.reason}`).join("\n")
      : "  - No repair reasons.";
    lines.push(
      "",
      `### ${number}${item.title || "Untitled"}`,
      `- Kind: ${item.kind}`,
      `- Status: ${item.status} (${item.score}/100)`,
      `- Action: ${item.action}`,
      `- Next action: ${formatNextAction(item.nextAction)}`,
      `- Labels: ${item.labels?.length ? item.labels.map((label) => `\`${label}\``).join(", ") : "none"}`,
      `- Context: ${item.contextSummary || "none"}`,
      `- Feedback calibration: ${item.calibration?.active ? item.calibration.summary : "none"}`,
      `- Review budget: ${item.reviewBudget?.minutes ?? "n/a"} minutes`,
      "- Reasons:",
      reasons,
      "- Response draft:",
      ...formatResponseTemplateMarkdown(item.responseTemplate)
    );
  }

  return `${lines.join("\n")}\n`;
}

function summarizeQueue(items) {
  const summary = {
    total: items.length,
    statuses: {},
    kinds: {},
    labels: {},
    actions: {},
    nextActions: {},
    nextActionOwners: {},
    repairSubActions: {},
    ready: 0,
    needsRepair: 0,
    lowReviewValue: 0,
    blockers: 0,
    failures: 0,
    warnings: 0,
    contextFindings: 0,
    calibrationMatches: 0,
    calibrationReviewNeeded: 0,
    reviewBudgetMinutes: 0
  };

  for (const item of items) {
    summary.statuses[item.status] = (summary.statuses[item.status] || 0) + 1;
    summary.kinds[item.kind] = (summary.kinds[item.kind] || 0) + 1;
    summary.actions[item.action] = (summary.actions[item.action] || 0) + 1;
    const nextActionId = item.nextAction?.id || "unknown";
    summary.nextActions[nextActionId] = (summary.nextActions[nextActionId] || 0) + 1;
    const nextActionOwner = item.nextAction?.owner || item.nextAction?.target || "unknown";
    summary.nextActionOwners[nextActionOwner] = (summary.nextActionOwners[nextActionOwner] || 0) + 1;
    if (item.action !== "review-now") {
      summary.repairSubActions[nextActionId] = (summary.repairSubActions[nextActionId] || 0) + 1;
    }
    if (item.status === "ready-for-maintainer") summary.ready += 1;
    if (item.status === "needs-repair") summary.needsRepair += 1;
    if (item.status === "low-review-value") summary.lowReviewValue += 1;
    summary.blockers += item.blockerCount || 0;
    summary.failures += item.failureCount || 0;
    summary.warnings += item.warningCount || 0;
    summary.contextFindings += item.contextFindings || 0;
    summary.calibrationMatches += item.calibration?.matches || 0;
    if (item.calibration?.status === "review-needed") summary.calibrationReviewNeeded += 1;
    summary.reviewBudgetMinutes += item.reviewBudget?.minutes || 0;
    for (const label of item.labels || []) {
      summary.labels[label] = (summary.labels[label] || 0) + 1;
    }
  }

  return summary;
}

function buildNextActionGroups(items = []) {
  return Object.values(NEXT_ACTIONS)
    .sort((left, right) => (left.order || 99) - (right.order || 99))
    .map((action) => {
      const groupItems = items.filter((item) => item.nextAction?.id === action.id);
      return {
        id: action.id,
        title: action.title,
        target: action.target,
        owner: action.owner,
        summary: action.summary,
        maintainerAction: action.maintainerAction,
        order: action.order,
        count: groupItems.length,
        reviewBudgetMinutes: groupItems.reduce((total, item) => total + (item.reviewBudget?.minutes || 0), 0),
        itemIds: groupItems.map((item) => item.id),
        responseTemplate: buildLaneResponseTemplate(action, groupItems)
      };
    });
}

export function buildResponseTemplate(item = {}) {
  const nextAction = item.nextAction || NEXT_ACTIONS["needs-maintainer-decision"];
  const id = nextAction.id || "needs-maintainer-decision";
  const template = RESPONSE_TEMPLATES[id] || RESPONSE_TEMPLATES["needs-maintainer-decision"];
  const checklist = buildResponseChecklist(item, nextAction);
  const evidence = buildResponseEvidence(item, nextAction);
  const body = renderResponseBody(id, { item, nextAction, template, checklist, evidence });

  return {
    id,
    title: template.title,
    audience: template.audience,
    channel: template.channel,
    dryRun: true,
    posting: "disabled",
    shouldPost: false,
    summary: template.summary,
    body,
    checklist,
    evidence
  };
}

function buildLaneResponseTemplate(action = {}, items = []) {
  const template = RESPONSE_TEMPLATES[action.id] || RESPONSE_TEMPLATES["needs-maintainer-decision"];
  const itemRefs = items.slice(0, 6).map((item) => itemReference(item));
  const bodyLines = [
    `PCF dry-run lane: ${action.title || action.id}.`,
    "",
    `Items in lane: ${items.length}.`,
    `Owner: ${action.owner || action.target || "unknown"}.`,
    `Suggested maintainer move: ${action.maintainerAction || action.summary || "Inspect this lane."}`,
    itemRefs.length ? `Items: ${itemRefs.join(", ")}.` : "Items: none in the current queue.",
    "",
    "Use the item-level draft before copying anything into GitHub.",
    "No comments, labels, closures, merges, or other GitHub writes were made automatically."
  ];

  return {
    id: action.id || "unknown",
    title: `${template.title} lane summary`,
    audience: template.audience,
    channel: "lane-summary",
    dryRun: true,
    posting: "disabled",
    shouldPost: false,
    summary: template.summary,
    body: bodyLines.join("\n"),
    checklist: itemRefs,
    evidence: {
      itemIds: items.map((item) => item.id),
      labels: uniqueStrings(items.flatMap((item) => item.nextAction?.evidence?.labels || [])),
      reasons: uniqueStrings(items.flatMap((item) => item.nextAction?.evidence?.reasons || []))
    }
  };
}

function buildResponseChecklist(item = {}, nextAction = {}) {
  const id = nextAction.id || "";
  const reasonItems = (item.topReasons || [])
    .slice(0, 4)
    .map((reason) => `${reason.title}: ${reason.reason}`.trim());
  const labelItems = (nextAction.evidence?.labels || [])
    .slice(0, 4)
    .map((label) => `Route label: ${label}`);

  if (id === "ask-reporter-for-evidence") {
    return uniqueStrings(reasonItems.length ? reasonItems : [
      ...labelItems,
      "Add the missing reproduction, evidence, verification, or scope details before maintainer review."
    ]).slice(0, 5);
  }
  if (id === "check-duplicate-or-fixed-first") {
    return uniqueStrings([
      item.contextSummary && item.contextSummary !== "No repository context supplied." ? item.contextSummary : "",
      ...labelItems,
      "Check linked, duplicate, concurrent, solved, and upstream-fixed work before fresh review."
    ]).slice(0, 5);
  }
  if (id === "route-to-subsystem-or-process") {
    return uniqueStrings([
      ...labelItems,
      ...reasonItems,
      "Route through the repository owner, subsystem, template, or process before normal review."
    ]).slice(0, 5);
  }
  if (id === "needs-maintainer-decision") {
    return uniqueStrings([
      ...labelItems,
      ...reasonItems,
      "Maintainer judgment is required before asking the reporter for more work."
    ]).slice(0, 5);
  }
  if (id === "not-actionable-yet") {
    return uniqueStrings([
      ...labelItems,
      ...reasonItems,
      "Keep this out of active review until the external blocker changes."
    ]).slice(0, 5);
  }
  return uniqueStrings([
    item.contextSummary && item.contextSummary !== "No repository context supplied." ? item.contextSummary : "",
    ...labelItems,
    ...reasonItems,
    "Start normal maintainer review."
  ]).slice(0, 5);
}

function buildResponseEvidence(item = {}, nextAction = {}) {
  return {
    labels: uniqueStrings([...(item.labels || []), ...(nextAction.evidence?.labels || [])]).slice(0, 8),
    checks: Array.isArray(nextAction.evidence?.checks) ? nextAction.evidence.checks.slice(0, 6) : [],
    reasons: uniqueStrings(nextAction.evidence?.reasons || []).slice(0, 6),
    topReasons: (item.topReasons || []).slice(0, 4).map((reason) => ({
      id: reason.id || "",
      title: reason.title || "",
      status: reason.status || "",
      label: reason.label || "",
      reason: reason.reason || ""
    })),
    contextSummary: item.contextSummary || "",
    calibrationSummary: item.calibration?.active ? item.calibration.summary : ""
  };
}

function renderResponseBody(id, { item, nextAction, checklist }) {
  const ref = itemReference(item);
  const title = item.title || "Untitled";
  const contextLine = item.contextSummary && item.contextSummary !== "No repository context supplied."
    ? `Repository context: ${item.contextSummary}`
    : "";
  const evidenceLine = evidenceLabelsLine(nextAction);
  const checklistLines = checklist.length
    ? checklist.map((entry) => `- ${entry}`)
    : ["- No additional evidence line was generated."];
  const dryRunLines = [
    "",
    "PCF dry-run note: No comments, labels, closures, merges, or other GitHub writes were made automatically."
  ];

  if (id === "ask-reporter-for-evidence") {
    return [
      `PCF dry-run triage for ${ref}: this needs repair before maintainer review.`,
      "",
      "Please add or clarify the missing evidence below:",
      ...checklistLines,
      "",
      "Once this is updated, a maintainer can review the issue without reconstructing the reproducer, evidence, or scope from scratch.",
      ...dryRunLines
    ].join("\n");
  }
  if (id === "check-duplicate-or-fixed-first") {
    return [
      `PCF dry-run triage for ${ref}: check related or already-fixed work before fresh review.`,
      "",
      `Item: ${title}`,
      contextLine,
      evidenceLine,
      "",
      "Suggested maintainer move:",
      ...checklistLines,
      "",
      "After that check, close/link as duplicate, ask for version verification, or move it into normal review if the context signal is wrong.",
      ...dryRunLines
    ].filter(Boolean).join("\n");
  }
  if (id === "route-to-subsystem-or-process") {
    return [
      `PCF dry-run triage for ${ref}: route this through project process before normal review.`,
      "",
      `Item: ${title}`,
      evidenceLine,
      "",
      "Suggested maintainer move:",
      ...checklistLines,
      "",
      "Use the repository's ownership, subsystem, issue-template, or contribution policy before asking for generic evidence.",
      ...dryRunLines
    ].filter(Boolean).join("\n");
  }
  if (id === "needs-maintainer-decision") {
    return [
      `PCF dry-run triage for ${ref}: maintainer judgment is needed.`,
      "",
      `Item: ${title}`,
      evidenceLine,
      contextLine,
      "",
      "Suggested maintainer move:",
      ...checklistLines,
      "",
      "Do not send a generic repair request until a maintainer decides which path is actually useful.",
      ...dryRunLines
    ].filter(Boolean).join("\n");
  }
  if (id === "not-actionable-yet") {
    return [
      `PCF dry-run triage for ${ref}: this should stay out of active review for now.`,
      "",
      `Item: ${title}`,
      evidenceLine,
      "",
      "Suggested maintainer move:",
      ...checklistLines,
      "",
      "Revisit only when the external state changes or a maintainer explicitly reopens the lane.",
      ...dryRunLines
    ].filter(Boolean).join("\n");
  }
  return [
    `PCF dry-run triage for ${ref}: ready for maintainer review.`,
    "",
    `Item: ${title}`,
    evidenceLine,
    contextLine,
    "",
    "Suggested maintainer move:",
    ...checklistLines,
    "",
    "Start normal review. PCF found no higher-priority repair, routing, duplicate, or wait-state blocker.",
    ...dryRunLines
  ].filter(Boolean).join("\n");
}

function evidenceLabelsLine(nextAction = {}) {
  const labels = nextAction.evidence?.labels || [];
  return labels.length ? `Route evidence: ${labels.join(", ")}.` : "";
}

function itemReference(item = {}) {
  const kind = item.kind || "item";
  const number = item.number ? `#${item.number}` : item.id || "";
  return [kind, number].filter(Boolean).join(" ");
}

function publicQueueCalibration(calibration) {
  if (!calibration?.active) {
    return {
      active: false,
      status: "none",
      summary: "",
      matches: 0,
      evidence: {}
    };
  }
  return {
    active: true,
    status: calibration.status,
    summary: calibration.summary,
    matches: calibration.matches?.length || 0,
    evidence: calibration.evidence || {},
    pressure: calibration.pressure || {}
  };
}

function queueSignals(evaluation) {
  const failed = evaluation.checks.filter((check) => check.status === "fail");
  const warned = evaluation.checks.filter((check) => check.status === "warn");
  const topReasons = [...evaluation.blockers, ...failed, ...warned]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 4)
    .map((check) => ({
      id: check.id,
      title: check.title,
      status: check.status,
      label: check.label,
      reason: check.reason
    }));
  return { topReasons };
}

export function classifyNextAction(evaluation = {}, { coarseAction = "" } = {}) {
  const labels = new Set(evaluation.labels || []);
  const checkLabels = (evaluation.checks || [])
    .filter((check) => check.status === "fail" || check.status === "warn")
    .map((check) => check.label)
    .filter(Boolean);
  const allLabels = new Set([...labels, ...checkLabels]);

  if (allLabels.has("feedback-calibration-needed")) {
    return nextAction("needs-maintainer-decision", "Maintainer feedback conflicts with the current heuristic result.", {
      labels: ["feedback-calibration-needed"],
      checks: checksForLabels(evaluation.checks, ["feedback-calibration-needed"])
    });
  }
  if (coarseAction === "review-now" || evaluation.status === "ready-for-maintainer") {
    return nextAction("review-now", "", {
      labels: matchingLabels(allLabels, new Set(["ready-for-maintainer"])),
      reasons: ["Coarse queue action is review-now."]
    });
  }
  if (hasAny(allLabels, CONTEXT_NEXT_ACTION_LABELS)) {
    const evidenceLabels = matchingLabels(allLabels, CONTEXT_NEXT_ACTION_LABELS);
    return nextAction("check-duplicate-or-fixed-first", reasonFromLabels(allLabels, CONTEXT_NEXT_ACTION_LABELS, "Repository context label") || "Repository context found related work that should be checked first.", {
      labels: evidenceLabels,
      checks: checksForLabels(evaluation.checks, evidenceLabels)
    });
  }
  if (hasAny(allLabels, ROUTE_NEXT_ACTION_LABELS)) {
    const evidenceLabels = matchingLabels(allLabels, ROUTE_NEXT_ACTION_LABELS);
    return nextAction("route-to-subsystem-or-process", reasonFromLabels(allLabels, ROUTE_NEXT_ACTION_LABELS, "Routing or process label") || "Repository process or ownership should route this before normal review.", {
      labels: evidenceLabels,
      checks: checksForLabels(evaluation.checks, evidenceLabels)
    });
  }
  if (hasAny(allLabels, NOT_ACTIONABLE_NEXT_ACTION_LABELS)) {
    const evidenceLabels = matchingLabels(allLabels, NOT_ACTIONABLE_NEXT_ACTION_LABELS);
    return nextAction("not-actionable-yet", reasonFromLabels(allLabels, NOT_ACTIONABLE_NEXT_ACTION_LABELS, "Blocked or parked label") || "Repository state says this is blocked or already parked.", {
      labels: evidenceLabels,
      checks: checksForLabels(evaluation.checks, evidenceLabels)
    });
  }
  if (hasAny(allLabels, MAINTAINER_DECISION_NEXT_ACTION_LABELS)) {
    const evidenceLabels = matchingLabels(allLabels, MAINTAINER_DECISION_NEXT_ACTION_LABELS);
    return nextAction("needs-maintainer-decision", reasonFromLabels(allLabels, MAINTAINER_DECISION_NEXT_ACTION_LABELS, "Maintainer-owned label") || "Repository maintainer ownership or approval requires maintainer judgment.", {
      labels: evidenceLabels,
      checks: checksForLabels(evaluation.checks, evidenceLabels)
    });
  }
  if (hasAny(allLabels, REPORTER_EVIDENCE_NEXT_ACTION_LABELS)) {
    const evidenceLabels = matchingLabels(allLabels, REPORTER_EVIDENCE_NEXT_ACTION_LABELS);
    return nextAction("ask-reporter-for-evidence", reasonFromLabels(allLabels, REPORTER_EVIDENCE_NEXT_ACTION_LABELS, "Reporter evidence label") || "The submitter needs to provide missing evidence before review.", {
      labels: evidenceLabels,
      checks: checksForLabels(evaluation.checks, evidenceLabels)
    });
  }
  if (evaluation.status === "low-review-value") {
    return nextAction("not-actionable-yet", "The item is below the threshold for useful maintainer action.", {
      reasons: ["Status is low-review-value."]
    });
  }
  return nextAction("needs-maintainer-decision", "PCF could not reduce this item to a reporter, context, routing, or wait action.", {
    reasons: ["No higher-precedence next-action label matched."]
  });
}

function nextAction(id, reason = "", evidence = {}) {
  const action = NEXT_ACTIONS[id] || NEXT_ACTIONS["needs-maintainer-decision"];
  const effectiveReason = reason || action.summary;
  return {
    ...action,
    reason: effectiveReason,
    evidence: normalizeNextActionEvidence(evidence, effectiveReason)
  };
}

function hasAny(labels, candidates) {
  for (const label of candidates) {
    if (labels.has(label)) return true;
  }
  return false;
}

function reasonFromLabels(labels, candidates, prefix) {
  for (const label of labels) {
    if (candidates.has(label)) return `${prefix}: ${label}.`;
  }
  return "";
}

function matchingLabels(labels, candidates) {
  return [...labels].filter((label) => candidates.has(label));
}

function checksForLabels(checks = [], labels = []) {
  const wanted = new Set(labels);
  return (checks || [])
    .filter((check) => wanted.has(check.label))
    .map((check) => ({
      id: check.id || "",
      title: check.title || "",
      status: check.status || "",
      label: check.label || ""
    }));
}

function normalizeNextActionEvidence(evidence = {}, reason = "") {
  return {
    labels: uniqueStrings(evidence.labels),
    checks: Array.isArray(evidence.checks) ? evidence.checks.slice(0, 6) : [],
    reasons: uniqueStrings([...(evidence.reasons || []), reason].filter(Boolean))
  };
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildFixtureInput(input = {}) {
  return {
    kind: input.kind || "pull_request",
    profile: input.profile || "",
    title: input.title || "",
    body: input.body || "",
    repository: input.repository || "",
    number: input.number || "",
    htmlUrl: input.htmlUrl || "",
    updatedAt: input.updatedAt || "",
    authorAssociation: input.authorAssociation || "",
    draft: Boolean(input.draft),
    changedFiles: Number(input.changedFiles || 0),
    additions: Number(input.additions || 0),
    deletions: Number(input.deletions || 0),
    files: Array.isArray(input.files) ? input.files : [],
    checks: Array.isArray(input.checks) ? input.checks : [],
    repositoryFiles: Array.isArray(input.repositoryFiles) ? input.repositoryFiles : [],
    repositoryContext: input.repositoryContext || null,
    contributingText: input.contributingText || ""
  };
}

function compareQueueItems(left, right) {
  const statusDelta = (STATUS_ORDER[left.status] ?? 99) - (STATUS_ORDER[right.status] ?? 99);
  if (statusDelta !== 0) return statusDelta;
  if (right.contextFindings !== left.contextFindings) return right.contextFindings - left.contextFindings;
  if ((left.reviewBudget?.minutes || 0) !== (right.reviewBudget?.minutes || 0)) {
    return (left.reviewBudget?.minutes || 0) - (right.reviewBudget?.minutes || 0);
  }
  return right.score - left.score;
}

function formatNextAction(nextAction) {
  if (!nextAction?.id) return "unknown";
  const evidence = nextAction.evidence?.labels?.length ? ` Evidence: ${nextAction.evidence.labels.join(", ")}.` : "";
  const action = nextAction.maintainerAction ? ` Next: ${nextAction.maintainerAction}` : "";
  return `${nextAction.id} (${nextAction.target || "unknown"}) - ${nextAction.reason || nextAction.summary || ""}${action}${evidence}`.trim();
}

function formatResponseTemplateMarkdown(template = {}) {
  if (!template.body) return ["  > No response draft generated."];
  const header = `  > ${template.title || "Response draft"} (${template.audience || "unknown"}, ${template.channel || "unknown"}, dry-run).`;
  const body = String(template.body)
    .split("\n")
    .map((line) => `  > ${line}`);
  return [header, ...body];
}

function formatCountLines(counts = {}) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${label}: ${count}`);
}

function clampLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_QUEUE_LIMIT;
  return Math.max(1, Math.min(MAX_QUEUE_LIMIT, Math.floor(numeric)));
}
