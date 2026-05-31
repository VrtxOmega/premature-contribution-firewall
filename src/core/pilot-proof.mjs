import { createHash } from "node:crypto";
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
    queueMarkdown: evaluatedQueue.markdown || "",
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

export function buildMaintainerExportBundle({
  proof = {},
  baselineProof = null,
  replayPayload = null,
  replayPayloadLabel = "",
  commands = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const responseDrafts = collectResponseDrafts(proof);
  const responseDraftMarkdown = renderResponseDraftsMarkdown(responseDrafts);
  const queueMarkdown = proof.queueMarkdown || "";
  const beforeAfter = comparePilotProofs(baselineProof, proof);
  const publicProof = compactProofForHash(proof);

  return {
    ok: proof.ok !== false,
    artifact: "maintainer-export-bundle",
    generatedAt,
    repository: proof.repository || proof.queue?.repository || "",
    dryRun: proof.dryRun !== false,
    writePosture: proof.setup?.writePosture || "safe-dry-run-or-read-only",
    hashes: {
      proofSha256: sha256Json(publicProof),
      queueMarkdownSha256: queueMarkdown ? sha256Text(queueMarkdown) : "",
      responseDraftsSha256: responseDraftMarkdown ? sha256Text(responseDraftMarkdown) : "",
      replayPayloadSha256: replayPayload ? sha256Json(replayPayload) : "",
      replayPayloadLabel
    },
    commands: buildBundleCommands({ proof, commands }),
    beforeAfter,
    breakdown: proof.breakdown || {},
    context: proof.context || {},
    responseDrafts,
    responseDraftMarkdown,
    queueMarkdown,
    nonClaims: [
      ...(proof.nonClaims || []),
      "Response drafts are copyable maintainer aids, not automatic GitHub comments.",
      "Replay payload hashes prove which private input set was evaluated without publishing the raw payload."
    ]
  };
}

export function renderMaintainerExportMarkdown(bundle = {}) {
  const hashRows = [
    ["Proof JSON", bundle.hashes?.proofSha256 || "n/a"],
    ["Queue markdown", bundle.hashes?.queueMarkdownSha256 || "n/a"],
    ["Response drafts", bundle.hashes?.responseDraftsSha256 || "n/a"],
    [bundle.hashes?.replayPayloadLabel ? `Replay payload (${bundle.hashes.replayPayloadLabel})` : "Replay payload", bundle.hashes?.replayPayloadSha256 || "not captured"]
  ];
  const nextActionRows = Object.entries(bundle.breakdown?.nextActionCounts || {}).map(([action, count]) => [action, String(count)]);
  const beforeAfterRows = buildBeforeAfterRows(bundle.beforeAfter);
  const commandLines = [
    bundle.commands?.rerun || "",
    bundle.commands?.capture || "",
    bundle.commands?.replay || "",
    bundle.commands?.baseline || ""
  ].filter(Boolean);

  return [
    "# Premature Contribution Firewall Maintainer Export Bundle",
    "",
    `Generated: ${bundle.generatedAt || ""}`,
    `Repository: ${bundle.repository || "unknown"}`,
    "",
    "## Safety Posture",
    "",
    `Dry-run: **${bundle.dryRun ? "yes" : "no"}**`,
    `Write posture: \`${bundle.writePosture || "safe-dry-run-or-read-only"}\``,
    "",
    "No comments, labels, closures, merges, or other GitHub writes were made automatically.",
    "",
    "## Artifact Hashes",
    "",
    "| Artifact | SHA-256 |",
    "| --- | --- |",
    ...hashRows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Before / After Proof",
    "",
    bundle.beforeAfter?.supplied
      ? `Baseline: ${bundle.beforeAfter.baselineGeneratedAt || "unknown"} -> Current: ${bundle.beforeAfter.currentGeneratedAt || bundle.generatedAt || "unknown"}`
      : "No baseline was supplied. Re-run with `--baseline <previous-proof-or-capture.json>` to show before/after movement on the same input set.",
    "",
    "| Metric | Before | After | Delta |",
    "| --- | ---: | ---: | ---: |",
    ...beforeAfterRows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Current Queue Distribution",
    "",
    `Total sampled items: ${bundle.breakdown?.total || 0}`,
    `Review now: ${bundle.breakdown?.reviewNow || 0}`,
    `Send repair request: ${bundle.breakdown?.sendRepairRequest || 0}`,
    `Do not review yet: ${bundle.breakdown?.doNotReviewYet || 0}`,
    `Estimated review budget: ${bundle.breakdown?.reviewBudgetMinutes || 0} minutes`,
    "",
    "| Next Action | Count |",
    "| --- | ---: |",
    ...(nextActionRows.length ? nextActionRows : [["none", "0"]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
    "## Response Drafts",
    "",
    bundle.responseDraftMarkdown || "No response drafts were generated.",
    "",
    "## Queue Markdown",
    "",
    "~~~markdown",
    bundle.queueMarkdown || "No queue markdown was generated.",
    "~~~",
    "",
    "## Rerun Commands",
    "",
    "```bash",
    ...commandLines,
    "```",
    "",
    "## Non-Claims",
    "",
    ...uniqueStrings(bundle.nonClaims || []).map((claim) => `- ${claim}`),
    ""
  ].join("\n");
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
  const preflight = proof.contributorPreflight?.enabled ? proof.contributorPreflight : null;
  const preflightRows = (preflight?.candidates || []).map((candidate) => [
    candidate.status,
    candidate.number ? `#${candidate.number}` : candidate.id,
    candidate.title,
    candidate.blockers.length,
    candidate.reason,
    candidate.contributorAction
  ]);

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
    ...(preflight ? [
      "## Contributor Preflight",
      "",
      "This optional gate checks `review-now` issue candidates for exact open PR ownership signals before contributor coding work starts.",
      "",
      `Checked candidates: ${preflight.summary?.checked || 0}`,
      `Blocked by open PR overlap: ${preflight.summary?.blocked || 0}`,
      `Candidate after PR-overlap check: ${preflight.summary?.candidate || 0}`,
      `Unchecked: ${preflight.summary?.unchecked || 0}`,
      "",
      "| Status | Item | Title | Blockers | Reason | Contributor Action |",
      "| --- | --- | --- | ---: | --- | --- |",
      ...(preflightRows.length ? preflightRows : [["none", "n/a", "n/a", "0", "No review-now issue candidates in this sample.", "No contributor action."]]).map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
      ""
    ] : []),
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

function collectResponseDrafts(proof = {}) {
  return (proof.queue?.items || [])
    .filter((item) => item.responseTemplate?.body)
    .map((item) => ({
      item: item.number ? `${item.kind || "item"} #${item.number}` : item.id || "item",
      id: item.id || "",
      title: item.title || "",
      nextAction: item.nextAction?.id || "unknown",
      templateTitle: item.responseTemplate.title || "Response draft",
      audience: item.responseTemplate.audience || "unknown",
      channel: item.responseTemplate.channel || "unknown",
      dryRun: item.responseTemplate.dryRun !== false,
      posting: item.responseTemplate.posting || "disabled",
      shouldPost: Boolean(item.responseTemplate.shouldPost),
      body: item.responseTemplate.body || ""
    }));
}

function renderResponseDraftsMarkdown(drafts = []) {
  if (!drafts.length) return "";
  const sections = [];
  for (const draft of drafts) {
    sections.push(
      `### ${draft.item}: ${draft.templateTitle}`,
      "",
      `Next action: \`${draft.nextAction}\``,
      `Audience: \`${draft.audience}\`; channel: \`${draft.channel}\`; posting: \`${draft.posting}\`; should post: \`${draft.shouldPost ? "true" : "false"}\``,
      "",
      "```text",
      draft.body,
      "```",
      ""
    );
  }
  return sections.join("\n").trim();
}

function comparePilotProofs(baselineProof, currentProof = {}) {
  if (!baselineProof) {
    return {
      supplied: false,
      metrics: {}
    };
  }
  const metrics = {
    total: metricDelta(baselineProof.breakdown?.total, currentProof.breakdown?.total),
    reviewNow: metricDelta(baselineProof.breakdown?.reviewNow, currentProof.breakdown?.reviewNow),
    sendRepairRequest: metricDelta(baselineProof.breakdown?.sendRepairRequest, currentProof.breakdown?.sendRepairRequest),
    doNotReviewYet: metricDelta(baselineProof.breakdown?.doNotReviewYet, currentProof.breakdown?.doNotReviewYet),
    contextFindings: metricDelta(baselineProof.context?.findings, currentProof.context?.findings),
    collectionErrors: metricDelta(
      baselineProof.context?.collectionErrors?.length || 0,
      currentProof.context?.collectionErrors?.length || 0
    )
  };
  const nextActions = uniqueStrings([
    ...Object.keys(baselineProof.breakdown?.nextActionCounts || {}),
    ...Object.keys(currentProof.breakdown?.nextActionCounts || {})
  ]);
  for (const action of nextActions) {
    metrics[`nextAction:${action}`] = metricDelta(
      baselineProof.breakdown?.nextActionCounts?.[action],
      currentProof.breakdown?.nextActionCounts?.[action]
    );
  }
  return {
    supplied: true,
    baselineGeneratedAt: baselineProof.generatedAt || "",
    currentGeneratedAt: currentProof.generatedAt || "",
    metrics
  };
}

function buildBeforeAfterRows(beforeAfter = {}) {
  if (!beforeAfter.supplied) {
    return [
      ["baseline", "0", "0", "0"]
    ];
  }
  return Object.entries(beforeAfter.metrics || {}).map(([metric, delta]) => [
    metric,
    String(delta.before),
    String(delta.after),
    signedNumber(delta.delta)
  ]);
}

function metricDelta(before = 0, after = 0) {
  const normalizedBefore = Number(before || 0);
  const normalizedAfter = Number(after || 0);
  return {
    before: normalizedBefore,
    after: normalizedAfter,
    delta: normalizedAfter - normalizedBefore
  };
}

function buildBundleCommands({ proof = {}, commands = {} } = {}) {
  const repository = proof.repository || "owner/repo";
  const limit = proof.breakdown?.total || 10;
  const safeCapturePath = commands.capturePath || `/tmp/pcf-${repository.replaceAll("/", "-")}-capture.json`;
  return {
    rerun: commands.rerun || proof.setup?.commands?.livePilot || `npm run pilot:public -- --repository ${repository} --limit ${limit}`,
    capture: commands.capture || `npm run pilot:public -- --repository ${repository} --limit ${limit} --capture ${safeCapturePath}`,
    replay: commands.replay || `npm run pilot:public:markdown -- --fixture ${safeCapturePath} --bundle /tmp/pcf-${repository.replaceAll("/", "-")}-bundle.md`,
    baseline: commands.baseline || `npm run pilot:public -- --fixture ${safeCapturePath} --format json --write /tmp/pcf-${repository.replaceAll("/", "-")}-baseline.json`
  };
}

function compactProofForHash(proof = {}) {
  return {
    artifact: proof.artifact || "",
    generatedAt: proof.generatedAt || "",
    repository: proof.repository || "",
    dryRun: proof.dryRun !== false,
    breakdown: proof.breakdown || {},
    context: proof.context || {},
    contributorPreflight: proof.contributorPreflight || null,
    queue: proof.queue || {},
    nonClaims: proof.nonClaims || []
  };
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
    ...(proof.contributorPreflight?.enabled ? [
      `Contributor preflight: checked ${proof.contributorPreflight.summary?.checked || 0}, blocked ${proof.contributorPreflight.summary?.blocked || 0}, candidates ${proof.contributorPreflight.summary?.candidate || 0}, unchecked ${proof.contributorPreflight.summary?.unchecked || 0}`
    ] : []),
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
    repository: item.repository || "",
    status: item.status || "",
    action: item.action || "",
    nextAction: item.nextAction || { id: "unknown", target: "", summary: "", reason: "" },
    responseTemplate: compactResponseTemplate(item.responseTemplate),
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

function compactResponseTemplate(template = {}) {
  if (!template?.body) return null;
  return {
    id: template.id || "",
    title: template.title || "",
    audience: template.audience || "",
    channel: template.channel || "",
    dryRun: template.dryRun !== false,
    posting: template.posting || "disabled",
    shouldPost: Boolean(template.shouldPost),
    summary: template.summary || "",
    body: template.body || "",
    checklist: Array.isArray(template.checklist) ? template.checklist.slice(0, 6) : []
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

function sha256Text(value = "") {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256Json(value = {}) {
  return sha256Text(`${stableJson(value)}\n`);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function signedNumber(value = 0) {
  const numeric = Number(value || 0);
  return numeric > 0 ? `+${numeric}` : String(numeric);
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

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}
