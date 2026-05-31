const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with"
]);

const SOLVED_LABELS = /\b(duplicate|fixed|resolved|done|released|wontfix|wont-fix)\b/i;
const FIXED_TEXT = /\b(fixed by|fixed in|resolved by|landed in|merged in|available in|released in|already fixed|duplicate of)\b/i;

export function normalizeRepositoryContext(rawContext = null) {
  if (!rawContext || typeof rawContext !== "object") {
    return {
      hasContext: false,
      source: "none",
      repository: "",
      upstreamRepository: "",
      issues: [],
      pullRequests: [],
      upstream: {
        issues: [],
        pullRequests: [],
        commits: [],
        releases: []
      },
      currentIssueRefs: [],
      error: ""
    };
  }

  if (rawContext.hasContext === false) {
    return {
      hasContext: false,
      source: String(rawContext.source || "none"),
      repository: String(rawContext.repository || rawContext.repo || ""),
      upstreamRepository: String(rawContext.upstreamRepository || rawContext.upstream?.repository || ""),
      issues: [],
      pullRequests: [],
      upstream: {
        issues: [],
        pullRequests: [],
        commits: [],
        releases: []
      },
      currentIssueRefs: [],
      error: String(rawContext.error || "")
    };
  }

  const upstream = rawContext.upstream || {};
  return {
    hasContext: true,
    source: String(rawContext.source || "supplied"),
    repository: String(rawContext.repository || rawContext.repo || ""),
    upstreamRepository: String(rawContext.upstreamRepository || upstream.repository || ""),
    issues: normalizeItems(rawContext.issues || [], "issue", "local"),
    pullRequests: normalizeItems(rawContext.pullRequests || rawContext.prs || [], "pull_request", "local"),
    upstream: {
      issues: normalizeItems(rawContext.upstreamIssues || upstream.issues || [], "issue", "upstream"),
      pullRequests: normalizeItems(rawContext.upstreamPullRequests || upstream.pullRequests || upstream.prs || [], "pull_request", "upstream"),
      commits: normalizeItems(rawContext.upstreamCommits || upstream.commits || [], "commit", "upstream"),
      releases: normalizeItems(rawContext.upstreamReleases || upstream.releases || [], "release", "upstream")
    },
    currentIssueRefs: normalizeIssueRefs(rawContext.currentIssueRefs || rawContext.currentRefs || []),
    error: String(rawContext.error || "")
  };
}

export function analyzeRepositoryContext(input = {}) {
  const context = normalizeRepositoryContext(input.repositoryContext || input.repoContext);
  if (!context.hasContext) {
    return emptyAnalysis({
      hasContext: false,
      source: context.source,
      summary: "No repository issue/PR context supplied; duplicate and upstream checks were not run.",
      checkStatus: "pass"
    });
  }

  if (context.error) {
    return emptyAnalysis({
      hasContext: true,
      source: context.source,
      repository: context.repository,
      upstreamRepository: context.upstreamRepository,
      summary: `Repository context collection failed: ${context.error}.`,
      checkStatus: "warn",
      labels: ["repo-context-unavailable"]
    });
  }

  const current = currentFingerprint(input, context);
  const localIssues = context.issues.filter((item) => !sameContribution(item, input));
  const localPullRequests = context.pullRequests.filter((item) => !sameContribution(item, input));
  const upstreamItems = [
    ...context.upstream.issues,
    ...context.upstream.pullRequests,
    ...context.upstream.commits,
    ...context.upstream.releases
  ];

  const linkedIssues = localIssues
    .filter((item) => item.number && current.issueRefs.has(String(item.number)))
    .filter((item) => !current.contextualIssueRefs.has(String(item.number)))
    .map((item) => enrichMatch(item, current, "linked-issue"));
  const linkedOpenIssues = linkedIssues.filter((item) => isOpen(item));
  const linkedClosedIssues = linkedIssues.filter((item) => isClosed(item) || isSolved(item));

  const similarOpenIssues = uniqueMatches([
    ...linkedOpenIssues,
    ...rankMatches(localIssues.filter((item) => isOpen(item)), current, "similar-open-issue")
  ]).filter((item) => !isContextualDirectReference(item, current));
  const similarClosedIssues = rankMatches(localIssues.filter((item) => isClosed(item) || isSolved(item)), current, "similar-closed-issue")
    .filter((item) => !isContextualDirectReference(item, current));
  const concurrentPullRequests = rankMatches(localPullRequests.filter((item) => isOpen(item)), current, "concurrent-pr", { requireOverlap: false })
    .filter((item) => item.fileOverlap.length > 0 || item.score >= 0.24);
  const upstreamSolved = rankMatches(upstreamItems.filter((item) => isSolved(item) || item.scope === "upstream"), current, "upstream-solved", { threshold: 0.16 })
    .filter((item) => isSolved(item) || item.score >= 0.2 || item.fileOverlap.length > 0);

  const labels = [];
  if (similarOpenIssues.length || linkedIssues.some((item) => isOpen(item))) labels.push("possibly-duplicate");
  if (similarClosedIssues.length || linkedClosedIssues.length) labels.push("possibly-solved");
  if (linkedClosedIssues.length) labels.push("linked-issue-closed");
  if (concurrentPullRequests.length) labels.push("concurrent-work");
  if (upstreamSolved.length) labels.push("possibly-upstream-fixed");

  const hardFindings = similarClosedIssues.length + linkedClosedIssues.length + upstreamSolved.length;
  const softFindings = similarOpenIssues.length + concurrentPullRequests.length;
  const checkStatus = hardFindings > 0 ? "fail" : softFindings > 0 ? "warn" : "pass";

  const findings = [
    ...linkedClosedIssues,
    ...similarOpenIssues,
    ...similarClosedIssues,
    ...concurrentPullRequests,
    ...upstreamSolved
  ].slice(0, 12);

  return {
    hasContext: true,
    source: context.source,
    repository: context.repository,
    upstreamRepository: context.upstreamRepository,
    checkStatus,
    labels: [...new Set(labels)],
    summary: summarizeFindings({ similarOpenIssues, similarClosedIssues, linkedClosedIssues, concurrentPullRequests, upstreamSolved }),
    similarOpenIssues: similarOpenIssues.slice(0, 5),
    similarClosedIssues: similarClosedIssues.slice(0, 5),
    linkedClosedIssues: linkedClosedIssues.slice(0, 5),
    concurrentPullRequests: concurrentPullRequests.slice(0, 5),
    upstreamSolved: upstreamSolved.slice(0, 5),
    findings
  };
}

function normalizeItems(items, fallbackType, scope) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => normalizeItem(item, fallbackType, scope))
    .filter((item) => item.title || item.body || item.number || item.url);
}

function normalizeIssueRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return [...new Set(refs.map((ref) => String(ref || "").trim()).filter(Boolean))];
}

function normalizeItem(item, fallbackType, scope) {
  const labels = normalizeLabels(item.labels);
  const type = String(item.type || item.kind || (item.pull_request ? "pull_request" : fallbackType));
  const state = String(item.state || (item.mergedAt || item.merged_at ? "merged" : "") || "").toLowerCase();
  return {
    type,
    scope,
    number: item.number === undefined || item.number === null ? "" : String(item.number),
    title: String(item.title || item.name || item.commit?.message || item.message || ""),
    body: String(item.body || item.description || item.commit?.message || ""),
    state,
    labels,
    url: String(item.htmlUrl || item.html_url || item.url || ""),
    files: normalizeFiles(item.files || item.changedFiles || []),
    closedAt: String(item.closedAt || item.closed_at || ""),
    mergedAt: String(item.mergedAt || item.merged_at || ""),
    updatedAt: String(item.updatedAt || item.updated_at || ""),
    resolution: String(item.resolution || ""),
    sha: String(item.sha || item.commit?.sha || ""),
    tagName: String(item.tagName || item.tag_name || "")
  };
}

function currentFingerprint(input, context = {}) {
  const text = [input.title, input.body, ...(input.commits || [])].filter(Boolean).join("\n");
  const issueRefs = extractIssueRefs(text, context.repository);
  const contextualIssueRefs = extractContextualIssueRefs(text, context.repository);
  for (const ref of context.currentIssueRefs || []) issueRefs.add(String(ref));
  return {
    number: input.number === undefined || input.number === null ? "" : String(input.number),
    kind: input.kind,
    tokens: tokenize(text),
    titleTokens: tokenize(input.title || ""),
    files: normalizeFiles(input.files || []),
    issueRefs,
    contextualIssueRefs
  };
}

function uniqueMatches(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = `${item.type}:${item.number}:${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function rankMatches(items, current, relation, options = {}) {
  const threshold = options.threshold ?? 0.18;
  return items
    .map((item) => enrichMatch(item, current, relation))
    .filter((item) => item.score >= threshold || item.fileOverlap.length > 0 || item.directReference)
    .sort((a, b) => {
      if (b.directReference !== a.directReference) return Number(b.directReference) - Number(a.directReference);
      if (b.fileOverlap.length !== a.fileOverlap.length) return b.fileOverlap.length - a.fileOverlap.length;
      return b.score - a.score;
    });
}

function enrichMatch(item, current, relation) {
  const itemTokens = tokenize([item.title, item.body].join("\n"));
  const itemTitleTokens = tokenize(item.title);
  const tokenScore = jaccard(current.tokens, itemTokens);
  const titleScore = jaccard(current.titleTokens, itemTitleTokens);
  const fileOverlap = overlap(current.files, item.files);
  const directReference = Boolean(item.number && current.issueRefs.has(String(item.number)));
  const score = Math.min(1, Math.max(tokenScore, titleScore * 0.9) + (fileOverlap.length ? 0.18 : 0) + (directReference ? 0.5 : 0));
  return {
    relation,
    type: item.type,
    scope: item.scope,
    number: item.number,
    title: item.title,
    state: item.state || "unknown",
    labels: item.labels,
    url: item.url,
    score: Math.round(score * 100) / 100,
    fileOverlap,
    directReference,
    resolution: item.resolution,
    closedAt: item.closedAt,
    mergedAt: item.mergedAt,
    sha: item.sha,
    tagName: item.tagName
  };
}

function isContextualDirectReference(item, current) {
  return Boolean(item.directReference && item.number && current.contextualIssueRefs?.has(String(item.number)));
}

function summarizeFindings({ similarOpenIssues, similarClosedIssues, linkedClosedIssues, concurrentPullRequests, upstreamSolved }) {
  const parts = [];
  if (similarOpenIssues.length) parts.push(`${similarOpenIssues.length} similar open issue(s)`);
  if (similarClosedIssues.length) parts.push(`${similarClosedIssues.length} similar closed/solved issue(s)`);
  if (linkedClosedIssues.length) parts.push(`${linkedClosedIssues.length} linked issue(s) already closed`);
  if (concurrentPullRequests.length) parts.push(`${concurrentPullRequests.length} concurrent pull request(s)`);
  if (upstreamSolved.length) parts.push(`${upstreamSolved.length} upstream solved/fixed signal(s)`);
  return parts.length ? parts.join(", ") : "Repository context supplied; no similar, concurrent, solved, or upstream-fixed work found.";
}

function emptyAnalysis(overrides = {}) {
  return {
    hasContext: false,
    source: "none",
    repository: "",
    upstreamRepository: "",
    checkStatus: "pass",
    labels: [],
    summary: "",
    similarOpenIssues: [],
    similarClosedIssues: [],
    linkedClosedIssues: [],
    concurrentPullRequests: [],
    upstreamSolved: [],
    findings: [],
    ...overrides
  };
}

function isOpen(item) {
  return !item.state || item.state === "open";
}

function isClosed(item) {
  return ["closed", "merged"].includes(item.state) || Boolean(item.closedAt || item.mergedAt);
}

function isSolved(item) {
  return isClosed(item)
    || SOLVED_LABELS.test(item.labels.join(" "))
    || SOLVED_LABELS.test(item.resolution)
    || FIXED_TEXT.test(`${item.title}\n${item.body}`);
}

function sameContribution(item, input) {
  const number = input.number === undefined || input.number === null ? "" : String(input.number);
  return Boolean(number && item.number === number && item.type === (input.kind === "issue" ? "issue" : "pull_request"));
}

function extractIssueRefs(text, repository = "") {
  const refs = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/#(\d+)\b/gi)) {
    refs.add(match[1]);
  }
  const [owner, repo] = String(repository || "").split("/");
  if (owner && repo) {
    const sameRepoPattern = new RegExp(`github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/(?:issues|pull)/(\\d+)\\b`, "gi");
    for (const match of source.matchAll(sameRepoPattern)) refs.add(match[1]);
  }
  for (const match of source.matchAll(/\b(?:issues|pull)\/(\d+)\b/gi)) {
    const prefix = source.slice(Math.max(0, (match.index || 0) - 80), match.index || 0);
    if (/github\.com\/[^/\s]+\/[^/\s]+\/$/i.test(prefix)) continue;
    refs.add(match[1]);
  }
  return refs;
}

function extractContextualIssueRefs(text, repository = "") {
  const refs = extractIssueRefs(text, repository);
  if (!refs.size) return new Set();
  const contextual = new Set();
  const source = String(text || "");
  const disqualifier = /\b(?:duplicate of|duplicates\s+(?:#|https?:\/\/github\.com)|same as|fixed by|fix(?:e[sd])?\s+#|close[sd]?\s+#|resolve[sd]?\s+#)\b/i;
  const contextualSignal = /\b(?:follow-?up|followup|reported (?:in|on)|discussion|tracked|broader|covers|covered by|supersedes|split from|continuation|known issues?|faq|for more details|see also|similar issue|related issue|prior issue|previous issue|separate issue)\b/i;

  for (const ref of refs) {
    const refPattern = new RegExp(`#${escapeRegExp(ref)}\\b|(?:issues|pull)/${escapeRegExp(ref)}\\b|github\\.com/[^\\s]+/(?:issues|pull)/${escapeRegExp(ref)}\\b`, "gi");
    for (const match of source.matchAll(refPattern)) {
      const start = Math.max(0, (match.index || 0) - 120);
      const end = Math.min(source.length, (match.index || 0) + match[0].length + 120);
      const window = source.slice(start, end);
      if (contextualSignal.test(window) && !disqualifier.test(window)) {
        contextual.add(ref);
        break;
      }
    }
  }

  return contextual;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(text) {
  const tokens = new Set();
  for (const match of String(text || "").toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{2,}/g)) {
    const token = match[0].replace(/[_-]+/g, "-");
    if (!STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map((file) => {
    if (typeof file === "string") return file;
    return String(file.filename || file.path || file.name || "");
  }).filter(Boolean))];
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}
