const POLICY_FILE_TYPES = [
  { type: "contributing", pattern: /(^|\/)(CONTRIBUTING|CONTRIBUTE)\.(md|rst|txt|adoc)$/i },
  { type: "pull-request-template", pattern: /(^|\/)(pull_request_template|PULL_REQUEST_TEMPLATE)\.(md|txt)$/i },
  { type: "pull-request-template", pattern: /(^|\/)PULL_REQUEST_TEMPLATE\/.+\.(md|txt)$/i },
  { type: "issue-template", pattern: /(^|\/)ISSUE_TEMPLATE\/.+\.(md|yml|yaml|txt)$/i },
  { type: "codeowners", pattern: /(^|\/)CODEOWNERS$/i },
  { type: "maintainers", pattern: /(^|\/)(MAINTAINERS|OWNERS|REVIEWERS)(\.(md|txt))?$/i },
  { type: "package", pattern: /(^|\/)package\.json$/i },
  { type: "pyproject", pattern: /(^|\/)pyproject\.toml$/i },
  { type: "cargo", pattern: /(^|\/)Cargo\.toml$/i },
  { type: "go", pattern: /(^|\/)go\.mod$/i },
  { type: "makefile", pattern: /(^|\/)(Makefile|GNUmakefile|makefile)$/ }
];

const TEST_COMMAND_PATTERN = /`((?:npm|pnpm|yarn|node|pytest|python\s+-m\s+pytest|cargo|go|make|scripts\/checkpatch\.pl|smatch|sparse)[^`]{0,90})`/gi;

export function normalizeRepositoryFiles(files = []) {
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => ({
      path: String(file.path || file.filename || file.name || "").trim(),
      content: String(file.content || file.text || file.body || "")
    }))
    .filter((file) => file.path && file.content);
}

export function buildPolicyProfile(input = {}) {
  const files = normalizeRepositoryFiles(input.repositoryFiles || input.policyFiles);
  if (input.contributingText && !files.some((file) => file.path === "CONTRIBUTING excerpt")) {
    files.push({ path: "CONTRIBUTING excerpt", content: String(input.contributingText) });
  }

  const changedFiles = Array.isArray(input.files)
    ? input.files.map((file) => String(file.filename || file.path || "")).filter(Boolean)
    : [];
  const sources = [];
  const textParts = [];
  const requiredSections = new Set();
  const testCommands = new Set();
  const codeownersEntries = [];
  const maintainerEntries = [];
  const requires = {
    tests: false,
    issueLink: false,
    dco: false,
    changelog: false,
    maintainerRouting: false
  };

  for (const file of files) {
    const type = classifyPolicyFile(file.path);
    sources.push({ path: file.path, type });
    textParts.push(file.content);

    if (type === "pull-request-template") {
      for (const section of extractTemplateSections(file.content)) requiredSections.add(section);
    }
    if (type === "codeowners") {
      codeownersEntries.push(...parseCodeowners(file.content, file.path));
      requires.maintainerRouting = true;
    }
    if (type === "maintainers") {
      maintainerEntries.push(...parseMaintainers(file.content, file.path));
      requires.maintainerRouting = true;
    }

    for (const command of extractTestCommands(file.path, file.content, type)) testCommands.add(command);
  }

  const combinedText = textParts.join("\n").toLowerCase();
  requires.tests = /\b(required|must|should|include|run|provide|attach)[^\n.]{0,80}\b(test|tests|testing|verification)\b/i.test(combinedText)
    || requiredSections.has("tests")
    || testCommands.size > 0;
  requires.issueLink = /\b(link|reference|close|fix|connect)[^\n.]{0,80}\b(issue|ticket|bug|report)\b/i.test(combinedText)
    || requiredSections.has("linked issue");
  requires.dco = /\b(developer certificate of origin|dco|signed-off-by|signoff|sign-off)\b/i.test(combinedText);
  requires.changelog = /\b(changelog|release note|user-visible change)\b/i.test(combinedText);

  const ownerMatches = matchCodeowners(codeownersEntries, changedFiles);
  const maintainerMatches = matchMaintainers(maintainerEntries, changedFiles);

  return {
    sources,
    requiredSections: [...requiredSections],
    testCommands: [...testCommands],
    requires,
    ownerMatches,
    maintainerMatches,
    hasPolicy: sources.length > 0,
    summary: summarizePolicy({ sources, requiredSections, testCommands, ownerMatches, maintainerMatches })
  };
}

export function evaluatePolicyRequirements({
  input,
  body,
  docsOnly,
  testFiles,
  policyProfile,
  hasTestMention,
  hasNoTestsReason,
  hasIssueLink,
  signedOff
}) {
  if (!policyProfile?.hasPolicy) {
    return {
      status: "pass",
      reason: "No repository policy files supplied; default readiness rules applied.",
      missing: []
    };
  }

  const hasTestEvidence = docsOnly || testFiles.length > 0 || hasTestMention || hasNoTestsReason;
  const missing = [];
  if (policyProfile.requires.tests && !hasTestEvidence) missing.push("tests or verification");
  if (policyProfile.requires.issueLink && !hasIssueLink) missing.push("linked issue");
  if (policyProfile.requires.dco && !signedOff) missing.push("DCO sign-off");

  for (const section of policyProfile.requiredSections) {
    if (section === "tests" && missing.includes("tests or verification")) continue;
    if (section === "linked issue" && missing.includes("linked issue")) continue;
    if (!templateSectionSatisfied(section, body, { hasTestEvidence, hasIssueLink })) {
      missing.push(section);
    }
  }

  const uniqueMissing = [...new Set(missing)];
  if (uniqueMissing.length === 0) {
    return {
      status: "pass",
      reason: `Submission satisfies repository policy signals from ${policyProfile.sources.length} source(s).`,
      missing: []
    };
  }

  const hardMissing = uniqueMissing.filter((item) => !["screenshots", "checklist"].includes(item));
  return {
    status: hardMissing.length >= 2 || hardMissing.includes("tests or verification") || hardMissing.includes("DCO sign-off") ? "fail" : "warn",
    reason: `Missing repository policy item(s): ${uniqueMissing.join(", ")}.`,
    missing: uniqueMissing
  };
}

export function evaluateProjectTestCommand({ body, policyProfile, hasTestMention, hasNoTestsReason, docsOnly }) {
  const commands = policyProfile?.testCommands || [];
  if (commands.length === 0) {
    return {
      status: "pass",
      reason: "No project test command was discovered from repository policy files.",
      matchedCommand: ""
    };
  }

  const matchedCommand = commands.find((command) => commandMentioned(body, command)) || "";
  if (matchedCommand) {
    return {
      status: "pass",
      reason: `Submission mentions discovered project command: ${matchedCommand}.`,
      matchedCommand
    };
  }

  if (docsOnly || hasNoTestsReason) {
    return {
      status: "warn",
      reason: `Repository policy suggests ${commands.slice(0, 3).join(", ")}, but the submission gives a no-test/docs-only rationale.`,
      matchedCommand: ""
    };
  }

  return {
    status: hasTestMention ? "warn" : "fail",
    reason: `Repository policy suggests test command(s): ${commands.slice(0, 3).join(", ")}.`,
    matchedCommand: ""
  };
}

function classifyPolicyFile(path) {
  const match = POLICY_FILE_TYPES.find((item) => item.pattern.test(path));
  return match ? match.type : "policy";
}

function extractTemplateSections(text) {
  const sections = new Set();
  const headingPattern = /^\s{0,3}#{1,4}\s+(.+?)\s*#*\s*$/gm;
  for (const match of text.matchAll(headingPattern)) {
    const section = canonicalSection(match[1]);
    if (section) sections.add(section);
  }

  const checkboxPattern = /^\s*[-*]\s+\[[ xX]\]\s+(.+)$/gm;
  for (const match of text.matchAll(checkboxPattern)) {
    const section = canonicalSection(match[1]);
    if (section) sections.add(section);
  }
  return sections;
}

function canonicalSection(raw) {
  const text = raw.toLowerCase().replace(/[:*`]/g, "").trim();
  if (/\b(test|testing|verification|verified)\b/.test(text)) return "tests";
  if (/\b(issue|ticket|bug|closes|fixes|linked)\b/.test(text)) return "linked issue";
  if (/\b(description|summary|what changed|change summary)\b/.test(text)) return "description";
  if (/\b(risk|impact|compatibility|regression)\b/.test(text)) return "risk";
  if (/\b(screenshot|recording|screen capture)\b/.test(text)) return "screenshots";
  if (/\b(checklist|ready)\b/.test(text)) return "checklist";
  return "";
}

export function templateSectionSatisfied(section, body, signals) {
  if (section === "tests") return signals.hasTestEvidence;
  if (section === "linked issue") return signals.hasIssueLink;
  if (section === "description") return body.trim().length >= 120;
  if (section === "risk") return /\b(risk|impact|compatibility|regression|safe|trade[- ]off)\b/i.test(body);
  if (section === "screenshots") return /\b(screenshot|recording|image|not applicable|n\/a|no ui)\b/i.test(body);
  if (section === "checklist") return /- \[[ xX]\]|\bchecklist\b/i.test(body);
  return true;
}

function extractTestCommands(path, content, type) {
  const commands = new Set();
  if (type === "package") {
    try {
      const data = JSON.parse(content);
      const scripts = data.scripts || {};
      if (scripts.test) commands.add("npm test");
      if (scripts.check) commands.add("npm run check");
      if (scripts.lint) commands.add("npm run lint");
    } catch {
      // Ignore invalid package snippets; text extraction below still applies.
    }
  }
  if (type === "pyproject") {
    if (/\bpytest\b/i.test(content)) commands.add("pytest");
    if (/\btox\b/i.test(content)) commands.add("tox");
  }
  if (type === "cargo") commands.add("cargo test");
  if (type === "go") commands.add("go test ./...");
  if (type === "makefile") {
    if (/^test\s*:/m.test(content)) commands.add("make test");
    if (/^check\s*:/m.test(content)) commands.add("make check");
  }

  for (const match of content.matchAll(TEST_COMMAND_PATTERN)) {
    const command = match[1].replace(/\s+/g, " ").trim();
    if (command.length <= 100) commands.add(command);
  }
  return commands;
}

function parseCodeowners(content, source) {
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [pattern, ...owners] = trimmed.split(/\s+/);
    if (pattern && owners.length) entries.push({ pattern, owners, source });
  }
  return entries;
}

function matchCodeowners(entries, changedFiles) {
  const matches = [];
  for (const file of changedFiles) {
    const owners = [];
    for (const entry of entries) {
      if (pathMatches(entry.pattern, file)) owners.push(...entry.owners);
    }
    if (owners.length) matches.push({ file, owners: [...new Set(owners)], source: "CODEOWNERS" });
  }
  return matches;
}

function parseMaintainers(content, source) {
  const entries = [];
  let current = { name: "", maintainers: [], lists: [], files: [] };
  const flush = () => {
    if (current.files.length && (current.maintainers.length || current.lists.length)) {
      entries.push({ ...current, source });
    }
    current = { name: "", maintainers: [], lists: [], files: [] };
  };

  for (const line of content.split(/\r?\n/)) {
    if (/^[A-Z0-9][A-Z0-9 _/-]+$/.test(line.trim()) && !/^[A-Z]:/.test(line.trim())) {
      flush();
      current.name = line.trim();
      continue;
    }
    const match = /^([MLF]):\s*(.+)$/.exec(line);
    if (!match) continue;
    if (match[1] === "M") current.maintainers.push(match[2].trim());
    if (match[1] === "L") current.lists.push(match[2].trim());
    if (match[1] === "F") current.files.push(match[2].trim());
  }
  flush();
  return entries;
}

function matchMaintainers(entries, changedFiles) {
  const matches = [];
  for (const file of changedFiles) {
    for (const entry of entries) {
      if (entry.files.some((pattern) => pathMatches(pattern, file))) {
        matches.push({
          file,
          area: entry.name || "MAINTAINERS",
          maintainers: entry.maintainers,
          lists: entry.lists,
          source: entry.source
        });
      }
    }
  }
  return matches;
}

function pathMatches(pattern, file) {
  const normalizedPattern = pattern.replace(/^\/+/, "");
  const normalizedFile = file.replace(/^\/+/, "");
  if (normalizedPattern === "*") return true;
  if (normalizedPattern.endsWith("/")) return normalizedFile.startsWith(normalizedPattern);
  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(`^${escapeRegex(normalizedPattern).replace(/\\\*/g, ".*")}$`);
    return regex.test(normalizedFile);
  }
  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
}

function commandMentioned(body, command) {
  const haystack = body.toLowerCase().replace(/\s+/g, " ");
  const needle = command.toLowerCase().replace(/\s+/g, " ");
  if (haystack.includes(needle)) return true;
  if (needle === "npm test" && /\bnpm\s+(run\s+)?test\b/i.test(body)) return true;
  if (needle === "go test ./..." && /\bgo test\b/i.test(body)) return true;
  return false;
}

function summarizePolicy({ sources, requiredSections, testCommands, ownerMatches, maintainerMatches }) {
  if (!sources.length) return "no repository policy supplied";
  const parts = [`${sources.length} source(s)`];
  if (requiredSections.size) parts.push(`${requiredSections.size} template section(s)`);
  if (testCommands.size) parts.push(`${testCommands.size} command hint(s)`);
  const routeCount = ownerMatches.length + maintainerMatches.length;
  if (routeCount) parts.push(`${routeCount} owner route(s)`);
  return parts.join(", ");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
