export function buildContributorPreflight({
  proof = {},
  checks = [],
  generatedAt = new Date().toISOString()
} = {}) {
  const items = proof.queue?.items || [];
  const reviewNowIssues = items.filter((item) => item.kind === "issue" && item.action === "review-now");
  const checkMap = new Map();
  for (const check of checks || []) {
    const keys = [
      check.itemId,
      check.id,
      check.number ? `issue-${check.number}` : "",
      check.number ? String(check.number) : ""
    ].filter(Boolean);
    for (const key of keys) checkMap.set(String(key), check);
  }

  const candidates = reviewNowIssues.map((item) => evaluateContributorCandidate(item, checkMap.get(String(item.id)) || checkMap.get(String(item.number))));
  const summary = {
    total: candidates.length,
    checked: candidates.filter((item) => item.checked).length,
    blocked: candidates.filter((item) => item.status === "blocked").length,
    candidate: candidates.filter((item) => item.status === "candidate").length,
    unchecked: candidates.filter((item) => item.status === "unchecked").length,
    blockers: candidates.reduce((sum, item) => sum + item.blockers.length, 0)
  };

  return {
    enabled: true,
    generatedAt,
    scope: "review-now issue candidates",
    summary,
    candidates,
    nonClaims: [
      "Contributor preflight only checks exact open PR ownership signals for review-now issues.",
      "A candidate result is not permission to code; contribution policy and current-upstream behavior still need separate checks.",
      "An unchecked result means PCF could not prove the PR-overlap gate, not that the issue is free to take."
    ]
  };
}

export function evaluateContributorCandidate(item = {}, check = null) {
  const number = item.number ? String(item.number) : "";
  const repository = item.repository || "";
  const collectionError = check?.collectionError || check?.error || "";
  const pullRequests = normalizePullRequests(check?.pullRequests || check?.openPullRequests || []);
  const blockers = collectionError ? [] : pullRequests
    .filter((pullRequest) => isOpenPullRequest(pullRequest))
    .filter((pullRequest) => referencesIssueNumber(pullRequest, number, repository))
    .map((pullRequest) => ({
      id: "open-pr-references-issue",
      severity: "blocker",
      pullRequest: pullRequest.number ? `#${pullRequest.number}` : "",
      title: pullRequest.title || "Open pull request",
      url: pullRequest.htmlUrl || "",
      reason: `Open PR ${pullRequest.number ? `#${pullRequest.number} ` : ""}references issue #${number}. Check that PR before cloning or coding.`
    }));

  const status = collectionError || !check
    ? "unchecked"
    : blockers.length
      ? "blocked"
      : "candidate";

  return {
    id: item.id || (number ? `issue-${number}` : ""),
    kind: item.kind || "issue",
    number: item.number || "",
    title: item.title || "",
    htmlUrl: item.htmlUrl || "",
    status,
    checked: Boolean(check && !collectionError),
    collectionError,
    contributorAction: contributorActionForStatus(status),
    reason: contributorReasonForStatus(status, blockers, collectionError),
    blockers
  };
}

function normalizePullRequests(pullRequests = []) {
  return (Array.isArray(pullRequests) ? pullRequests : []).map((pullRequest) => ({
    number: pullRequest.number || "",
    title: pullRequest.title || "",
    body: pullRequest.body || "",
    state: pullRequest.state || "",
    htmlUrl: pullRequest.htmlUrl || pullRequest.html_url || "",
    updatedAt: pullRequest.updatedAt || pullRequest.updated_at || "",
    draft: Boolean(pullRequest.draft)
  }));
}

function isOpenPullRequest(pullRequest = {}) {
  const state = String(pullRequest.state || "open").toLowerCase();
  return state !== "closed" && state !== "merged";
}

function referencesIssueNumber(pullRequest = {}, number = "", repository = "") {
  if (!number) return false;
  const text = [pullRequest.title, pullRequest.body, pullRequest.htmlUrl].filter(Boolean).join("\n");
  const escaped = escapeRegExp(number);
  const [owner, repo] = String(repository || "").split("/");
  const patterns = [
    new RegExp(`#${escaped}\\b`, "i"),
    new RegExp(`\\bissues/${escaped}\\b`, "i")
  ];
  if (owner && repo) {
    patterns.push(
      new RegExp(`${escapeRegExp(owner)}/${escapeRegExp(repo)}#${escaped}\\b`, "i"),
      new RegExp(`github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/issues/${escaped}\\b`, "i")
    );
  }
  return patterns.some((pattern) => pattern.test(text));
}

function contributorActionForStatus(status = "") {
  if (status === "blocked") return "Do not clone or code until the open PR owner path is checked.";
  if (status === "candidate") return "Run contribution policy and current-upstream behavior gates before coding.";
  return "Run a manual contributor preflight before coding.";
}

function contributorReasonForStatus(status = "", blockers = [], collectionError = "") {
  if (status === "blocked") return blockers[0]?.reason || "Open PR ownership signal found.";
  if (status === "candidate") return "No open PR with an exact issue reference was found by this preflight check.";
  return collectionError || "Contributor preflight was not checked for this item.";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
