export function normalizeWatchlistConfig(config = {}) {
  const defaults = {
    limit: clampNumber(config.defaults?.limit, 10, 1, 100),
    includeIssues: config.defaults?.includeIssues !== false,
    includePullRequests: Boolean(config.defaults?.includePullRequests),
    contributorPreflight: config.defaults?.contributorPreflight !== false
  };
  const repositories = (Array.isArray(config.repositories) ? config.repositories : [])
    .map((entry, index) => normalizeWatchlistEntry(entry, defaults, index))
    .filter(Boolean);

  return {
    name: String(config.name || "PCF watchlist"),
    defaults,
    repositories
  };
}

export function buildWatchlistReport({
  config = {},
  runs = [],
  generatedAt = new Date().toISOString()
} = {}) {
  const normalized = normalizeWatchlistConfig(config);
  const runRows = [];
  const candidates = [];
  let disabled = 0;
  let errors = 0;

  for (const run of runs || []) {
    const entry = normalizeWatchlistEntry(run.entry || run, normalized.defaults, runRows.length);
    if (!entry) continue;
    if (!entry.enabled || run.disabled) {
      disabled += 1;
      runRows.push(repoRunRow({ entry, disabled: true }));
      continue;
    }
    if (run.error) errors += 1;
    const row = repoRunRow({ entry, proof: run.proof, error: run.error });
    runRows.push(row);
    candidates.push(...candidateRowsForRun({ entry, proof: run.proof }));
  }

  const orderedCandidates = candidates.sort(compareCandidateRows);
  const summary = {
    repositories: runRows.length,
    scanned: runRows.filter((row) => row.status === "scanned").length,
    disabled,
    errors,
    reviewNowIssues: sum(runRows, (row) => row.reviewNowIssues),
    candidates: orderedCandidates.filter((row) => row.status === "candidate").length,
    blocked: orderedCandidates.filter((row) => row.status === "blocked").length,
    unchecked: orderedCandidates.filter((row) => row.status === "unchecked").length,
    candidateRows: orderedCandidates.length
  };

  return {
    ok: errors === 0,
    artifact: "pcf-watchlist-report",
    generatedAt,
    name: normalized.name,
    dryRun: true,
    watchlist: {
      defaults: normalized.defaults,
      repositories: normalized.repositories.map((entry) => ({
        repository: entry.repository,
        enabled: entry.enabled,
        priority: entry.priority,
        reason: entry.reason,
        limit: entry.limit
      }))
    },
    summary,
    repositories: runRows,
    candidates: orderedCandidates,
    nonClaims: [
      "Watchlist mode is curated; it does not search all of GitHub for repositories.",
      "Watchlist mode is read-only and does not clone repositories, write patches, open PRs, comment, label, or contact maintainers.",
      "A candidate result means no exact open PR overlap was found by this gate; contribution policy and current-upstream behavior still need separate checks.",
      "Blocked and unchecked rows are useful evidence, not failures."
    ]
  };
}

export function renderWatchlistMarkdown(report = {}) {
  const repoRows = (report.repositories || []).map((row) => [
    row.status,
    row.repository,
    row.priority,
    row.sampled,
    row.reviewNowIssues,
    row.candidates,
    row.blocked,
    row.unchecked,
    row.error || "none"
  ]);
  const candidateRows = (report.candidates || []).map((row) => [
    row.status,
    row.repository,
    row.priority,
    row.item,
    row.title,
    row.score,
    row.blocker || "none",
    row.nextGate
  ]);

  return [
    "# PCF Watchlist Contribution Radar",
    "",
    `Generated: ${report.generatedAt || ""}`,
    `Watchlist: ${report.name || "PCF watchlist"}`,
    "",
    "## Safety Posture",
    "",
    "Dry-run: **yes**",
    "",
    "No repositories were cloned. No comments, labels, pull requests, patches, or other GitHub writes were made.",
    "",
    "## Summary",
    "",
    `Repositories scanned: ${report.summary?.scanned || 0}`,
    `Repositories disabled: ${report.summary?.disabled || 0}`,
    `Repository errors: ${report.summary?.errors || 0}`,
    `Review-now issue candidates checked: ${report.summary?.reviewNowIssues || 0}`,
    `Candidate after PR-overlap gate: ${report.summary?.candidates || 0}`,
    `Blocked by open PR overlap: ${report.summary?.blocked || 0}`,
    `Unchecked: ${report.summary?.unchecked || 0}`,
    "",
    "## Candidate Queue",
    "",
    "| Status | Repository | Priority | Item | Title | Score | Blocker | Next Gate |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- |",
    ...(candidateRows.length ? candidateRows : [["none", "n/a", "n/a", "n/a", "No candidate rows in this run.", "0", "none", "No action."]]).map(markdownRow),
    "",
    "## Repository Runs",
    "",
    "| Status | Repository | Priority | Sampled | Review-Now Issues | Candidate | Blocked | Unchecked | Error |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...(repoRows.length ? repoRows : [["none", "n/a", "n/a", "0", "0", "0", "0", "0", "none"]]).map(markdownRow),
    "",
    "## Non-Claims",
    "",
    ...(report.nonClaims || []).map((claim) => `- ${claim}`),
    ""
  ].join("\n");
}

export function renderWatchlistSummary(report = {}) {
  return [
    "PCF Watchlist Contribution Radar",
    `Watchlist: ${report.name || "PCF watchlist"}`,
    `Repositories scanned: ${report.summary?.scanned || 0}`,
    `Candidates: ${report.summary?.candidates || 0}`,
    `Blocked: ${report.summary?.blocked || 0}`,
    `Unchecked: ${report.summary?.unchecked || 0}`,
    `Errors: ${report.summary?.errors || 0}`,
    "Non-claim: read-only curated radar; candidates still need policy and current-upstream gates.",
    ""
  ].join("\n");
}

function normalizeWatchlistEntry(entry, defaults, index = 0) {
  const raw = typeof entry === "string" ? { repository: entry } : entry || {};
  const repository = normalizeRepository(raw.repository);
  if (!repository) return null;
  return {
    repository,
    enabled: raw.enabled !== false,
    priority: String(raw.priority || "medium"),
    reason: String(raw.reason || ""),
    limit: clampNumber(raw.limit ?? defaults.limit, defaults.limit, 1, 100),
    includeIssues: raw.includeIssues ?? defaults.includeIssues,
    includePullRequests: raw.includePullRequests ?? defaults.includePullRequests,
    contributorPreflight: raw.contributorPreflight ?? defaults.contributorPreflight,
    upstreamRepository: normalizeRepository(raw.upstreamRepository || ""),
    fixturePath: String(raw.fixture || raw.fixturePath || ""),
    preflightChecks: Array.isArray(raw.preflightChecks) ? raw.preflightChecks : null,
    order: index
  };
}

function repoRunRow({ entry, proof = null, error = "", disabled = false } = {}) {
  if (disabled) {
    return {
      repository: entry.repository,
      priority: entry.priority,
      status: "disabled",
      sampled: 0,
      reviewNowIssues: 0,
      candidates: 0,
      blocked: 0,
      unchecked: 0,
      error: ""
    };
  }
  const candidateSummary = proof?.contributorPreflight?.summary || {};
  return {
    repository: entry.repository,
    priority: entry.priority,
    status: error ? "error" : "scanned",
    sampled: proof?.breakdown?.total || 0,
    reviewNowIssues: candidateSummary.total || 0,
    candidates: candidateSummary.candidate || 0,
    blocked: candidateSummary.blocked || 0,
    unchecked: candidateSummary.unchecked || 0,
    error: String(error || "")
  };
}

function candidateRowsForRun({ entry, proof = {} } = {}) {
  const queueItems = new Map((proof.queue?.items || []).map((item) => [String(item.id), item]));
  return (proof.contributorPreflight?.candidates || []).map((candidate) => {
    const item = queueItems.get(String(candidate.id)) || {};
    return {
      repository: entry.repository,
      priority: entry.priority,
      status: candidate.status,
      item: candidate.number ? `#${candidate.number}` : candidate.id,
      number: candidate.number || "",
      title: candidate.title || item.title || "",
      url: candidate.htmlUrl || item.htmlUrl || "",
      score: item.score || 0,
      labels: item.labels || [],
      contextSummary: item.contextSummary || "",
      blocker: candidate.blockers?.[0]?.pullRequest || "",
      nextGate: nextGateForCandidate(candidate),
      reason: candidate.reason || "",
      contributorAction: candidate.contributorAction || ""
    };
  });
}

function nextGateForCandidate(candidate = {}) {
  if (candidate.status === "blocked") return "Inspect the open PR owner path before doing any work.";
  if (candidate.status === "candidate") return "Run contribution policy, AI/tooling policy, current-upstream reproduction, and local preflight.";
  return "Run manual PR-overlap preflight before cloning or coding.";
}

function compareCandidateRows(left, right) {
  const statusOrder = { candidate: 0, unchecked: 1, blocked: 2 };
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
    || (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
    || String(left.repository).localeCompare(String(right.repository))
    || Number(right.score || 0) - Number(left.score || 0);
}

function normalizeRepository(repository = "") {
  const text = String(repository || "").trim();
  const [owner, repo] = text.split("/");
  return owner && repo ? `${owner}/${repo}` : "";
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function sum(items, getValue) {
  return (items || []).reduce((total, item) => total + (Number(getValue(item)) || 0), 0);
}

function markdownRow(row) {
  return `| ${row.map(escapeTableCell).join(" | ")} |`;
}

function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}
