const DEFAULT_INVITATION_LABELS = [
  "help wanted",
  "good first issue",
  "first-timers-only",
  "easy",
  "accepted",
  "confirmed",
  "reproduced"
];

const DEFAULT_PLATFORM_RISK_TERMS = [
  "windows",
  "macos",
  "ios",
  "safari",
  "android",
  "hardware",
  "gpu",
  "driver"
];

const DEFAULT_SKIP_TERMS = [
  "wontfix",
  "duplicate",
  "blocked",
  "needs design",
  "architecture"
];

export function buildContributorScout(input = {}) {
  const candidates = normalizeCandidates(input.candidates || input.issues || []);
  const options = {
    minScore: clampNumber(input.minScore, 0, 0, 100),
    invitationLabels: normalizeStrings(input.invitationLabels || DEFAULT_INVITATION_LABELS).map((item) => item.toLowerCase()),
    platformRiskTerms: normalizeStrings(input.platformRiskTerms || DEFAULT_PLATFORM_RISK_TERMS).map((item) => item.toLowerCase()),
    skipTerms: normalizeStrings(input.skipTerms || DEFAULT_SKIP_TERMS).map((item) => item.toLowerCase()),
    requireInvitation: input.requireInvitation !== false
  };

  const rows = candidates
    .map((candidate) => scoreCandidate(candidate, options))
    .filter((candidate) => candidate.score >= options.minScore)
    .sort(compareScoutRows);

  return {
    ok: true,
    artifact: "pcf-contributor-scout",
    generatedAt: input.generatedAt || new Date().toISOString(),
    profile: input.profile || "contributor",
    summary: {
      total: candidates.length,
      returned: rows.length,
      candidate: rows.filter((row) => row.status === "candidate").length,
      review: rows.filter((row) => row.status === "review").length,
      blocked: rows.filter((row) => row.status === "blocked").length
    },
    candidates: rows,
    nextActions: rows.slice(0, 5).map((row) => ({
      repository: row.repository,
      item: row.item,
      status: row.status,
      nextGate: row.nextGate,
      reason: row.reason
    })),
    nonClaims: [
      "Scout ranks supplied candidates only; it does not search all of GitHub.",
      "A candidate row is not permission to code. Run overlap, policy, repro, TODO/FIXME, and diff-shape gates first.",
      "Platform risk means the agent may not be able to reproduce locally."
    ]
  };
}

function scoreCandidate(candidate, options) {
  const labels = candidate.labels.map((label) => label.toLowerCase());
  const text = `${candidate.title}\n${candidate.body}\n${labels.join(" ")}`.toLowerCase();
  const blockers = [];
  const warnings = [];
  let score = 50;

  const invitationSignals = labels.filter((label) => options.invitationLabels.some((signal) => label.includes(signal)));
  if (invitationSignals.length) score += 20;
  if (candidate.maintainerComment) score += 8;
  if (candidate.issuePaths.length) score += 10;
  if (candidate.acceptanceCriteria) score += 8;
  if (candidate.reproduction) score += 8;
  if (candidate.testsMentioned) score += 5;

  if (options.requireInvitation && !invitationSignals.length && !candidate.maintainerComment) {
    warnings.push({
      id: "no-invitation-signal",
      reason: "No help-wanted, maintainer request, confirmed, accepted, or reproduced signal was supplied."
    });
    score -= 15;
  }

  if (candidate.assigned) {
    blockers.push({ id: "assigned", reason: "Issue is assigned or appears owner-held." });
    score -= 30;
  }
  if (candidate.openPullRequestOverlap) {
    blockers.push({ id: "open-pr-overlap", reason: "Open PR overlap was supplied for this lane." });
    score -= 40;
  }
  if (candidate.maintainerOwnedFix) {
    blockers.push({
      id: "maintainer-owned-fix",
      reason: "A maintainer-owned same-lane fix was supplied; do not open a competing contribution."
    });
    score -= 45;
  }
  if (candidate.issueClosedDuringWork) {
    blockers.push({
      id: "issue-closed-during-work",
      reason: "The issue closed during the work window; re-check before publishing."
    });
    score -= 40;
  }
  if (candidate.closedOrSolvedOverlap) {
    warnings.push({ id: "closed-or-solved-overlap", reason: "Closed/solved overlap needs manual verification before coding." });
    score -= 15;
  }
  if (candidate.forkPrAllowed === false) {
    blockers.push({ id: "fork-pr-not-allowed", reason: "Contribution route does not appear to accept direct fork PRs." });
    score -= 35;
  }

  const platformHits = options.platformRiskTerms.filter((term) => text.includes(term));
  if (platformHits.length && candidate.platformFit !== true) {
    warnings.push({
      id: "platform-fit-risk",
      reason: `Platform-specific terms found: ${platformHits.slice(0, 4).join(", ")}.`
    });
    score -= 12;
  }

  const skipHits = options.skipTerms.filter((term) => text.includes(term));
  if (skipHits.length) {
    warnings.push({
      id: "skip-term",
      reason: `Potential broad/blocked/duplicate signal: ${skipHits.slice(0, 4).join(", ")}.`
    });
    score -= 10;
  }

  if (!candidate.issuePaths.length && !candidate.acceptanceCriteria) {
    warnings.push({
      id: "broad-surface",
      reason: "No exact file path or acceptance criteria supplied."
    });
    score -= 8;
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const status = blockers.length ? "blocked" : warnings.length ? "review" : "candidate";
  return {
    repository: candidate.repository,
    item: candidate.number ? `#${candidate.number}` : candidate.id,
    number: candidate.number,
    title: candidate.title,
    url: candidate.url,
    status,
    score: clampedScore,
    priority: candidate.priority || (clampedScore >= 85 ? "high" : clampedScore >= 70 ? "medium" : "low"),
    invitationSignals,
    issuePaths: candidate.issuePaths,
    blockers,
    warnings,
    reason: reasonForStatus(status, blockers, warnings),
    nextGate: nextGateForStatus(status)
  };
}

function normalizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      id: String(candidate.id || (candidate.number ? `issue-${candidate.number}` : `candidate-${index + 1}`)),
      repository: String(candidate.repository || candidate.repo || ""),
      number: candidate.number || "",
      title: String(candidate.title || ""),
      body: String(candidate.body || candidate.description || ""),
      url: String(candidate.url || candidate.htmlUrl || candidate.html_url || ""),
      labels: normalizeLabels(candidate.labels || []),
      issuePaths: normalizeStrings(candidate.issuePaths || candidate.paths || candidate.files || []),
      acceptanceCriteria: Boolean(candidate.acceptanceCriteria || candidate.acceptance || /acceptance criteria/i.test(candidate.body || "")),
      reproduction: Boolean(candidate.reproduction || candidate.repro || /steps to reproduce|repro|expected|actual/i.test(candidate.body || "")),
      testsMentioned: Boolean(candidate.testsMentioned || /test|tests|testing/i.test(candidate.body || "")),
      maintainerComment: Boolean(candidate.maintainerComment || candidate.maintainer_signal || candidate.maintainerSignal),
      assigned: Boolean(candidate.assigned || candidate.assignee || candidate.assignees?.length),
      openPullRequestOverlap: Boolean(candidate.openPullRequestOverlap || candidate.openPrOverlap || candidate.overlap?.open),
      maintainerOwnedFix: Boolean(candidate.maintainerOwnedFix || candidate.maintainerOwnedPr || candidate.recentMaintainerPr || candidate.overlap?.maintainerOwned || candidate.overlap?.recentMaintainerFix),
      issueClosedDuringWork: Boolean(candidate.issueClosedDuringWork || candidate.closedDuringWork || candidate.issue?.closedDuringWork),
      closedOrSolvedOverlap: Boolean(candidate.closedOrSolvedOverlap || candidate.closedOverlap || candidate.overlap?.closed),
      forkPrAllowed: candidate.forkPrAllowed,
      platformFit: candidate.platformFit,
      priority: String(candidate.priority || "")
    }))
    .filter((candidate) => candidate.repository || candidate.title || candidate.number);
}

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : [labels])
    .map((label) => typeof label === "string" ? label : label?.name)
    .map((label) => String(label || "").trim())
    .filter(Boolean);
}

function normalizeStrings(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => typeof value === "string" ? value : value?.path || value?.filename || value?.name)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function compareScoutRows(left, right) {
  const statusOrder = { candidate: 0, review: 1, blocked: 2 };
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
    || (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
    || right.score - left.score
    || String(left.repository).localeCompare(String(right.repository));
}

function nextGateForStatus(status) {
  if (status === "blocked") return "Do not code; inspect blocker and choose another lane unless human override exists.";
  if (status === "review") return "Run manual policy, overlap, platform, and TODO/FIXME checks before coding.";
  return "Run overlap, policy, current-upstream repro, TODO/FIXME, and diff-shape gates.";
}

function reasonForStatus(status, blockers, warnings) {
  if (status === "blocked") return blockers[0]?.reason || "Blocked by supplied lane evidence.";
  if (status === "review") return warnings[0]?.reason || "Needs manual review before coding.";
  return "Invitation and scope signals look promising from supplied evidence.";
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}
