const DEFAULT_FORBIDDEN_PATH_PATTERNS = [
  "(^|/)node_modules/",
  "(^|/)vendor/",
  "(^|/)dist/",
  "(^|/)build/",
  "(^|/)coverage/",
  "(^|/)tmp/",
  "\\.min\\.(js|css)$"
];

export function evaluateDiffShape(input = {}) {
  const files = normalizeDiffFiles(input.files || input.changedFiles || []);
  const maxFiles = clampNumber(input.maxFiles, 8, 1, 500);
  const maxLines = clampNumber(input.maxLines, 300, 1, 100000);
  const issuePaths = normalizeStrings(input.issuePaths || input.issueNamedPaths || []);
  const forbiddenPatterns = normalizePatterns(input.forbiddenPathPatterns || DEFAULT_FORBIDDEN_PATH_PATTERNS);
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const totalLines = totalAdditions + totalDeletions;
  const blockers = [];
  const warnings = [];

  if (files.length === 0) {
    blockers.push({
      id: "empty-diff",
      severity: "blocker",
      reason: "No changed files were supplied; PCF cannot verify the contribution shape."
    });
  }

  if (files.length > maxFiles) {
    blockers.push({
      id: "too-many-files",
      severity: "blocker",
      reason: `Diff touches ${files.length} file(s), above the configured maximum of ${maxFiles}.`
    });
  }

  if (totalLines > maxLines) {
    blockers.push({
      id: "too-many-lines",
      severity: "blocker",
      reason: `Diff changes ${totalLines} line(s), above the configured maximum of ${maxLines}.`
    });
  }

  for (const file of files) {
    const matched = forbiddenPatterns.find((pattern) => pattern.test(file.path));
    if (matched) {
      blockers.push({
        id: "forbidden-path",
        severity: "blocker",
        path: file.path,
        reason: `Diff touches '${file.path}', which matches forbidden path pattern '${matched.source}'.`
      });
    }
  }

  if (issuePaths.length && !files.some((file) => issuePaths.some((path) => pathsIntersect(file.path, path)))) {
    blockers.push({
      id: "issue-path-miss",
      severity: "blocker",
      reason: "Issue named specific paths, but the diff does not touch any of them.",
      issuePaths
    });
  }

  const lockfiles = files.filter((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|go\.sum)$/.test(file.path));
  if (lockfiles.length && !input.allowLockfiles) {
    warnings.push({
      id: "lockfile-churn",
      severity: "warning",
      paths: lockfiles.map((file) => file.path),
      reason: "Lockfile changes need explicit justification in a narrow upstream contribution."
    });
  }

  const status = blockers.length ? "blocked" : warnings.length ? "review" : "pass";
  return {
    ok: status === "pass",
    status,
    summary: summarizeDiffShape({ status, files, totalLines, blockers, warnings }),
    metrics: {
      files: files.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      totalLines,
      maxFiles,
      maxLines
    },
    files,
    blockers,
    warnings,
    nonClaims: [
      "Diff-shape checks do not prove correctness.",
      "A passing diff-shape check still requires reproduction, tests, policy review, and maintainer judgment."
    ]
  };
}

function normalizeDiffFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => ({
      path: normalizePath(file.path || file.filename || file.name || ""),
      additions: nonNegativeInteger(file.additions),
      deletions: nonNegativeInteger(file.deletions)
    }))
    .filter((file) => file.path);
}

function normalizeStrings(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => normalizePath(value))
    .filter(Boolean);
}

function normalizePatterns(values) {
  return normalizeStrings(values).map((value) => {
    try {
      return new RegExp(value);
    } catch {
      return new RegExp(escapeRegExp(value));
    }
  });
}

function pathsIntersect(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return Boolean(a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.endsWith(`/${b}`)));
}

function normalizePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function nonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function summarizeDiffShape({ status, files, totalLines, blockers, warnings }) {
  if (status === "blocked") return `Blocked: ${blockers.length} diff-shape blocker(s) across ${files.length} file(s) and ${totalLines} changed line(s).`;
  if (status === "review") return `Review: ${warnings.length} warning(s) across ${files.length} file(s) and ${totalLines} changed line(s).`;
  return `Pass: diff shape is within configured limits (${files.length} file(s), ${totalLines} changed line(s)).`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
