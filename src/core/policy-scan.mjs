const TODO_PATTERN = /\b(TODO|FIXME|XXX|HACK)\b[:\s-]*(.*)$/i;
const TOKEN_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "issue",
  "bug",
  "fix",
  "change",
  "update",
  "behavior"
]);

export function scanTouchedFilePolicy(input = {}) {
  const files = normalizeFiles(input.files || input.repositoryFiles || []);
  const touchedPaths = normalizeTouchedPaths(input.touchedPaths || input.changedFiles || files.map((file) => file.path));
  const changeTokens = tokenize(`${input.changeSummary || ""}\n${input.issueTitle || ""}\n${input.issueBody || ""}`);
  const findings = [];

  for (const file of files) {
    if (touchedPaths.length && !touchedPaths.some((path) => pathsIntersect(file.path, path))) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = TODO_PATTERN.exec(line);
      if (!match) return;
      const todoText = match[2] || "";
      const overlap = tokenOverlap(changeTokens, tokenize(`${file.path}\n${todoText}`));
      const relevant = overlap >= 2 || (changeTokens.size > 0 && todoText.length > 0 && overlap >= 1 && input.strictTodoScan === true);
      findings.push({
        id: relevant ? "todo-conflict" : "todo-needs-review",
        severity: relevant ? "blocker" : "warning",
        marker: match[1].toUpperCase(),
        path: file.path,
        line: index + 1,
        text: line.trim().slice(0, 240),
        relevanceScore: overlap,
        reason: relevant
          ? "Nearby TODO/FIXME appears related to the requested behavior; align with maintainer intent before coding."
          : "Touched file contains TODO/FIXME context that should be reviewed before public contribution."
      });
    });
  }

  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const status = blockers.length ? "blocked" : warnings.length ? "review" : "pass";
  return {
    ok: status === "pass",
    status,
    summary: summarizePolicyScan({ status, blockers, warnings, touchedPaths }),
    blockers,
    warnings,
    findings,
    nonClaims: [
      "TODO/FIXME policy scan is a maintainer-intent guard, not a full architecture review.",
      "A clean scan does not replace reading the issue, linked discussions, contribution policy, and current code."
    ]
  };
}

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => ({
      path: normalizePath(file.path || file.filename || file.name || ""),
      content: String(file.content || file.text || file.body || "")
    }))
    .filter((file) => file.path && file.content);
}

function normalizeTouchedPaths(paths) {
  return (Array.isArray(paths) ? paths : [paths])
    .map((path) => normalizePath(path.path || path.filename || path))
    .filter(Boolean);
}

function normalizePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function pathsIntersect(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return Boolean(a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.endsWith(`/${b}`)));
}

function tokenize(text) {
  const tokens = new Set();
  for (const match of String(text || "").toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{2,}/g)) {
    const token = match[0];
    if (!TOKEN_STOP_WORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function tokenOverlap(left, right) {
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits;
}

function summarizePolicyScan({ status, blockers, warnings, touchedPaths }) {
  const scope = touchedPaths.length ? `${touchedPaths.length} touched path(s)` : "supplied touched files";
  if (status === "blocked") return `Blocked: ${blockers.length} related TODO/FIXME signal(s) found in ${scope}.`;
  if (status === "review") return `Review: ${warnings.length} TODO/FIXME signal(s) found in ${scope}.`;
  return `Pass: no TODO/FIXME signals found in ${scope}.`;
}
