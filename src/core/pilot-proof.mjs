import { buildMaintainerQueue } from "./queue.mjs";
import { buildSetupGuide } from "./setup-guide.mjs";

const CONTEXT_LABELS = new Set([
  "possibly-duplicate",
  "possibly-solved",
  "linked-issue-closed",
  "concurrent-work",
  "possibly-upstream-fixed",
  "repo-context-unavailable"
]);

export function buildPublicPilotProof({
  repository = "",
  queue = null,
  queuePayload = null,
  collectionErrors = [],
  setupGuide = null,
  config = {},
  generatedAt = new Date().toISOString(),
  limit = 10,
  target = {}
} = {}) {
  const evaluatedQueue = queue || buildMaintainerQueue(queuePayload || {}, {
    repository: repository || queuePayload?.repository || "",
    source: queuePayload?.source || "supplied",
    now: generatedAt
  });
  const targetRepository = repository || evaluatedQueue.repository || queuePayload?.repository || "owner/repo";
  const guide = setupGuide || buildSetupGuide(config, { repository: targetRepository });
  const items = evaluatedQueue.items || [];
  const actionCounts = countBy(items, (item) => item.action || "inspect");
  const nextActionCounts = countBy(items, (item) => item.nextAction?.id || "unknown");
  const repairSubActionCounts = countBy(
    items.filter((item) => item.action !== "review-now"),
    (item) => item.nextAction?.id || "unknown"
  );
  const statusCounts = countBy(items, (item) => item.status || "unknown");
  const contextLabelCounts = {};
  for (const item of items) {
    for (const label of item.labels || []) {
      if (CONTEXT_LABELS.has(label)) {
        contextLabelCounts[label] = (contextLabelCounts[label] || 0) + 1;
      }
    }
  }
  const reviewNow = items.filter((item) => item.action === "review-now");
  const repair = items.filter((item) => item.action === "send-repair-request");
  const lowValue = items.filter((item) => item.action === "do-not-review-yet");
  const contextItems = items.filter((item) => item.contextFindings > 0);
  const contextChecked = items.filter((item) => item.evaluation?.repositoryContext?.hasContext);
  const contextUnavailable = items.filter((item) => (item.labels || []).includes("repo-context-unavailable"));
  const contextCleared = contextChecked.filter((item) => item.contextFindings === 0 && !(item.labels || []).includes("repo-context-unavailable"));
  const contextErrors = contextUnavailable.map((item) => ({
    scope: `${item.kind || "item"}${item.number ? `#${item.number}` : ""}`,
    message: item.contextSummary || "Repository context unavailable."
  }));

  return {
    ok: true,
    artifact: "public-repo-pilot-proof",
    generatedAt,
    dryRun: evaluatedQueue.dryRun !== false,
    repository: targetRepository,
    target: {
      repository: targetRepository,
      stars: target.stars || target.stargazers_count || 0,
      openIssuesAndPullRequests: target.openIssuesAndPullRequests || target.open_issues_count || 0,
      defaultBranch: target.defaultBranch || target.default_branch || "",
      htmlUrl: target.htmlUrl || target.html_url || ""
    },
    setup: {
      mode: guide.mode,
      writePosture: guide.safety?.verdict || "safe-dry-run-or-read-only",
      tokenConfigured: Boolean(guide.currentSetup?.github?.tokenConfigured),
      collectRepositoryContext: guide.currentSetup?.github?.collectRepositoryContext !== false,
      commands: {
        setup: guide.commands?.cli || `node src/cli.mjs setup --repository ${targetRepository}`,
        livePilot: `npm run pilot:public -- --repository ${targetRepository} --limit ${Number(limit) || 10}`,
        queueApi: guide.commands?.repositoryQueue || ""
      }
    },
    breakdown: {
      total: items.length,
      actionCounts,
      nextActionCounts,
      repairSubActionCounts,
      statusCounts,
      reviewNow: reviewNow.length,
      sendRepairRequest: repair.length,
      doNotReviewYet: lowValue.length,
      reviewBudgetMinutes: evaluatedQueue.summary?.reviewBudgetMinutes || 0
    },
    context: {
      enabled: guide.currentSetup?.github?.collectRepositoryContext !== false,
      findings: evaluatedQueue.summary?.contextFindings || 0,
      itemsWithFindings: contextItems.length,
      itemsChecked: contextChecked.length,
      itemsCleared: contextCleared.length,
      itemsUnavailable: contextUnavailable.length,
      labels: contextLabelCounts,
      collectionErrors: normalizeErrors([...collectionErrors, ...contextErrors])
    },
    queue: compactQueue(evaluatedQueue),
    redTestLeads: buildRedTestLeads(items),
    nonClaims: [
      "This artifact is a read-only shadow pilot, not a maintainer endorsement.",
      "This artifact does not post comments, apply labels, close issues, or mutate GitHub state.",
      "This artifact does not claim universal precision over the target repository.",
      "The useful failures are candidates for new red tests only after a human reviews the original issue or pull request."
    ]
  };
}

export function renderPublicPilotMarkdown(proof = {}) {
  const queueRows = (proof.queue?.items || []).map((item) => [
    item.action,
    item.nextAction?.id || "unknown",
    item.status,
    item.kind,
    item.number ? `#${item.number}` : item.id,
    item.title,
    item.contextFindings,
    item.contextLabels.join(", ") || "none",
    item.contextSummary,
    item.reviewBudgetMinutes
  ]);
  const leadRows = (proof.redTestLeads || []).map((lead) => [
    lead.item,
    lead.kind,
    lead.status,
    lead.why
  ]);
  const contextLabelRows = Object.entries(proof.context?.labels || {}).map(([label, count]) => [label, String(count)]);
  const errorRows = (proof.context?.collectionErrors || []).map((error) => [error.scope || "collection", error.message || "unknown error"]);
  const repairSubActionRows = Object.entries(proof.breakdown?.repairSubActionCounts || {}).map(([label, count]) => [label, String(count)]);

  return [
    "# Premature Contribution Firewall Public Repo Pilot Proof",
    "",
    `Generated: ${proof.generatedAt}`,
    `Repository: ${proof.repository}`,
    proof.target?.htmlUrl ? `URL: ${proof.target.htmlUrl}` : "",
    "",
    "## Verdict",
    "",
    `Dry-run: **${proof.dryRun ? "yes" : "no"}**`,
    `Write posture: \`${proof.setup?.writePosture || "safe-dry-run-or-read-only"}\``,
    `Repository context collection: **${proof.setup?.collectRepositoryContext ? "enabled" : "disabled"}**`,
    `Public-read token configured: **${proof.setup?.tokenConfigured ? "yes" : "no"}**`,
    "",
    "## Review Priority Breakdown",
    "",
    `Total sampled items: ${proof.breakdown?.total || 0}`,
    `Review now: ${proof.breakdown?.reviewNow || 0}`,
    `Send repair request: ${proof.breakdown?.sendRepairRequest || 0}`,
    `Do not review yet: ${proof.breakdown?.doNotReviewYet || 0}`,
    `Estimated review budget: ${proof.breakdown?.reviewBudgetMinutes || 0} minutes`,
    "",
    "| Repair Sub-Action | Count |",
    "| --- | ---: |",
    ...(repairSubActionRows.length ? repairSubActionRows : [["none", "0"]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "| Action | Next Action | Status | Kind | Item | Title | Context Findings | Context Labels | Context Summary | Budget |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | ---: |",
    ...queueRows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Context Intelligence",
    "",
    `Context findings: ${proof.context?.findings || 0}`,
    `Items with context findings: ${proof.context?.itemsWithFindings || 0}`,
    `Items checked with repository context: ${proof.context?.itemsChecked || 0}`,
    `Items cleared by repository context: ${proof.context?.itemsCleared || 0}`,
    `Items with unavailable context: ${proof.context?.itemsUnavailable || 0}`,
    "",
    "| Context Label | Count |",
    "| --- | ---: |",
    ...(contextLabelRows.length ? contextLabelRows : [["none", "0"]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Potential Red-Test Leads",
    "",
    "| Item | Kind | Status | Why inspect it |",
    "| --- | --- | --- | --- |",
    ...(leadRows.length ? leadRows : [["none", "n/a", "n/a", "No obvious red-test leads in this sample."]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Collection Errors",
    "",
    "| Scope | Message |",
    "| --- | --- |",
    ...(errorRows.length ? errorRows : [["none", "No collection errors."]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Reproduce",
    "",
    "```bash",
    proof.setup?.commands?.setup || `node src/cli.mjs setup --repository ${proof.repository}`,
    proof.setup?.commands?.livePilot || `npm run pilot:public -- --repository ${proof.repository}`,
    proof.setup?.commands?.queueApi || "",
    "```",
    "",
    "## Non-Claims",
    "",
    ...(proof.nonClaims || []).map((claim) => `- ${claim}`),
    ""
  ].join("\n");
}

export function renderPublicPilotSummary(proof = {}) {
  return [
    "Premature Contribution Firewall Public Repo Pilot Proof",
    `Repository: ${proof.repository}`,
    `Dry-run: ${proof.dryRun ? "yes" : "no"}`,
    `Review now: ${proof.breakdown?.reviewNow || 0}`,
    `Send repair request: ${proof.breakdown?.sendRepairRequest || 0}`,
    `Do not review yet: ${proof.breakdown?.doNotReviewYet || 0}`,
    `Repair sub-actions: ${formatCounts(proof.breakdown?.repairSubActionCounts)}`,
    `Context findings: ${proof.context?.findings || 0}`,
    `Context checked: ${proof.context?.itemsChecked || 0}`,
    `Collection errors: ${proof.context?.collectionErrors?.length || 0}`,
    "Non-claim: read-only shadow pilot; no GitHub writes.",
    ""
  ].join("\n");
}

function compactQueue(queue = {}) {
  return {
    ok: queue.ok !== false,
    source: queue.source || "unknown",
    repository: queue.repository || "",
    generatedAt: queue.generatedAt || "",
    summary: queue.summary || {},
    items: (queue.items || []).map(compactQueueItem)
  };
}

function compactQueueItem(item = {}) {
  const contextLabels = (item.labels || []).filter((label) => CONTEXT_LABELS.has(label));
  return {
    id: item.id || "",
    kind: item.kind || "",
    number: item.number || "",
    title: item.title || "",
    htmlUrl: item.htmlUrl || "",
    status: item.status || "",
    action: item.action || "",
    nextAction: item.nextAction || { id: "unknown", target: "", summary: "", reason: "" },
    score: item.score || 0,
    labels: item.labels || [],
    contextLabels,
    contextSummary: item.contextSummary || "",
    contextFindings: item.contextFindings || 0,
    reviewBudgetMinutes: item.reviewBudget?.minutes || 0,
    topReasons: (item.topReasons || []).slice(0, 3).map((reason) => ({
      id: reason.id || "",
      title: reason.title || "",
      status: reason.status || "",
      label: reason.label || "",
      reason: reason.reason || ""
    }))
  };
}

function buildRedTestLeads(items = []) {
  return items
    .filter((item) => item.action === "send-repair-request" || item.contextFindings > 0)
    .slice(0, 8)
    .map((item) => ({
      item: item.number ? `#${item.number}` : item.id,
      kind: item.kind,
      status: item.status,
      why: redTestReason(item)
    }));
}

function redTestReason(item = {}) {
  const contextLabels = (item.labels || []).filter((label) => CONTEXT_LABELS.has(label));
  if (contextLabels.length) {
    return `Context-sensitive triage: ${contextLabels.join(", ")}`;
  }
  const reason = item.topReasons?.[0];
  if (reason?.title) {
    return `${reason.title}: ${reason.reason || "inspect maintainer fit"}`;
  }
  return "Inspect whether PCF's repair request matches maintainer expectation.";
}

function normalizeErrors(errors = []) {
  return (Array.isArray(errors) ? errors : []).map((error) => ({
    scope: String(error.scope || "collection"),
    message: String(error.message || error.error || "unknown error")
  }));
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items || []) {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts = {}) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return "none";
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}
