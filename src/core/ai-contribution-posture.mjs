const POSTURE_LABELS = new Set([
  "ai-friendly",
  "ai-conditional",
  "ai-unclear",
  "ai-resistant",
  "unknown"
]);

const RISK_LEVELS = new Set(["low", "medium", "high"]);

const AI_POLICY_TERMS = [
  "ai-generated",
  "ai generated",
  "chatgpt",
  "claude",
  "copilot",
  "llm",
  "large language model",
  "generated code",
  "ai-assisted",
  "ai assisted"
];

const ENTRY_HEADER = /^### `([^`]+)` — `(ai-[^`]+)` — risk: `(low|medium|high)`/;

export function parseAiContributionPostureIndex(markdown = "") {
  const text = String(markdown || "");
  const sections = text.split(/\n(?=### `)/).filter((section) => ENTRY_HEADER.test(section.trim()));
  return sections.map(parseIndexEntry).filter(Boolean);
}

export function evaluateAiContributionPosture(input = {}) {
  const repository = normalizeRepository(input.repository || input.repo || "");
  const aiAssisted = input.aiAssisted !== false;
  const index = Array.isArray(input.index) ? input.index : [];
  const entry = findIndexEntry(index, repository);
  const policyHits = normalizePolicyHits(input.policyHits || input.policySignals || []);
  const generatedAt = input.generatedAt || new Date().toISOString();

  if (!aiAssisted) {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "skipped",
      posture: entry?.posture || "unknown",
      risk: entry?.risk || "unknown",
      entry,
      policyHits,
      generatedAt,
      reason: "AI-assisted contribution gate skipped because aiAssisted=false."
    }));
  }

  if (!repository) {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "review",
      posture: "unknown",
      risk: "unknown",
      entry: null,
      policyHits,
      generatedAt,
      warnings: [{
        id: "missing-repository",
        reason: "No owner/repo supplied; check the posture index manually before coding."
      }],
      reason: "Repository is missing; posture cannot be classified automatically."
    }));
  }

  if (entry?.posture === "ai-resistant" || entry?.risk === "high") {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "blocked",
      posture: entry.posture,
      risk: entry.risk,
      entry,
      policyHits,
      generatedAt,
      blockers: [{
        id: "ai-posture-resistant",
        reason: entry.contributorGuidance || "Observed maintainer posture is AI-resistant for this repository."
      }],
      reason: "AI-assisted contribution risk is HIGH for this repository."
    }));
  }

  if (entry?.posture === "ai-conditional" || entry?.risk === "medium") {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "review",
      posture: entry.posture,
      risk: entry.risk,
      entry,
      policyHits,
      generatedAt,
      warnings: [{
        id: "ai-posture-conditional",
        reason: entry.contributorGuidance || "Ask maintainers about AI/tooling policy before opening an AI-assisted PR."
      }],
      reason: "AI-assisted contribution risk is MEDIUM; obtain explicit approval or avoid AI on the diff surface."
    }));
  }

  if (entry?.posture === "ai-friendly" && entry?.risk === "low") {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "pass",
      posture: entry.posture,
      risk: entry.risk,
      entry,
      policyHits,
      generatedAt,
      reason: "Observed posture is AI-friendly with low contributor risk."
    }));
  }

  if (policyHits.length) {
    return finalize(buildResult({
      repository,
      aiAssisted,
      status: "review",
      posture: entry?.posture || "ai-unclear",
      risk: entry?.risk || "medium",
      entry,
      policyHits,
      generatedAt,
      warnings: [{
        id: "policy-ai-signal",
        reason: `Supplied policy/discussion text mentions AI/tooling terms: ${policyHits.slice(0, 4).join(", ")}.`
      }],
      reason: "No indexed posture entry matched, but supplied policy signals mention AI/tooling."
    }));
  }

  return finalize(buildResult({
    repository,
    aiAssisted,
    status: "review",
    posture: entry?.posture || "unknown",
    risk: entry?.risk || "unknown",
    entry,
    policyHits,
    generatedAt,
    warnings: [{
      id: "posture-unknown",
      reason: "No indexed posture entry found. Search CONTRIBUTING.md, issues, and closed PRs for AI/tooling policy before coding."
    }],
    reason: "AI-assisted contribution posture is unknown; run policy discovery before implementation."
  }));
}

function finalize(result = {}) {
  return {
    ...result,
    report: formatAiContributionPostureReport(result)
  };
}

export function formatAiContributionPostureReport(result = {}) {
  const lines = [
    `AI-assisted contribution risk: ${riskLabel(result.risk, result.status)}`,
    "",
    "Evidence:"
  ];

  if (result.entry?.evidence?.length) {
    for (const item of result.entry.evidence) lines.push(`- ${item}`);
  } else if (result.policyHits?.length) {
    lines.push(`- Supplied policy/discussion mentions: ${result.policyHits.join(", ")}`);
  } else {
    lines.push("- No indexed posture entry or policy hits were supplied.");
  }

  if (result.blockers?.length) {
    lines.push("");
    lines.push("Blockers:");
    for (const blocker of result.blockers) lines.push(`- ${blocker.reason}`);
  }

  if (result.warnings?.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning.reason}`);
  }

  lines.push("");
  lines.push("Recommendation:");
  lines.push(result.recommendation || defaultRecommendation(result));

  return lines.join("\n");
}

function parseIndexEntry(section = "") {
  const lines = String(section || "").split("\n");
  const header = lines.find((line) => ENTRY_HEADER.test(line.trim()));
  if (!header) return null;

  const match = header.trim().match(ENTRY_HEADER);
  if (!match) return null;

  const repository = normalizeRepository(match[1]);
  const posture = normalizePosture(match[2]);
  const risk = normalizeRisk(match[3]);
  const evidence = [];
  let contributorGuidance = "";
  let notes = "";
  let dateObserved = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- **Date observed:**")) {
      dateObserved = trimmed.replace("- **Date observed:**", "").trim();
      continue;
    }
    if (trimmed.startsWith("- **Contributor guidance:**")) {
      contributorGuidance = trimmed.replace("- **Contributor guidance:**", "").trim();
      continue;
    }
    if (trimmed.startsWith("- **Notes:**")) {
      notes = trimmed.replace("- **Notes:**", "").trim();
      continue;
    }
    if (trimmed.startsWith("- ") && !trimmed.startsWith("- **")) {
      evidence.push(trimmed.slice(2).trim());
    }
  }

  return {
    repository,
    posture,
    risk,
    dateObserved,
    evidence,
    contributorGuidance,
    notes
  };
}

function findIndexEntry(index = [], repository = "") {
  const normalized = normalizeRepository(repository);
  if (!normalized) return null;
  return index.find((entry) => normalizeRepository(entry.repository) === normalized) || null;
}

function normalizeRepository(value = "") {
  return String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
}

function normalizePosture(value = "") {
  const posture = String(value || "unknown").trim().toLowerCase();
  return POSTURE_LABELS.has(posture) ? posture : "unknown";
}

function normalizeRisk(value = "") {
  const risk = String(value || "unknown").trim().toLowerCase();
  return RISK_LEVELS.has(risk) ? risk : "unknown";
}

function normalizePolicyHits(values = []) {
  const haystack = (Array.isArray(values) ? values : [values])
    .map((value) => typeof value === "string" ? value : value?.text || value?.snippet || value?.content || "")
    .join("\n")
    .toLowerCase();

  return AI_POLICY_TERMS.filter((term) => haystack.includes(term));
}

function buildResult({
  repository,
  aiAssisted,
  status,
  posture,
  risk,
  entry,
  policyHits,
  generatedAt,
  blockers = [],
  warnings = [],
  reason = ""
}) {
  const recommendation = entry?.contributorGuidance || defaultRecommendation({ status, posture, risk });
  return {
    ok: status === "pass" || status === "skipped",
    artifact: "pcf-ai-contribution-posture",
    generatedAt,
    repository,
    aiAssisted,
    status,
    posture,
    risk,
    reason,
    recommendation,
    entry: entry ? publicEntry(entry) : null,
    policyHits,
    blockers,
    warnings,
    report: "",
    nonClaims: [
      "This gate classifies observed maintainer posture from indexed evidence and caller-supplied policy text.",
      "It does not detect whether code was written by AI.",
      "A pass result does not guarantee merge; technical, overlap, and scope gates still apply."
    ]
  };
}

function publicEntry(entry = {}) {
  return {
    repository: entry.repository,
    posture: entry.posture,
    risk: entry.risk,
    dateObserved: entry.dateObserved || "",
    evidence: entry.evidence || [],
    contributorGuidance: entry.contributorGuidance || "",
    notes: entry.notes || ""
  };
}

function riskLabel(risk = "", status = "") {
  if (status === "blocked") return "HIGH";
  if (risk === "high") return "HIGH";
  if (risk === "medium" || status === "review") return "MEDIUM";
  if (risk === "low" || status === "pass") return "LOW";
  return "UNKNOWN";
}

function defaultRecommendation(result = {}) {
  if (result.status === "blocked") {
    return "Do not submit AI-assisted PR without explicit maintainer pre-approval.";
  }
  if (result.status === "review") {
    return "Ask maintainers about AI/tooling policy before implementation or avoid AI on the diff surface.";
  }
  if (result.status === "skipped") {
    return "Posture gate skipped because the lane is not AI-assisted.";
  }
  return "Proceed with normal PCF gates; disclose assistance if asked.";
}