const STOP_WORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "issue", "pull", "request"]);

export function buildSemanticDuplicateAssist(input = {}, repositoryTriage = null) {
  if (repositoryTriage?.hasContext && repositoryTriage.findings?.length) {
    return {
      enabled: false,
      degraded: false,
      suggestions: [],
      summary: "Repository context already supplied concrete duplicate or solved findings."
    };
  }

  const candidates = collectDuplicateAssistCandidates(input);
  if (!candidates.length) {
    return {
      enabled: false,
      degraded: true,
      suggestions: [],
      summary: "No duplicate-assist candidates supplied for degraded lookup."
    };
  }

  const currentTokens = tokenize(`${input.title || ""}\n${input.body || ""}`);
  const suggestions = candidates
    .map((candidate) => ({
      number: candidate.number || "",
      title: candidate.title || "",
      state: candidate.state || "unknown",
      url: candidate.url || candidate.htmlUrl || "",
      score: jaccard(currentTokens, tokenize(`${candidate.title || ""}\n${candidate.body || ""}`))
    }))
    .filter((item) => item.score >= 0.22)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return {
    enabled: true,
    degraded: true,
    deterministic: true,
    suggestions,
    summary: suggestions.length
      ? `Degraded duplicate assist found ${suggestions.length} title/body candidate(s); verify manually before treating as duplicate.`
      : "Degraded duplicate assist found no strong title/body candidates.",
    nonClaims: [
      "Semantic duplicate assist is deterministic token overlap, not an LLM verdict.",
      "Assist output is maintainer context only and does not replace repository-context collection."
    ]
  };
}

function collectDuplicateAssistCandidates(input = {}) {
  const explicit = input.duplicateAssistCandidates || input.duplicateAssist?.candidates || [];
  const fromContext = [
    ...(input.repositoryContext?.issues || []),
    ...(input.repositoryContext?.pullRequests || input.repositoryContext?.prs || [])
  ];
  return [...explicit, ...fromContext]
    .filter((item) => item && (item.title || item.body))
    .slice(0, 40);
}

function tokenize(text) {
  const tokens = new Set();
  for (const match of String(text || "").toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{2,}/g)) {
    const token = match[0];
    if (!STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return Math.round((intersection / (left.size + right.size - intersection)) * 100) / 100;
}