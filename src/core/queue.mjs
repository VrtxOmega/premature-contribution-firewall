import { evaluateContribution } from "./evaluator.mjs";

export const QUEUE_VERSION = "2026.05.30";
export const DEFAULT_QUEUE_LIMIT = 25;
export const MAX_QUEUE_LIMIT = 100;

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

export function buildMaintainerQueue(payload = {}, options = {}) {
  const limit = clampLimit(payload.limit ?? options.limit ?? DEFAULT_QUEUE_LIMIT);
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
  const items = rawItems.slice(0, limit).map((item, index) => evaluateQueueItem(item, {
    index,
    profile: item.profile || payload.profile || options.profile
  }));
  const sortedItems = items.sort(compareQueueItems);
  const summary = summarizeQueue(sortedItems);

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
    items: sortedItems,
    markdown: formatMaintainerQueueMarkdown({
      repository: String(payload.repository || options.repository || ""),
      upstreamRepository: String(payload.upstreamRepository || options.upstreamRepository || ""),
      summary,
      items: sortedItems
    })
  };
}

export function evaluateQueueItem(rawItem = {}, { index = 0, profile = "" } = {}) {
  const input = normalizeQueueInput(rawItem);
  const evaluation = evaluateContribution(input, {
    profile: profile || input.profile
  });
  const signals = queueSignals(evaluation);
  const id = String(rawItem.id || input.id || `${input.kind}-${input.number || index + 1}`);

  return {
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
    action: STATUS_ACTIONS[evaluation.status] || "inspect",
    score: evaluation.score,
    labels: evaluation.labels,
    topReasons: signals.topReasons,
    contextSummary: evaluation.repositoryContext?.summary || "No repository context supplied.",
    contextFindings: evaluation.repositoryContext?.findings?.length || 0,
    reviewBudget: evaluation.reviewBudget,
    blockerCount: evaluation.blockers.length,
    failureCount: evaluation.checks.filter((check) => check.status === "fail").length,
    warningCount: evaluation.checks.filter((check) => check.status === "warn").length,
    fixtureInput: buildFixtureInput(input),
    evaluation
  };
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
    "",
    "## Queue"
  ].filter((line) => line !== "");

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
      `- Labels: ${item.labels?.length ? item.labels.map((label) => `\`${label}\``).join(", ") : "none"}`,
      `- Context: ${item.contextSummary || "none"}`,
      `- Review budget: ${item.reviewBudget?.minutes ?? "n/a"} minutes`,
      "- Reasons:",
      reasons
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
    ready: 0,
    needsRepair: 0,
    lowReviewValue: 0,
    blockers: 0,
    failures: 0,
    warnings: 0,
    contextFindings: 0,
    reviewBudgetMinutes: 0
  };

  for (const item of items) {
    summary.statuses[item.status] = (summary.statuses[item.status] || 0) + 1;
    summary.kinds[item.kind] = (summary.kinds[item.kind] || 0) + 1;
    summary.actions[item.action] = (summary.actions[item.action] || 0) + 1;
    if (item.status === "ready-for-maintainer") summary.ready += 1;
    if (item.status === "needs-repair") summary.needsRepair += 1;
    if (item.status === "low-review-value") summary.lowReviewValue += 1;
    summary.blockers += item.blockerCount || 0;
    summary.failures += item.failureCount || 0;
    summary.warnings += item.warningCount || 0;
    summary.contextFindings += item.contextFindings || 0;
    summary.reviewBudgetMinutes += item.reviewBudget?.minutes || 0;
    for (const label of item.labels || []) {
      summary.labels[label] = (summary.labels[label] || 0) + 1;
    }
  }

  return summary;
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

function clampLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_QUEUE_LIMIT;
  return Math.max(1, Math.min(MAX_QUEUE_LIMIT, Math.floor(numeric)));
}
