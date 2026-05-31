const form = document.querySelector("#reviewForm");
const queueForm = document.querySelector("#queueForm");
const healthDot = document.querySelector("#healthDot");
const healthText = document.querySelector("#healthText");
const formError = document.querySelector("#formError");
const queueError = document.querySelector("#queueError");
const statusEl = document.querySelector("#resultStatus");
const scoreEl = document.querySelector("#scoreValue");
const summaryEl = document.querySelector("#resultSummary");
const labelsEl = document.querySelector("#labels");
const blockersEl = document.querySelector("#blockers");
const repairsEl = document.querySelector("#repairs");
const checksEl = document.querySelector("#checks");
const commentEl = document.querySelector("#comment");
const profilePill = document.querySelector("#profilePill");
const budgetPill = document.querySelector("#budgetPill");
const provenancePill = document.querySelector("#provenancePill");
const policyPill = document.querySelector("#policyPill");
const contextPill = document.querySelector("#contextPill");
const calibrationPill = document.querySelector("#calibrationPill");
const seriesPill = document.querySelector("#seriesPill");
const repositoryContextFindingsEl = document.querySelector("#repositoryContextFindings");
const queueSummaryEl = document.querySelector("#queueSummary");
const queueListEl = document.querySelector("#queueList");
const queueMarkdownEl = document.querySelector("#queueMarkdown");
const setupSummaryEl = document.querySelector("#setupSummary");
const setupChecklistEl = document.querySelector("#setupChecklist");
const setupPilotEl = document.querySelector("#setupPilot");
const setupWarningsEl = document.querySelector("#setupWarnings");
const connectionResultEl = document.querySelector("#connectionResult");
const historySummaryEl = document.querySelector("#historySummary");
const historyListEl = document.querySelector("#historyList");
const feedbackSummaryEl = document.querySelector("#feedbackSummary");
const calibrationSummaryEl = document.querySelector("#calibrationSummary");
const feedbackListEl = document.querySelector("#feedbackList");
const feedbackExportEl = document.querySelector("#feedbackExport");
const candidateReviewEl = document.querySelector("#candidateReview");
const candidateReplayEl = document.querySelector("#candidateReplay");
const candidateComparisonEl = document.querySelector("#candidateComparison");
const candidateArtifactEl = document.querySelector("#candidateArtifact");
const demoQueueButton = document.querySelector("#demoQueue");
const testConnectionButton = document.querySelector("#testConnection");
const refreshHistoryButton = document.querySelector("#refreshHistory");
const refreshFeedbackButton = document.querySelector("#refreshFeedback");
const exportFeedbackButton = document.querySelector("#exportFeedback");
const applySelectedCandidatesButton = document.querySelector("#applySelectedCandidates");
const replayCandidatesButton = document.querySelector("#replayCandidates");
const exportCandidateEvidenceButton = document.querySelector("#exportCandidateEvidence");
const copyCandidateEvidenceButton = document.querySelector("#copyCandidateEvidence");
const captureReplayBaselineButton = document.querySelector("#captureReplayBaseline");
const compareReplayBaselineButton = document.querySelector("#compareReplayBaseline");
const copyReplayComparisonButton = document.querySelector("#copyReplayComparison");
const copyButton = document.querySelector("#copyComment");
const resetButton = document.querySelector("#resetForm");

let currentKind = "pull_request";
let currentComment = "";
let currentQueue = null;
let currentQueueFilter = "all";
let currentFeedbackExport = null;
let currentCandidateEvidenceMarkdown = "";
let currentReplayComparisonMarkdown = "";

const CANDIDATE_REPLAY_BASELINE_KEY = "pcf:candidateReplayBaseline";

for (const button of document.querySelectorAll("[data-kind]")) {
  button.addEventListener("click", () => {
    currentKind = button.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach((item) => item.classList.toggle("active", item === button));
  });
}

for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => loadExample(button.dataset.example));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await evaluateForm();
});

queueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runQueueFromForm();
});

demoQueueButton.addEventListener("click", async () => {
  await loadQueueDemo();
});

testConnectionButton.addEventListener("click", async () => {
  await testConnection();
});

refreshHistoryButton.addEventListener("click", async () => {
  await loadHistory();
});

refreshFeedbackButton.addEventListener("click", async () => {
  await loadFeedback();
});

exportFeedbackButton.addEventListener("click", async () => {
  await loadFeedbackExport();
});

applySelectedCandidatesButton.addEventListener("click", async () => {
  await applySelectedCandidates();
});

replayCandidatesButton.addEventListener("click", async () => {
  await loadCandidateCorpus();
});

exportCandidateEvidenceButton.addEventListener("click", async () => {
  await loadCandidateEvidence();
});

copyCandidateEvidenceButton.addEventListener("click", async () => {
  if (!currentCandidateEvidenceMarkdown) await loadCandidateEvidence();
  if (!currentCandidateEvidenceMarkdown) return;
  await navigator.clipboard.writeText(currentCandidateEvidenceMarkdown);
  copyCandidateEvidenceButton.textContent = "Copied";
  setTimeout(() => {
    copyCandidateEvidenceButton.textContent = "Copy Evidence";
  }, 1200);
});

captureReplayBaselineButton.addEventListener("click", async () => {
  await captureReplayBaseline();
});

compareReplayBaselineButton.addEventListener("click", async () => {
  await compareReplayBaseline();
});

copyReplayComparisonButton.addEventListener("click", async () => {
  if (!currentReplayComparisonMarkdown) await compareReplayBaseline();
  if (!currentReplayComparisonMarkdown) return;
  await navigator.clipboard.writeText(currentReplayComparisonMarkdown);
  copyReplayComparisonButton.textContent = "Copied";
  setTimeout(() => {
    copyReplayComparisonButton.textContent = "Copy Comparison";
  }, 1200);
});

for (const button of document.querySelectorAll("[data-queue-filter]")) {
  button.addEventListener("click", () => {
    currentQueueFilter = button.dataset.queueFilter;
    document.querySelectorAll("[data-queue-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderQueue(currentQueue);
  });
}

copyButton.addEventListener("click", async () => {
  if (!currentComment) return;
  await navigator.clipboard.writeText(currentComment);
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = "Copy Comment";
  }, 1200);
});

resetButton.addEventListener("click", () => {
  form.reset();
  document.querySelector("#files").value = "[]";
  document.querySelector("#policyFiles").value = "[]";
  document.querySelector("#repositoryContext").value = JSON.stringify(emptyRepositoryContext(), null, 2);
  document.querySelector("#patchText").value = "";
  formError.textContent = "";
  renderEmpty();
});

checkHealth();
loadSetup();
loadHistory();
loadFeedback();
loadFeedbackCalibration();
loadCandidateCorpus();
loadQueueDemo();
loadExample("pr-unready");

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    healthDot.classList.toggle("ok", Boolean(data.ok));
    healthText.textContent = data.ok ? `Server ready, dry-run ${data.dryRun}` : "Server degraded";
  } catch {
    healthDot.classList.add("bad");
    healthText.textContent = "Server offline";
  }
}

async function loadSetup() {
  try {
    const response = await fetch("/api/github/setup");
    const data = await response.json();
    if (response.ok && data.ok) renderSetup(data);
  } catch {
    setupWarningsEl.textContent = "Setup status unavailable.";
  }
}

async function testConnection() {
  connectionResultEl.textContent = "Testing read-only access...";
  const owner = document.querySelector("#queueOwner").value.trim();
  const repo = document.querySelector("#queueRepo").value.trim();
  const response = await fetch("/api/github/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo })
  });
  const data = await response.json();
  const connection = data.connection || {};
  connectionResultEl.textContent = connection.ok
    ? `Read-only access ok: ${connection.repository}${connection.defaultBranch ? ` (${connection.defaultBranch})` : ""}`
    : `Read-only access not ready: ${connection.message || data.error || "unknown error"}`;
  renderSetup(data.setup || data);
}

async function loadHistory() {
  try {
    const response = await fetch("/api/queue/history?limit=8");
    const data = await response.json();
    if (response.ok && data.ok) renderHistory(data.history);
  } catch {
    historyListEl.textContent = "Queue history unavailable.";
  }
}

async function loadFeedback() {
  try {
    const response = await fetch("/api/feedback?limit=8");
    const data = await response.json();
    if (response.ok && data.ok) renderFeedback(data.feedback);
  } catch {
    feedbackListEl.textContent = "Feedback unavailable.";
  }
}

async function loadFeedbackCalibration() {
  try {
    const response = await fetch("/api/feedback/calibration");
    const data = await response.json();
    if (response.ok && data.ok) renderCalibration(data);
  } catch {
    calibrationSummaryEl.textContent = "Calibration unavailable.";
  }
}

async function loadFeedbackExport() {
  try {
    const response = await fetch("/api/feedback/export");
    const data = await response.json();
    currentFeedbackExport = data;
    renderCandidateReview(data);
    const summary = data.summary || {};
    feedbackExportEl.textContent = [
      `Runnable fixture drafts: ${summary.runnableFixtures || 0}`,
      `Manual candidates: ${summary.needsManualFixtureInput || 0}`,
      `Current replay failures: ${summary.currentlyFailing || 0}`,
      "",
      JSON.stringify(data, null, 2)
    ].join("\n");
  } catch {
    feedbackExportEl.textContent = "Feedback export unavailable.";
  }
}

async function loadCandidateCorpus() {
  try {
    const response = await fetch("/api/feedback/candidates");
    const data = await response.json();
    if (response.ok && data.ok) renderCandidateReplay(data.replay, data.corpus);
  } catch {
    candidateReplayEl.textContent = "Candidate corpus unavailable.";
  }
}

async function loadCandidateEvidence() {
  try {
    const response = await fetch("/api/feedback/candidates/export");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      candidateArtifactEl.textContent = data.error || "Candidate evidence export failed.";
      return;
    }
    currentCandidateEvidenceMarkdown = data.markdown || "";
    renderCandidateEvidence(data);
  } catch {
    candidateArtifactEl.textContent = "Candidate evidence export unavailable.";
  }
}

async function captureReplayBaseline() {
  try {
    const response = await fetch("/api/feedback/candidates/replay");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      candidateComparisonEl.textContent = data.error || "Could not capture replay baseline.";
      return;
    }
    const baseline = {
      capturedAt: new Date().toISOString(),
      replay: data
    };
    localStorage.setItem(CANDIDATE_REPLAY_BASELINE_KEY, JSON.stringify(baseline));
    renderReplayBaselineCaptured(baseline);
  } catch {
    candidateComparisonEl.textContent = "Could not capture replay baseline.";
  }
}

async function compareReplayBaseline() {
  const baseline = readReplayBaseline();
  if (!baseline) {
    candidateComparisonEl.textContent = "Capture a replay baseline before comparing policy changes.";
    return;
  }
  candidateComparisonEl.textContent = "Comparing baseline with current replay...";
  try {
    const response = await fetch("/api/feedback/candidates/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselineReplay: baseline.replay })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      candidateComparisonEl.textContent = data.error || "Replay comparison failed.";
      return;
    }
    currentReplayComparisonMarkdown = data.markdown || "";
    renderReplayComparison(data, baseline);
  } catch {
    candidateComparisonEl.textContent = "Replay comparison unavailable.";
  }
}

async function applySelectedCandidates() {
  const selected = [...candidateReviewEl.querySelectorAll("[data-candidate-select]:checked")].map((item) => item.value);
  if (!selected.length) {
    candidateReplayEl.textContent = "Select at least one runnable fixture draft before applying.";
    return;
  }
  candidateReplayEl.textContent = "Applying selected fixture drafts...";
  const response = await fetch("/api/feedback/candidates/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseIds: selected })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    candidateReplayEl.textContent = data.error || "Candidate apply failed.";
    return;
  }
  renderCandidateApplyResult(data);
  await loadCandidateCorpus();
  await loadCandidateEvidence();
  await loadFeedbackCalibration();
  if (readReplayBaseline()) await compareReplayBaseline();
  await loadFeedbackExport();
}

async function loadExample(name) {
  formError.textContent = "";
  const response = await fetch(`/api/examples/${name}.json`);
  if (!response.ok) {
    formError.textContent = `Could not load ${name}.`;
    return;
  }
  const example = await response.json();
  fillForm(example);
  await evaluateForm();
}

async function loadQueueDemo() {
  queueError.textContent = "";
  try {
    const response = await fetch("/api/examples/queue-sample.json");
    if (!response.ok) throw new Error("Could not load queue-sample.");
    const payload = await response.json();
    document.querySelector("#queueOwner").value = "VrtxOmega";
    document.querySelector("#queueRepo").value = "premature-contribution-firewall-demo";
    document.querySelector("#queueUpstream").value = payload.upstreamRepository || "";
    await runQueue(payload);
  } catch (error) {
    queueError.textContent = error.message;
  }
}

async function runQueueFromForm() {
  queueError.textContent = "";
  const owner = document.querySelector("#queueOwner").value.trim();
  const repo = document.querySelector("#queueRepo").value.trim();
  const upstreamRepository = document.querySelector("#queueUpstream").value.trim();
  const limit = Number(document.querySelector("#queueLimit").value || 25);
  if (!owner || !repo) {
    queueError.textContent = "Owner and repo are required for live queue collection.";
    return;
  }
  await runQueue({
    owner,
    repo,
    upstreamRepository,
    limit,
    includePullRequests: document.querySelector("#queuePulls").checked,
    includeIssues: document.querySelector("#queueIssues").checked
  });
}

async function runQueue(payload) {
  const response = await fetch("/api/github/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    queueError.textContent = data.error || "Queue evaluation failed.";
    return;
  }
  currentQueue = data.queue;
  renderQueue(currentQueue);
  if (data.history) renderHistoryFromQueueResponse(data.history);
  await loadHistory();
}

function fillForm(example) {
  currentKind = example.kind === "issue" ? "issue" : example.kind === "patch" || example.patchText ? "patch" : "pull_request";
  document.querySelectorAll("[data-kind]").forEach((button) => {
    button.classList.toggle("active", button.dataset.kind === currentKind);
  });
  document.querySelector("#title").value = example.title || "";
  document.querySelector("#body").value = example.body || "";
  document.querySelector("#changedFiles").value = example.changedFiles || 0;
  document.querySelector("#additions").value = example.additions || 0;
  document.querySelector("#deletions").value = example.deletions || 0;
  document.querySelector("#authorAssociation").value = example.authorAssociation || "CONTRIBUTOR";
  document.querySelector("#profile").value = example.profile || "standard";
  document.querySelector("#draft").checked = Boolean(example.draft);
  document.querySelector("#files").value = JSON.stringify(example.files || [], null, 2);
  document.querySelector("#contributingText").value = example.contributingText || "";
  document.querySelector("#policyFiles").value = JSON.stringify(example.repositoryFiles || example.policyFiles || [], null, 2);
  document.querySelector("#repositoryContext").value = JSON.stringify(example.repositoryContext || emptyRepositoryContext(), null, 2);
  document.querySelector("#patchText").value = example.patchText || "";
}

async function evaluateForm() {
  formError.textContent = "";
  let payload;
  try {
    payload = collectPayload();
  } catch (error) {
    formError.textContent = error.message;
    return;
  }

  const endpoint = currentKind === "patch" ? "/api/evaluate-patch" : "/api/evaluate";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    formError.textContent = data.error || "Evaluation failed.";
    return;
  }
  renderResult(data.evaluation);
}

function collectPayload() {
  const filesText = document.querySelector("#files").value.trim() || "[]";
  const policyFilesText = document.querySelector("#policyFiles").value.trim() || "[]";
  const repositoryContextText = document.querySelector("#repositoryContext").value.trim() || "{}";
  let files;
  let repositoryFiles;
  let repositoryContext;
  try {
    files = JSON.parse(filesText);
  } catch {
    throw new Error("Files JSON must be valid JSON.");
  }
  if (!Array.isArray(files)) throw new Error("Files JSON must be an array.");
  try {
    const parsedPolicy = JSON.parse(policyFilesText);
    repositoryFiles = Array.isArray(parsedPolicy) ? parsedPolicy : parsedPolicy.repositoryFiles || parsedPolicy.policyFiles || [];
  } catch {
    throw new Error("Repository policy files JSON must be valid JSON.");
  }
  if (!Array.isArray(repositoryFiles)) throw new Error("Repository policy files JSON must be an array or an object with repositoryFiles.");
  try {
    repositoryContext = JSON.parse(repositoryContextText);
  } catch {
    throw new Error("Repository context JSON must be valid JSON.");
  }
  if (!repositoryContext || typeof repositoryContext !== "object" || Array.isArray(repositoryContext)) {
    throw new Error("Repository context JSON must be an object.");
  }

  if (currentKind === "patch") {
    return {
      text: document.querySelector("#patchText").value,
      profile: document.querySelector("#profile").value || "kernel-grade",
      repositoryFiles,
      repositoryContext
    };
  }

  return {
    kind: currentKind,
    title: document.querySelector("#title").value,
    body: document.querySelector("#body").value,
    changedFiles: Number(document.querySelector("#changedFiles").value || 0),
    additions: Number(document.querySelector("#additions").value || 0),
    deletions: Number(document.querySelector("#deletions").value || 0),
    authorAssociation: document.querySelector("#authorAssociation").value,
    profile: document.querySelector("#profile").value,
    draft: document.querySelector("#draft").checked,
    files,
    repositoryFiles,
    repositoryContext,
    contributingText: document.querySelector("#contributingText").value
  };
}

function renderEmpty() {
  statusEl.textContent = "Waiting";
  scoreEl.textContent = "--";
  summaryEl.textContent = "Load an example or paste a submission, then evaluate it.";
  profilePill.textContent = "Profile: --";
  budgetPill.textContent = "Budget: --";
  provenancePill.textContent = "Provenance: --";
  policyPill.textContent = "Policy: --";
  contextPill.textContent = "Context: --";
  calibrationPill.textContent = "Calibration: --";
  seriesPill.textContent = "Series: --";
  labelsEl.innerHTML = "";
  blockersEl.innerHTML = "";
  repairsEl.innerHTML = "";
  checksEl.innerHTML = "";
  repositoryContextFindingsEl.innerHTML = "";
  commentEl.textContent = "";
  currentComment = "";
}

function renderResult(result) {
  currentComment = result.comment || "";
  statusEl.textContent = result.status;
  scoreEl.textContent = String(result.score);
  summaryEl.textContent = result.summary;
  profilePill.textContent = `Profile: ${result.profile?.name || "Standard Maintainer"}`;
  budgetPill.textContent = result.reviewBudget ? `Budget: ${result.reviewBudget.level} (${result.reviewBudget.minutes} min)` : "Budget: --";
  provenancePill.textContent = result.provenance ? `Provenance: ${result.provenance.summary}` : "Provenance: --";
  policyPill.textContent = result.policyProfile?.hasPolicy ? `Policy: ${result.policyProfile.summary}` : "Policy: none";
  contextPill.textContent = result.repositoryContext?.hasContext ? `Context: ${result.repositoryContext.summary}` : "Context: none";
  calibrationPill.textContent = result.calibration?.active ? `Calibration: ${result.calibration.status}` : "Calibration: none";
  seriesPill.textContent = result.patchSeries ? `Series: ${result.patchSeries.patchCount} patch / ${result.patchSeries.messageCount} msg` : "Series: --";
  labelsEl.innerHTML = "";
  for (const label of result.labels) {
    const span = document.createElement("span");
    span.className = "label";
    span.textContent = label;
    labelsEl.append(span);
  }
  renderList(blockersEl, result.blockers.length ? result.blockers.map((item) => `${item.title}: ${item.reason}`) : ["None."]);
  renderList(repairsEl, result.repairSteps);
  renderList(repositoryContextFindingsEl, formatRepositoryContext(result.repositoryContext));
  checksEl.innerHTML = "";
  for (const check of result.checks) {
    const row = document.createElement("article");
    row.className = "check";
    row.innerHTML = `
      <span class="badge ${check.status}">${check.status.toUpperCase()}</span>
      <span>
        <strong></strong>
        <p></p>
      </span>
    `;
    row.querySelector("strong").textContent = check.title;
    row.querySelector("p").textContent = check.reason;
    checksEl.append(row);
  }
  commentEl.textContent = currentComment;
}

function renderQueue(queue) {
  if (!queue) {
    queueSummaryEl.innerHTML = "";
    queueListEl.innerHTML = "";
    queueMarkdownEl.textContent = "";
    return;
  }
  const summary = queue.summary || {};
  queueSummaryEl.innerHTML = "";
  const summaryItems = [
    ["Total", summary.total || 0],
    ["Ready", summary.statuses?.["ready-for-maintainer"] || 0],
    ["Repair", summary.statuses?.["needs-repair"] || 0],
    ["Low value", summary.statuses?.["low-review-value"] || 0],
    ["Context", summary.contextFindings || 0],
    ["Calibration", summary.calibrationMatches || 0],
    ["Budget", `${summary.reviewBudgetMinutes || 0} min`]
  ];
  for (const [label, value] of summaryItems) {
    const tile = document.createElement("div");
    tile.className = "queue-tile";
    tile.innerHTML = "<span></span><strong></strong>";
    tile.querySelector("span").textContent = label;
    tile.querySelector("strong").textContent = String(value);
    queueSummaryEl.append(tile);
  }
  for (const group of queue.nextActionGroups || []) {
    if (!group.count) continue;
    queueSummaryEl.append(summaryTile(group.title || group.id, group.count));
  }

  const items = (queue.items || []).filter((item) => currentQueueFilter === "all" || item.status === currentQueueFilter);
  queueListEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "No queue items match this filter.";
    queueListEl.append(empty);
  }
  for (const group of groupQueueItemsByNextAction(queue, items)) {
    queueListEl.append(renderQueueGroup(group));
  }
  queueMarkdownEl.textContent = queue.markdown || "";
}

function groupQueueItemsByNextAction(queue, items) {
  const metadata = queue.nextActionGroups?.length
    ? queue.nextActionGroups
    : deriveNextActionGroups(items);
  return metadata
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.nextAction?.id === group.id)
    }))
    .filter((group) => group.items.length)
    .sort((left, right) => (left.order || 99) - (right.order || 99));
}

function deriveNextActionGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const action = item.nextAction || {};
    const id = action.id || "unknown";
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        title: action.title || id,
        target: action.target || "",
        owner: action.owner || action.target || "unknown",
        summary: action.summary || "",
        maintainerAction: action.maintainerAction || "",
        order: action.order || 99,
        count: 0
      });
    }
    groups.get(id).count += 1;
  }
  return [...groups.values()];
}

function renderQueueGroup(group) {
  const section = document.createElement("section");
  section.className = `queue-group queue-group-${group.id || "unknown"}`;
  section.innerHTML = `
    <div class="queue-group-heading">
      <div>
        <h3></h3>
        <p></p>
      </div>
      <span></span>
    </div>
    <div class="queue-group-items"></div>
  `;
  section.querySelector("h3").textContent = group.title || group.id || "Next action";
  section.querySelector("p").textContent = `${group.maintainerAction || group.summary || ""} Owner: ${group.owner || group.target || "unknown"}.`;
  section.querySelector(".queue-group-heading span").textContent = `${group.items.length} item${group.items.length === 1 ? "" : "s"}`;
  const list = section.querySelector(".queue-group-items");
  for (const item of group.items) {
    list.append(renderQueueItem(item));
  }
  return section;
}

function renderSetup(setup) {
  if (!setup?.ok) return;
  setupSummaryEl.innerHTML = "";
  const summaryItems = [
    ["Mode", setup.mode],
    ["Writes", setup.safety?.verdict || "unknown"],
    ["App Auth", setup.github?.appAuthReady ? "ready" : "not ready"],
    ["Webhook", setup.github?.webhookSecretConfigured ? "set" : "missing"],
    ["History", setup.history?.enabled ? "on" : "off"],
    ["Queue", setup.github?.queueLimit || 25]
  ];
  for (const [label, value] of summaryItems) {
    setupSummaryEl.append(summaryTile(label, value));
  }
  renderList(
    setupChecklistEl,
    (setup.checklist || []).map((item) => `${item.ok ? "pass" : "warn"}: ${item.label} - ${item.detail}`)
  );
  renderList(
    setupPilotEl,
    (setup.pilot?.steps || []).slice(0, 6).map((item) => `${item.status}: ${item.label} - ${item.command}`)
  );
  setupWarningsEl.textContent = setup.warnings?.length ? setup.warnings.join(" ") : "Setup posture is dry-run safe.";
}

function renderCalibration(calibration) {
  calibrationSummaryEl.innerHTML = "";
  const summary = calibration?.summary || {};
  for (const [label, value] of [
    ["Calibration", calibration?.active ? "active" : "empty"],
    ["Corrections", summary.corrections || 0],
    ["Candidates", summary.candidateFixtures || 0],
    ["Replay Pass", summary.replayPassing || 0],
    ["Context Miss", summary.contextMisses || 0]
  ]) {
    calibrationSummaryEl.append(summaryTile(label, value));
  }
}

function renderHistory(history) {
  historySummaryEl.innerHTML = "";
  const summary = history?.summary || {};
  for (const [label, value] of [
    ["Runs", summary.totalRuns || 0],
    ["Latest", summary.latestTotal || 0],
    ["Ready", summary.latestReady || 0],
    ["Improved", summary.improved || 0],
    ["Regressed", summary.regressed || 0],
    ["New", summary.newItems || 0]
  ]) {
    historySummaryEl.append(summaryTile(label, value));
  }
  historyListEl.innerHTML = "";
  const entries = history?.entries || [];
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "No queue runs recorded yet.";
    historyListEl.append(empty);
    return;
  }
  for (const entry of entries.slice(0, 6)) {
    const row = document.createElement("article");
    row.className = "history-entry";
    const statuses = entry.summary?.statuses || {};
    row.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
      </div>
      <span></span>
    `;
    row.querySelector("strong").textContent = entry.repository || "repository";
    row.querySelector("p").textContent = `ready ${statuses["ready-for-maintainer"] || 0}, repair ${statuses["needs-repair"] || 0}, low ${statuses["low-review-value"] || 0}; improved ${entry.transitions?.improved || 0}, regressed ${entry.transitions?.regressed || 0}, new ${entry.transitions?.newItems || 0}`;
    row.querySelector("span").textContent = new Date(entry.recordedAt || entry.generatedAt || Date.now()).toLocaleTimeString();
    historyListEl.append(row);
  }
}

function renderHistoryFromQueueResponse(history) {
  if (!history?.recorded) return;
  const summary = {
    totalRuns: history.summary?.totalRuns || 0,
    latestTotal: history.summary?.latestTotal || 0,
    latestReady: history.summary?.latestReady || 0,
    improved: history.summary?.improved || 0,
    regressed: history.summary?.regressed || 0,
    newItems: history.summary?.newItems || 0
  };
  historySummaryEl.innerHTML = "";
  for (const [label, value] of [
    ["Runs", summary.totalRuns],
    ["Latest", summary.latestTotal],
    ["Ready", summary.latestReady],
    ["Improved", summary.improved],
    ["Regressed", summary.regressed],
    ["New", summary.newItems]
  ]) {
    historySummaryEl.append(summaryTile(label, value));
  }
}

function renderFeedback(feedback) {
  feedbackSummaryEl.innerHTML = "";
  const summary = feedback?.summary || {};
  for (const [label, value] of [
    ["Cases", summary.total || 0],
    ["Corrections", summary.corrections || 0],
    ["Agreement", `${Math.round((summary.agreementRate || 0) * 100)}%`],
    ["Overblocked", summary.falsePositivePressure || 0],
    ["Underblocked", summary.falseNegativePressure || 0],
    ["Regression", summary.regressionCandidates || 0]
  ]) {
    feedbackSummaryEl.append(summaryTile(label, value));
  }

  feedbackListEl.innerHTML = "";
  const entries = feedback?.entries || [];
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "No maintainer feedback recorded yet.";
    feedbackListEl.append(empty);
    return;
  }
  for (const entry of entries.slice(0, 6)) {
    const row = document.createElement("article");
    row.className = "feedback-entry";
    row.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
      </div>
      <span></span>
    `;
    row.querySelector("strong").textContent = entry.caseFile?.title || entry.item?.title || entry.itemKey;
    row.querySelector("p").textContent = entry.caseFile?.summary || entry.maintainer?.verdict || "";
    row.querySelector("span").textContent = entry.caseFile?.regressionCandidate ? "fixture" : "evidence";
    feedbackListEl.append(row);
  }
}

function renderCandidateReview(exportData) {
  candidateReviewEl.innerHTML = "";
  const cases = exportData?.cases || [];
  if (!cases.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "No feedback export candidates yet.";
    candidateReviewEl.append(empty);
    return;
  }
  for (const item of cases.slice(0, 10)) {
    const row = document.createElement("article");
    row.className = `candidate-entry ${item.runnableFixture ? "runnable" : "manual"}`;
    row.innerHTML = `
      <label class="check-row candidate-select-row">
        <input data-candidate-select type="checkbox">
        <span></span>
      </label>
      <div>
        <strong></strong>
        <p></p>
      </div>
      <span class="candidate-state"></span>
    `;
    const input = row.querySelector("[data-candidate-select]");
    input.value = item.id;
    input.disabled = !item.runnableFixture;
    row.querySelector(".candidate-select-row span").textContent = item.runnableFixture ? "Apply" : "Manual";
    row.querySelector("strong").textContent = item.title || item.id;
    row.querySelector("p").textContent = item.runnableFixture
      ? `Expected ${item.expectedStatus}; replay ${item.replay?.passedAgainstExpected ? "passes" : "fails"}.`
      : item.manualReason || "Original payload required.";
    row.querySelector(".candidate-state").textContent = item.runnableFixture ? "runnable" : "manual";
    candidateReviewEl.append(row);
  }
}

function renderCandidateApplyResult(result) {
  const applied = result.applied?.length || 0;
  const skipped = result.skipped?.length || 0;
  candidateReplayEl.textContent = `Applied ${applied} fixture draft(s); skipped ${skipped}.`;
}

function renderCandidateEvidence(artifact) {
  const summary = artifact.summary || {};
  candidateArtifactEl.textContent = [
    `Shareable candidate evidence: ${summary.replayPassed || 0}/${summary.total || 0} passing`,
    `JSON fixture bundle cases: ${artifact.fixtureBundle?.fixtures?.length || 0}`,
    "",
    artifact.markdown || ""
  ].join("\n");
}

function renderReplayBaselineCaptured(baseline) {
  const summary = baseline.replay?.summary || {};
  candidateComparisonEl.innerHTML = "";
  const row = document.createElement("article");
  row.className = "candidate-entry pass";
  row.innerHTML = `
    <div>
      <strong></strong>
      <p></p>
    </div>
    <span class="candidate-state"></span>
  `;
  row.querySelector("strong").textContent = "Baseline captured";
  row.querySelector("p").textContent = `${summary.passed || 0}/${summary.total || 0} passing at ${new Date(baseline.capturedAt).toLocaleTimeString()}.`;
  row.querySelector(".candidate-state").textContent = "baseline";
  candidateComparisonEl.append(row);
}

function renderReplayComparison(comparison, baseline) {
  candidateComparisonEl.innerHTML = "";
  const summary = comparison.summary || {};
  const tiles = document.createElement("div");
  tiles.className = "candidate-summary";
  for (const [label, value] of [
    ["Base Pass", `${summary.baselinePassed || 0}/${summary.baselineTotal || 0}`],
    ["Now Pass", `${summary.currentPassed || 0}/${summary.currentTotal || 0}`],
    ["Delta", summary.passDelta || 0],
    ["Regressed", summary.regressed || 0]
  ]) {
    tiles.append(summaryTile(label, value));
  }
  candidateComparisonEl.append(tiles);

  const meta = document.createElement("p");
  meta.className = "queue-empty";
  meta.textContent = `Baseline ${new Date(baseline.capturedAt).toLocaleString()}; risk ${summary.risk || "unknown"}.`;
  candidateComparisonEl.append(meta);

  const list = document.createElement("div");
  list.className = "candidate-replay-list";
  for (const item of (comparison.changes || []).slice(0, 8)) {
    const row = document.createElement("article");
    row.className = `candidate-entry ${comparisonClass(item.transition)}`;
    row.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
      </div>
      <span class="candidate-state"></span>
    `;
    row.querySelector("strong").textContent = item.title || item.candidateId;
    row.querySelector("p").textContent = `${item.baseline?.actualStatus || "n/a"} -> ${item.current?.actualStatus || "n/a"}; score delta ${item.scoreDelta ?? "n/a"}.`;
    row.querySelector(".candidate-state").textContent = item.transition;
    list.append(row);
  }
  candidateComparisonEl.append(list);
}

function readReplayBaseline() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANDIDATE_REPLAY_BASELINE_KEY) || "null");
    if (!parsed?.replay?.results?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function comparisonClass(transition) {
  if (transition === "regressed") return "fail";
  if (transition === "improved") return "pass";
  if (transition === "new" || transition === "gone" || transition === "changed") return "manual";
  return "runnable";
}

function renderCandidateReplay(replay, corpus) {
  candidateReplayEl.innerHTML = "";
  const summary = replay?.summary || {};
  const corpusSummary = corpus?.summary || {};
  const tiles = document.createElement("div");
  tiles.className = "candidate-summary";
  for (const [label, value] of [
    ["Corpus", corpusSummary.total || 0],
    ["Replay Pass", summary.passed || 0],
    ["Replay Fail", summary.failed || 0],
    ["Pass Rate", `${Math.round((summary.passRate || 0) * 100)}%`]
  ]) {
    tiles.append(summaryTile(label, value));
  }
  candidateReplayEl.append(tiles);

  const results = replay?.results || [];
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = currentFeedbackExport ? "No fixture drafts have been applied yet." : "Export feedback to review runnable fixture drafts.";
    candidateReplayEl.append(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "candidate-replay-list";
  for (const item of results.slice(0, 8)) {
    const row = document.createElement("article");
    row.className = `candidate-entry ${item.passed ? "pass" : "fail"}`;
    row.innerHTML = `
      <div>
        <strong></strong>
        <p></p>
      </div>
      <span class="candidate-state"></span>
    `;
    row.querySelector("strong").textContent = item.title || item.candidateId;
    row.querySelector("p").textContent = item.failures?.length
      ? item.failures.join("; ")
      : `Expected ${item.expectedStatus}; got ${item.actualStatus} at ${item.actualScore}/100.`;
    row.querySelector(".candidate-state").textContent = item.passed ? "pass" : "fail";
    list.append(row);
  }
  candidateReplayEl.append(list);
}

function renderQueueItem(item) {
  const article = document.createElement("article");
  article.className = `queue-item ${item.status}`;
  const number = item.number ? `#${item.number}` : item.kind;
  article.innerHTML = `
    <div class="queue-item-head">
      <div>
        <p class="queue-item-meta"><span class="queue-number"></span> · <span class="queue-kind"></span> · <strong></strong></p>
        <h3></h3>
      </div>
      <span class="queue-status"></span>
    </div>
    <div class="queue-item-stats"></div>
    <div class="queue-item-labels"></div>
    <ul class="plain-list queue-reasons"></ul>
    <p class="queue-next-action"></p>
    <div class="queue-next-evidence"></div>
    <details class="queue-explainer" open>
      <summary>Why PCF routed this here</summary>
      <ul class="plain-list queue-explainer-list"></ul>
    </details>
    <div class="queue-response-template">
      <div class="queue-template-head">
        <div>
          <strong></strong>
          <span></span>
        </div>
        <button type="button">Copy Draft</button>
      </div>
      <pre></pre>
    </div>
    <p class="queue-context"></p>
    <div class="queue-feedback">
      <div class="feedback-controls">
        <label>
          <span>Expected</span>
          <select class="feedback-expected">
            <option value="ready-for-maintainer">ready-for-maintainer</option>
            <option value="needs-repair">needs-repair</option>
            <option value="low-review-value">low-review-value</option>
          </select>
        </label>
        <label>
          <span>Note</span>
          <textarea class="feedback-note" rows="2" placeholder="What did PCF miss?"></textarea>
        </label>
        <label class="check-row feedback-fixture">
          <input class="feedback-fixture-check" type="checkbox" checked>
          <span>Regression candidate</span>
        </label>
      </div>
      <div class="feedback-buttons" aria-label="Maintainer feedback actions">
        <button type="button" data-feedback-verdict="correct">Correct</button>
        <button type="button" data-feedback-verdict="too-harsh">Too Harsh</button>
        <button type="button" data-feedback-verdict="too-lenient">Too Lenient</button>
        <button type="button" data-feedback-verdict="missed-duplicate">Missed Duplicate</button>
        <button type="button" data-feedback-verdict="missed-upstream-fix">Missed Upstream</button>
      </div>
      <p class="feedback-state" aria-live="polite"></p>
    </div>
  `;
  const numberNode = article.querySelector(".queue-number");
  if (safeHttpUrl(item.htmlUrl)) {
    const link = document.createElement("a");
    link.href = item.htmlUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = number;
    numberNode.replaceWith(link);
  } else {
    numberNode.textContent = number;
  }
  article.querySelector(".queue-kind").textContent = item.kind;
  article.querySelector(".queue-item-meta strong").textContent = `${item.score}/100`;
  article.querySelector("h3").textContent = item.title || "Untitled";
  article.querySelector(".queue-status").textContent = item.action;

  const stats = article.querySelector(".queue-item-stats");
  for (const stat of [
    `budget ${item.reviewBudget?.minutes || 0} min`,
    `${item.failureCount || 0} fail`,
    `${item.warningCount || 0} warn`,
    `${item.contextFindings || 0} context`,
    `${item.calibration?.matches || 0} calibration`
  ]) {
    const span = document.createElement("span");
    span.textContent = stat;
    stats.append(span);
  }

  const labels = article.querySelector(".queue-item-labels");
  for (const label of item.labels || []) {
    const span = document.createElement("span");
    span.className = "label";
    span.textContent = label;
    labels.append(span);
  }

  renderList(
    article.querySelector(".queue-reasons"),
    item.topReasons?.length
      ? item.topReasons.map((reason) => `${reason.status}: ${reason.title} - ${reason.reason}`)
      : ["No repair reasons."]
  );
  const nextAction = item.nextAction || {};
  article.querySelector(".queue-next-action").textContent = nextAction.id
    ? `Next action: ${nextAction.title || nextAction.id} (${nextAction.owner || nextAction.target || "unknown"}) - ${nextAction.maintainerAction || nextAction.reason || nextAction.summary || ""}`
    : "Next action: unknown";
  renderNextActionEvidence(article.querySelector(".queue-next-evidence"), nextAction);
  renderQueueExplainer(article.querySelector(".queue-explainer-list"), item, nextAction);
  renderQueueResponseTemplate(article.querySelector(".queue-response-template"), item.responseTemplate);
  article.querySelector(".queue-context").textContent = `Context: ${item.contextSummary || "none"}`;
  if (item.calibration?.active) {
    const calibration = document.createElement("p");
    calibration.className = "queue-context";
    calibration.textContent = `Calibration: ${item.calibration.summary}`;
    article.querySelector(".queue-context").after(calibration);
  }
  const expectedSelect = article.querySelector(".feedback-expected");
  expectedSelect.value = suggestedExpectedStatus(item.status);
  for (const button of article.querySelectorAll("[data-feedback-verdict]")) {
    button.addEventListener("click", async () => {
      await submitQueueFeedback(item, {
        article,
        verdict: button.dataset.feedbackVerdict,
        expectedSelect
      });
    });
  }
  return article;
}

function renderNextActionEvidence(node, nextAction = {}) {
  node.innerHTML = "";
  const evidence = nextAction.evidence || {};
  const chips = [
    ...(evidence.labels || []).map((label) => `label: ${label}`),
    ...(evidence.checks || []).map((check) => `check: ${check.title || check.id || check.label}`),
    ...(evidence.reasons || []).slice(0, 2)
  ].filter(Boolean);
  if (!chips.length) return;
  for (const chip of chips.slice(0, 5)) {
    const span = document.createElement("span");
    span.textContent = chip;
    node.append(span);
  }
}

function renderQueueExplainer(node, item = {}, nextAction = {}) {
  const evidence = nextAction.evidence || {};
  const checks = evidence.checks || [];
  const labels = evidence.labels || [];
  const topReason = item.topReasons?.[0];
  const explanation = [
    nextAction.owner ? `Next actor: ${nextAction.owner}.` : "",
    nextAction.maintainerAction ? `Maintainer move: ${nextAction.maintainerAction}` : "",
    nextAction.reason ? `Route reason: ${nextAction.reason}` : "",
    labels.length ? `Labels driving route: ${labels.slice(0, 4).join(", ")}.` : "",
    checks.length ? `Checks driving route: ${checks.slice(0, 3).map((check) => check.title || check.id || check.label).filter(Boolean).join(", ")}.` : "",
    topReason ? `Top review signal: ${topReason.title} - ${topReason.reason}` : "",
    item.contextSummary ? `Repository context: ${item.contextSummary}` : ""
  ].filter(Boolean);

  renderList(node, explanation.length ? explanation : ["No route explanation available."]);
}

function renderQueueResponseTemplate(node, template = {}) {
  if (!template?.body) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.querySelector("strong").textContent = template.title || "Dry-run response draft";
  node.querySelector("span").textContent = `${template.audience || "unknown"} · ${template.channel || "unknown"} · ${template.posting || "disabled"}`;
  node.querySelector("pre").textContent = template.body;
  const button = node.querySelector("button");
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(template.body);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy Draft";
    }, 1200);
  });
}

async function submitQueueFeedback(item, { article, verdict, expectedSelect }) {
  const noteEl = article.querySelector(".feedback-note");
  const fixtureEl = article.querySelector(".feedback-fixture-check");
  const stateEl = article.querySelector(".feedback-state");
  const expectedStatus = verdict === "correct" ? item.status : expectedSelect.value;
  stateEl.textContent = "Recording feedback...";
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repository: currentQueue?.repository || item.repository || "",
      item: compactQueueItemForFeedback(item),
      verdict,
      expectedStatus,
      note: noteEl.value,
      shouldBecomeFixture: verdict !== "correct" && fixtureEl.checked,
      originalPayload: item.fixtureInput || null
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    stateEl.textContent = data.error || "Feedback failed.";
    return;
  }
  stateEl.textContent = data.feedback?.entry?.caseFile?.summary || "Feedback recorded.";
  noteEl.value = "";
  await loadFeedback();
  await loadFeedbackCalibration();
}

function compactQueueItemForFeedback(item) {
  return {
    id: item.id,
    kind: item.kind,
    number: item.number,
    title: item.title,
    repository: item.repository || currentQueue?.repository || "",
    htmlUrl: item.htmlUrl,
    updatedAt: item.updatedAt,
    status: item.status,
    action: item.action,
    nextAction: item.nextAction,
    score: item.score,
    labels: item.labels,
    contextSummary: item.contextSummary,
    contextFindings: item.contextFindings,
    reviewBudget: item.reviewBudget,
    failureCount: item.failureCount,
    warningCount: item.warningCount,
    topReasons: item.topReasons,
    fixtureInput: item.fixtureInput
  };
}

function suggestedExpectedStatus(status) {
  if (status === "ready-for-maintainer") return "needs-repair";
  return "ready-for-maintainer";
}

function formatRepositoryContext(repositoryContext) {
  if (!repositoryContext?.hasContext) return ["No repository context supplied."];
  if (!repositoryContext.findings?.length) return [repositoryContext.summary];
  return repositoryContext.findings.map((item) => {
    const number = item.number ? `#${item.number} ` : "";
    const source = item.scope === "upstream" ? "upstream" : "repo";
    const overlap = item.fileOverlap?.length ? `; overlaps ${item.fileOverlap.slice(0, 3).join(", ")}` : "";
    const url = item.url ? `; ${item.url}` : "";
    return `${item.relation} ${source}: ${number}${item.title || item.sha || item.tagName || "untitled"} [${item.state}]${overlap}${url}`;
  });
}

function emptyRepositoryContext() {
  return {
    issues: [],
    pullRequests: [],
    upstream: {
      issues: [],
      pullRequests: [],
      commits: [],
      releases: []
    }
  };
}

function renderList(node, items) {
  node.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    node.append(li);
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function summaryTile(label, value) {
  const tile = document.createElement("div");
  tile.className = "queue-tile";
  tile.innerHTML = "<span></span><strong></strong>";
  tile.querySelector("span").textContent = label;
  tile.querySelector("strong").textContent = String(value);
  return tile;
}
