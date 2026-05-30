#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

export const REQUIRED_FILES = [
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CODE_OF_CONDUCT.md",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/false_positive.yml",
  ".github/ISSUE_TEMPLATE/false_negative.yml",
  ".github/ISSUE_TEMPLATE/context_miss.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml"
];

export const REQUIRED_SNIPPETS = {
  "CONTRIBUTING.md": [
    "One issue per pull request.",
    "npm run repo:verify",
    "npm run ci:gates",
    "Do not claim AI-authorship detection.",
    "Do not commit local runtime evidence from `data/`."
  ],
  "SECURITY.md": [
    "Use GitHub private vulnerability reporting when it is enabled",
    "Dry-run mode must remain the default.",
    "Webhooks must use HMAC verification before public exposure.",
    "Public hosting needs authentication, rate limits, request logging, storage policy, and operational alerting"
  ],
  "SUPPORT.md": [
    "False positives",
    "False negatives",
    "Missed duplicate",
    "Claims that PCF should identify whether text was written by AI"
  ],
  "CODE_OF_CONDUCT.md": [
    "Be direct without being abusive.",
    "Misrepresenting PCF as a tool for identifying who or what wrote a contribution.",
    "Maintainers may edit, hide, close, or lock issues and pull requests"
  ],
  "LICENSE": [
    "MIT License",
    "Premature Contribution Firewall contributors"
  ],
  ".github/pull_request_template.md": [
    "## Problem",
    "## Change",
    "## Risk",
    "npm run repo:verify",
    "npm run ci:gates",
    "This does not claim AI-authorship detection.",
    "This does not enable GitHub comments, labels, or other writes by default."
  ],
  ".github/ISSUE_TEMPLATE/bug_report.yml": [
    "Steps To Reproduce",
    "Expected Behavior",
    "Actual Behavior",
    "Verification Evidence",
    "Do not include secrets"
  ],
  ".github/ISSUE_TEMPLATE/false_positive.yml": [
    "PCF blocked or slowed work that should have reached a maintainer.",
    "Expected Status",
    "Evidence That Should Have Counted",
    "This should become a feedback candidate or benchmark case."
  ],
  ".github/ISSUE_TEMPLATE/false_negative.yml": [
    "PCF treated risky, vague, broad, or unreviewable work as more ready than it was.",
    "Breakage Residue",
    "This should become a feedback candidate, benchmark case, or adversarial red-test case."
  ],
  ".github/ISSUE_TEMPLATE/context_miss.yml": [
    "Similar open issue",
    "Concurrent pull request",
    "Upstream fix",
    "Safe Repository Context Fixture"
  ],
  ".github/ISSUE_TEMPLATE/feature_request.yml": [
    "Maintainer Problem",
    "Non-Goals",
    "This feature does not depend on AI-authorship detection.",
    "This feature does not require GitHub writes by default."
  ]
};

const PLACEHOLDER_PATTERN = new RegExp(`\\b(${[
  "TO" + "DO",
  "TB" + "D",
  "FIX" + "ME",
  "lor" + "em",
  "coming" + " " + "soon",
  "OWNER" + "/" + "REPOSITORY"
].join("|")})\\b`, "i");

export const FORBIDDEN_PATTERNS = [
  { name: "local absolute path", pattern: /\/home\/|\/Users\// },
  { name: "placeholder marker", pattern: PLACEHOLDER_PATTERN },
  { name: "enabled comments", pattern: /PCF_POST_COMMENTS\s*[:=]\s*["']?true/i },
  { name: "enabled labels", pattern: /PCF_APPLY_LABELS\s*[:=]\s*["']?true/i },
  { name: "authorship detector claim", pattern: /\bAI[- ]authorship detector\b(?![^.\n]*not)/i }
];

export async function verifyRepoHygiene({ root = repoRoot } = {}) {
  const failures = [];
  const files = await readRequiredFiles(root, failures);
  for (const [filePath, snippets] of Object.entries(REQUIRED_SNIPPETS)) {
    const content = files.get(filePath) || "";
    for (const snippet of snippets) {
      if (!content.includes(snippet)) {
        failures.push(`${filePath}: missing required snippet: ${snippet}`);
      }
    }
  }

  for (const [filePath, content] of files) {
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(content)) {
        failures.push(`${filePath}: forbidden ${forbidden.name}`);
      }
    }
  }

  const templateFiles = await listIssueTemplates(root);
  const issueTemplates = templateFiles.filter((file) => file.endsWith(".yml") && file !== "config.yml");
  if (issueTemplates.length < 4) {
    failures.push(`expected at least 4 issue templates, found ${issueTemplates.length}`);
  }

  return {
    ok: failures.length === 0,
    root,
    summary: {
      requiredFiles: REQUIRED_FILES.length,
      snippetsChecked: Object.values(REQUIRED_SNIPPETS).reduce((sum, snippets) => sum + snippets.length, 0),
      issueTemplates: issueTemplates.length,
      forbiddenPatterns: FORBIDDEN_PATTERNS.length
    },
    failures
  };
}

async function readRequiredFiles(root, failures) {
  const files = new Map();
  for (const filePath of REQUIRED_FILES) {
    try {
      files.set(filePath, await readFile(join(root, filePath), "utf8"));
    } catch (error) {
      failures.push(`${filePath}: ${error.code === "ENOENT" ? "missing required file" : error.message}`);
    }
  }
  return files;
}

async function listIssueTemplates(root) {
  try {
    const dir = join(root, ".github", "ISSUE_TEMPLATE");
    return (await readdir(dir)).map((file) => relative(dir, join(dir, file)));
  } catch {
    return [];
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyRepoHygiene();
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Repository hygiene verification passed: ${result.summary.requiredFiles} files, ${result.summary.snippetsChecked} snippets, ${result.summary.issueTemplates} issue templates.\n`);
  }
}
