import { evaluateContribution } from "./evaluator.mjs";
import { parsePatchSubmission } from "./patch.mjs";

const READY_CHECK = [{ name: "maintainer-check", conclusion: "success" }];
const FAILED_CHECK = [{ name: "maintainer-check", conclusion: "failure" }];
const EXAMPLE_GITHUB_TOKEN = ["ghp", "example_secret_should_not_ship"].join("_");

export const BENCHMARK_VERSION = "2026.05.30";

export const BENCHMARK_CASES = [
  {
    id: "standard-ready-pr",
    category: "standard-pr",
    name: "Ready PR with issue, tests, and small scope",
    input: readyPr(),
    expect: { status: "ready-for-maintainer", minScore: 90, labels: ["ready-for-maintainer"], absentLabels: ["needs-tests"] }
  },
  {
    id: "standard-secret-broad-pr",
    category: "standard-pr",
    name: "Broad PR with obvious secret-like material",
    input: unreadySecretPr(),
    expect: { status: "low-review-value", maxScore: 40, labels: ["secrets-risk", "too-broad", "needs-tests"] }
  },
  {
    id: "docs-only-ready-pr",
    category: "standard-pr",
    name: "Documentation-only PR with explicit verification",
    input: docsOnlyPr(),
    expect: { status: "ready-for-maintainer", minScore: 80, labels: ["ready-for-maintainer"] }
  },
  {
    id: "dependency-unexplained-pr",
    category: "standard-pr",
    name: "Dependency change without rationale",
    input: dependencyPr({ justified: false }),
    expect: { status: "needs-repair", labels: ["dependency-review"] }
  },
  {
    id: "dependency-justified-pr",
    category: "standard-pr",
    name: "Dependency change with security rationale",
    input: dependencyPr({ justified: true }),
    expect: { status: "ready-for-maintainer", minScore: 80, absentLabels: ["dependency-review"] }
  },
  {
    id: "draft-pr",
    category: "standard-pr",
    name: "Draft PR should not request review yet",
    input: { ...readyPr(), draft: true },
    expect: { status: "needs-repair", labels: ["draft-pr"] }
  },
  {
    id: "ci-failed-pr",
    category: "standard-pr",
    name: "Otherwise good PR with failing CI",
    input: { ...readyPr(), checks: FAILED_CHECK },
    expect: { status: "needs-repair", labels: ["ci-failed"] }
  },
  {
    id: "ci-missing-pr",
    category: "standard-pr",
    name: "Otherwise good PR with no CI signal",
    input: { ...readyPr(), checks: [] },
    expect: { status: "needs-repair", labels: ["ci-missing"] }
  },
  {
    id: "mega-diff-pr",
    category: "standard-pr",
    name: "Huge unfocused diff",
    input: megaDiffPr(),
    expect: { status: "low-review-value", labels: ["too-broad"], maxScore: 80 }
  },
  {
    id: "ai-assisted-verified-pr",
    category: "tool-use",
    name: "AI-assisted PR with human verification",
    input: aiAssistedPr({ verified: true }),
    expect: { status: "ready-for-maintainer", absentLabels: ["needs-human-verification"] }
  },
  {
    id: "ai-tool-only-pr",
    category: "tool-use",
    name: "Tool-only PR with no human verification",
    input: aiAssistedPr({ verified: false }),
    expect: { status: "low-review-value", labels: ["needs-human-verification", "needs-tests"] }
  },
  {
    id: "ready-issue",
    category: "issue",
    name: "Ready issue with reproducer and logs",
    input: readyIssue(),
    expect: { status: "ready-for-maintainer", minScore: 80, labels: ["ready-for-maintainer"] }
  },
  {
    id: "device-support-issue",
    category: "issue",
    name: "Device support request with product logs and DPS evidence",
    input: deviceSupportIssue(),
    expect: { status: "ready-for-maintainer", minScore: 80, labels: ["ready-for-maintainer"], absentLabels: ["needs-reproducer", "duplicate-search-needed"], repoContext: true }
  },
  {
    id: "feature-request-ready",
    category: "issue",
    name: "Feature request with concrete use case and solution",
    input: featureRequestIssue({ ready: true }),
    expect: { status: "ready-for-maintainer", minScore: 90, labels: ["ready-for-maintainer"], absentLabels: ["needs-reproducer", "needs-logs", "needs-expected-actual"], repoContext: true }
  },
  {
    id: "feature-request-current-workflow",
    category: "issue",
    name: "Feature request with current workflow and expected behavior",
    input: featureRequestCurrentWorkflowIssue(),
    expect: { status: "ready-for-maintainer", minScore: 90, labels: ["ready-for-maintainer"], absentLabels: ["needs-use-case"], repoContext: true }
  },
  {
    id: "feature-request-security-monitoring",
    category: "issue",
    name: "Feature request for security monitoring is not a vulnerability report",
    input: featureRequestSecurityMonitoringIssue(),
    expect: { status: "ready-for-maintainer", minScore: 90, labels: ["ready-for-maintainer"], absentLabels: ["security-claim-needs-reproducer", "needs-reproducer", "needs-logs"], repoContext: true }
  },
  {
    id: "bug-template-expected-failure-output",
    category: "issue",
    name: "Bug report with expected behavior and concrete failure output",
    input: bugTemplateExpectedFailureIssue(),
    expect: { status: "ready-for-maintainer", minScore: 80, labels: ["ready-for-maintainer"], absentLabels: ["needs-expected-actual"], repoContext: true }
  },
  {
    id: "concise-protocol-feature-request",
    category: "issue",
    name: "Concise protocol support title is clear enough for feature triage",
    input: conciseProtocolFeatureRequest(),
    expect: { status: "ready-for-maintainer", labels: ["ready-for-maintainer"], absentLabels: ["needs-clear-summary"], repoContext: true }
  },
  {
    id: "structured-media-bug-template",
    category: "issue",
    name: "Structured Android media bug report does not need logs for first triage",
    input: structuredMediaBugIssue(),
    expect: { status: "ready-for-maintainer", labels: ["ready-for-maintainer"], absentLabels: ["needs-logs", "needs-technical-analysis", "needs-expected-actual"], repoContext: true }
  },
  {
    id: "structured-bug-uncertain-repro",
    category: "issue",
    name: "Structured bug report with uncertain repro still needs repair",
    input: structuredBugUncertainReproIssue(),
    expect: { status: "low-review-value", labels: ["needs-reproducer"], absentLabels: ["ready-for-maintainer"], repoContext: true }
  },
  {
    id: "combined-description-repro-steps",
    category: "issue",
    name: "Bug template with numbered repro steps inside the description",
    input: combinedDescriptionReproStepsIssue(),
    expect: { status: "ready-for-maintainer", labels: ["ready-for-maintainer"], absentLabels: ["needs-logs", "needs-technical-analysis"], repoContext: true }
  },
  {
    id: "maintainer-reproduced-issue-label",
    category: "issue",
    name: "Maintainer reproduced label routes confirmed issue without soft prompts",
    input: maintainerReproducedIssue(),
    expect: { status: "ready-for-maintainer", labels: ["maintainer-approved", "ready-for-maintainer"], absentLabels: ["needs-logs"], repoContext: true }
  },
  {
    id: "project-specific-bug-template-headings",
    category: "issue",
    name: "Project-specific bug template headings count as structured evidence",
    input: projectSpecificBugTemplateIssue(),
    expect: { status: "ready-for-maintainer", labels: ["ready-for-maintainer"], absentLabels: ["needs-logs", "needs-expected-actual"], repoContext: true }
  },
  {
    id: "contextual-follow-up-reference",
    category: "repo-context",
    name: "Contextual follow-up references do not block maintainer work",
    input: contextualFollowUpIssue(),
    expect: { status: "ready-for-maintainer", labels: ["maintainer-authored", "ready-for-maintainer"], absentLabels: ["possibly-solved", "possibly-duplicate"], repoContext: true }
  },
  {
    id: "maintainer-approved-issue-label",
    category: "issue",
    name: "Maintainer-approved issue label preserves review-now routing",
    input: maintainerApprovedIssue(),
    expect: { status: "ready-for-maintainer", labels: ["maintainer-approved", "ready-for-maintainer"], absentLabels: ["duplicate-search-needed"] }
  },
  {
    id: "maintainer-authored-internal-issue",
    category: "issue",
    name: "Maintainer-authored internal issue avoids contributor repair prompts",
    input: maintainerAuthoredInternalIssue(),
    expect: { status: "ready-for-maintainer", labels: ["maintainer-authored", "ready-for-maintainer"], absentLabels: ["needs-reproducer", "needs-expected-actual"], repoContext: true }
  },
  {
    id: "maintainer-icebox-feature-request",
    category: "issue",
    name: "Maintainer icebox label routes accepted backlog out of repair queue",
    input: maintainerIceboxFeatureRequest(),
    expect: { status: "low-review-value", labels: ["maintainer-backlog"], absentLabels: ["needs-real-evidence"], repoContext: true }
  },
  {
    id: "llm-domain-feature-request",
    category: "issue",
    name: "LLM product feature request is not tool-only evidence",
    input: llmDomainFeatureRequest(),
    expect: { status: "ready-for-maintainer", labels: ["maintainer-approved", "ready-for-maintainer"], absentLabels: ["needs-real-evidence"], repoContext: true }
  },
  {
    id: "feature-request-thin",
    category: "issue",
    name: "Thin feature request without user problem",
    input: featureRequestIssue({ ready: false }),
    expect: { status: "low-review-value", labels: ["needs-use-case"], absentLabels: ["needs-reproducer"] }
  },
  {
    id: "unready-issue",
    category: "issue",
    name: "Vague issue with no reproducer",
    input: unreadyIssue(),
    expect: { status: "low-review-value", labels: ["needs-reproducer", "needs-real-evidence"] }
  },
  {
    id: "security-no-reproducer-issue",
    category: "issue",
    name: "Security claim without reproducer",
    input: securityIssue({ reproducible: false }),
    expect: { status: "low-review-value", labels: ["security-claim-needs-reproducer", "needs-reproducer"] }
  },
  {
    id: "security-reproducer-issue",
    category: "issue",
    name: "Security-flavored report with concrete reproducer",
    input: securityIssue({ reproducible: true }),
    expect: { status: "ready-for-maintainer", absentLabels: ["security-claim-needs-reproducer"] }
  },
  {
    id: "issue-missing-duplicate-search",
    category: "issue",
    name: "Issue has reproducer but skips duplicate search",
    input: issueWithoutDuplicateSearch(),
    expect: { status: "needs-repair", labels: ["duplicate-search-needed"] }
  },
  {
    id: "policy-ready-pr",
    category: "repo-policy",
    name: "Repository policy satisfied",
    input: policyPr({ ready: true }),
    expect: { status: "ready-for-maintainer", labels: ["ready-for-maintainer"], policy: true }
  },
  {
    id: "policy-unready-pr",
    category: "repo-policy",
    name: "Repository policy ignored",
    input: policyPr({ ready: false }),
    expect: { status: "low-review-value", labels: ["policy-failed", "needs-project-test-command"], policy: true }
  },
  {
    id: "policy-codeowners-route",
    category: "repo-policy",
    name: "CODEOWNERS route is discovered",
    input: policyPr({ ready: true, ownerRouteOnly: true }),
    expect: { status: "ready-for-maintainer", policy: true, ownerMatches: 1 }
  },
  {
    id: "repo-context-similar-open-issue",
    category: "repo-context",
    name: "Similar open issue is surfaced before duplicate triage",
    input: repoContextPr({ mode: "similar-open" }),
    expect: { status: "needs-repair", labels: ["possibly-duplicate"], repoContext: true, contextFindings: 1 }
  },
  {
    id: "repo-context-comment-linked-issue",
    category: "repo-context",
    name: "Issue references from comments surface duplicate context",
    input: commentLinkedIssueContext(),
    expect: { status: "needs-repair", labels: ["possibly-duplicate"], repoContext: true, contextFindings: 1 }
  },
  {
    id: "repo-context-concurrent-pr",
    category: "repo-context",
    name: "Concurrent pull request overlaps touched files",
    input: repoContextPr({ mode: "concurrent-pr" }),
    expect: { status: "needs-repair", labels: ["concurrent-work"], repoContext: true, contextFindings: 1 }
  },
  {
    id: "repo-context-upstream-fixed",
    category: "repo-context",
    name: "Upstream already fixed similar work",
    input: repoContextPr({ mode: "upstream-fixed" }),
    expect: { status: "needs-repair", labels: ["possibly-upstream-fixed"], repoContext: true, contextFindings: 1 }
  },
  {
    id: "kernel-ready-pr",
    category: "kernel-grade",
    name: "Kernel-grade GitHub PR passes strict checks",
    input: kernelPr({ ready: true }),
    expect: { status: "ready-for-maintainer", profile: "kernel-grade", minScore: 90, labels: ["ready-for-maintainer"] }
  },
  {
    id: "kernel-missing-signoff",
    category: "kernel-grade",
    name: "Kernel-grade PR without DCO sign-off",
    input: kernelPr({ ready: false, missingSignoff: true }),
    expect: { status: "low-review-value", profile: "kernel-grade", labels: ["needs-dco-signoff"] }
  },
  {
    id: "kernel-missing-fixes",
    category: "kernel-grade",
    name: "Bug fix without Fixes tag",
    input: kernelPr({ ready: true, missingFixes: true }),
    expect: { status: "needs-repair", profile: "kernel-grade", labels: ["needs-fixes-tag"] }
  },
  {
    id: "kernel-stable-too-large",
    category: "kernel-grade",
    name: "Stable request is too large",
    input: kernelPr({ ready: true, stableTooLarge: true }),
    expect: { status: "low-review-value", profile: "kernel-grade", labels: ["stable-discipline-failed"] }
  },
  {
    id: "kernel-tool-provenance-good",
    category: "kernel-grade",
    name: "Tool use disclosed with Assisted-by and human sign-off",
    input: kernelPr({ ready: true, toolAssisted: true }),
    expect: { status: "ready-for-maintainer", profile: "kernel-grade", absentLabels: ["needs-tool-provenance"] }
  },
  {
    id: "kernel-tool-provenance-bad",
    category: "kernel-grade",
    name: "Tool-generated patch without provenance",
    input: kernelPr({ ready: false, badToolProvenance: true }),
    expect: { status: "low-review-value", profile: "kernel-grade", labels: ["needs-tool-provenance", "needs-dco-signoff"] }
  },
  {
    id: "kernel-policy-maintainer-route",
    category: "kernel-grade",
    name: "Kernel-grade PR gets maintainer route from policy files",
    input: kernelPr({ ready: true, policyRoute: true, omitCc: true }),
    expect: { status: "ready-for-maintainer", profile: "kernel-grade", ownerMatches: 1, absentLabels: ["needs-maintainer-targeting"] }
  },
  {
    id: "patch-ready-single",
    category: "patch-series",
    name: "Ready single patch from format-patch text",
    patchText: readyPatch(),
    expect: { status: "ready-for-maintainer", profile: "kernel-grade", patchCount: 1, minScore: 90 }
  },
  {
    id: "patch-unready-single",
    category: "patch-series",
    name: "Unready patch with no sign-off or evidence",
    patchText: unreadyPatch(),
    expect: { status: "low-review-value", profile: "kernel-grade", patchCount: 1, labels: ["needs-dco-signoff", "needs-tool-provenance"] }
  },
  {
    id: "patch-two-part-series",
    category: "patch-series",
    name: "Two-patch series with cover letter",
    patchText: twoPatchSeries(),
    expect: { status: "ready-for-maintainer", profile: "kernel-grade", patchCount: 2, minScore: 80 }
  },
  {
    id: "patch-secret-leak",
    category: "patch-series",
    name: "Patch text leaks a fake token",
    patchText: secretPatch(),
    expect: { status: "low-review-value", profile: "kernel-grade", labels: ["secrets-risk"] }
  },
  {
    id: "first-timer-drive-by",
    category: "review-budget",
    name: "First-time contributor with broad unreviewed change",
    input: firstTimerDriveBy(),
    expect: { status: "needs-repair", labels: ["maintainer-attention-risk"] }
  },
  {
    id: "review-budget-excessive",
    category: "review-budget",
    name: "Excessive review budget",
    input: reviewBudgetExcessive(),
    expect: { status: "low-review-value", labels: ["review-budget-high"], profile: "kernel-grade" }
  }
];

export function runBenchmark(options = {}) {
  const started = performanceNow();
  const cases = BENCHMARK_CASES.map((testCase) => runBenchmarkCase(testCase));
  const durationMs = Math.round((performanceNow() - started) * 100) / 100;
  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  return {
    ok: failed === 0,
    benchmark: {
      name: "Premature Contribution Firewall Maintainer Benchmark",
      version: BENCHMARK_VERSION,
      total: cases.length,
      passed,
      failed,
      durationMs,
      categories: summarizeBy(cases, "category"),
      statuses: summarizeBy(cases, "actualStatus")
    },
    cases: options.includeCases === false ? [] : cases
  };
}

export function runBenchmarkCase(testCase) {
  const input = testCase.patchText
    ? parsePatchSubmission(testCase.patchText, {
      profile: testCase.profile || "kernel-grade",
      repositoryFiles: testCase.repositoryFiles || []
    })
    : deepClone(testCase.input);
  const result = evaluateContribution(input, { profile: testCase.profile || input.profile });
  const failures = compareExpectation(testCase.expect || {}, result);

  return {
    id: testCase.id,
    category: testCase.category,
    name: testCase.name,
    passed: failures.length === 0,
    failures,
    expected: publicExpectation(testCase.expect || {}),
    actualStatus: result.status,
    actualScore: result.score,
    profile: result.profile.id,
    labels: result.labels,
    reviewBudget: result.reviewBudget,
    policySummary: result.policyProfile?.summary || "none",
    patchCount: result.patchSeries?.patchCount || 0
  };
}

export function renderBenchmarkMarkdown(benchmarkResult = runBenchmark()) {
  const summary = benchmarkResult.benchmark;
  const rows = benchmarkResult.cases.map((item) => [
    item.passed ? "PASS" : "FAIL",
    item.category,
    item.id,
    item.expected.status || "n/a",
    item.actualStatus,
    String(item.actualScore),
    item.labels.slice(0, 4).map((label) => `\`${label}\``).join(", ") || "none"
  ]);
  const categoryLines = Object.entries(summary.categories)
    .map(([category, counts]) => `- ${category}: ${counts.passed}/${counts.total} passing`)
    .join("\n");

  return [
    "# Premature Contribution Firewall Benchmark Results",
    "",
    "This is a deterministic local benchmark corpus for maintainer-review readiness. It is not an AI-authorship detector and it does not claim real-world precision over private maintainer decisions.",
    "",
    "## Summary",
    "",
    `- Version: ${summary.version}`,
    `- Cases: ${summary.passed}/${summary.total} passing`,
    "- Runtime: measured by the runner and returned in JSON as `durationMs`; it varies by machine",
    "",
    "## Categories",
    "",
    categoryLines,
    "",
    "## Cases",
    "",
    "| Result | Category | Case | Expected | Actual | Score | Labels |",
    "| --- | --- | --- | --- | --- | ---: | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    ""
  ].join("\n");
}

function compareExpectation(expect, result) {
  const failures = [];
  if (expect.status && result.status !== expect.status) failures.push(`status expected ${expect.status}, got ${result.status}`);
  if (expect.profile && result.profile.id !== expect.profile) failures.push(`profile expected ${expect.profile}, got ${result.profile.id}`);
  if (Number.isFinite(expect.minScore) && result.score < expect.minScore) failures.push(`score expected >= ${expect.minScore}, got ${result.score}`);
  if (Number.isFinite(expect.maxScore) && result.score > expect.maxScore) failures.push(`score expected <= ${expect.maxScore}, got ${result.score}`);
  for (const label of expect.labels || []) {
    if (!result.labels.includes(label)) failures.push(`missing label ${label}`);
  }
  for (const label of expect.absentLabels || []) {
    if (result.labels.includes(label)) failures.push(`unexpected label ${label}`);
  }
  if (expect.policy === true && !result.policyProfile?.hasPolicy) failures.push("expected policyProfile.hasPolicy");
  if (expect.repoContext === true && !result.repositoryContext?.hasContext) failures.push("expected repositoryContext.hasContext");
  if (Number.isFinite(expect.contextFindings) && (result.repositoryContext?.findings?.length || 0) < expect.contextFindings) {
    failures.push(`expected at least ${expect.contextFindings} repository context finding(s)`);
  }
  if (Number.isFinite(expect.ownerMatches) && (result.policyProfile?.ownerMatches?.length || 0) < expect.ownerMatches) {
    failures.push(`expected at least ${expect.ownerMatches} owner match(es)`);
  }
  if (Number.isFinite(expect.patchCount) && (result.patchSeries?.patchCount || 0) !== expect.patchCount) {
    failures.push(`patch count expected ${expect.patchCount}, got ${result.patchSeries?.patchCount || 0}`);
  }
  return failures;
}

function publicExpectation(expect) {
  return {
    status: expect.status || "",
    profile: expect.profile || "",
    minScore: expect.minScore ?? null,
    maxScore: expect.maxScore ?? null,
    labels: expect.labels || [],
    absentLabels: expect.absentLabels || [],
    policy: Boolean(expect.policy),
    repoContext: Boolean(expect.repoContext),
    contextFindings: expect.contextFindings ?? null,
    ownerMatches: expect.ownerMatches ?? null,
    patchCount: expect.patchCount ?? null
  };
}

function summarizeBy(cases, key) {
  return cases.reduce((acc, item) => {
    const group = item[key] || "unknown";
    const current = acc[group] || { total: 0, passed: 0, failed: 0 };
    current.total += 1;
    if (item.passed) current.passed += 1;
    else current.failed += 1;
    acc[group] = current;
    return acc;
  }, {});
}

function readyPr() {
  return {
    kind: "pull_request",
    title: "webhook: reject oversized payload bodies",
    body: [
      "Fixes #42.",
      "",
      "Problem: oversized webhook bodies could keep the local review server busy before signature handling completed.",
      "Change: reject payloads above the documented limit and return a clear error to the caller.",
      "Risk: low, because the limit already exists and this change only makes the failure path explicit.",
      "Verification: npm test passed locally and covered the oversized-payload path."
    ].join("\n"),
    authorAssociation: "CONTRIBUTOR",
    changedFiles: 2,
    additions: 48,
    deletions: 12,
    files: [
      { filename: "src/server.mjs", additions: 30, deletions: 8 },
      { filename: "test/webhook.test.mjs", additions: 18, deletions: 4 }
    ],
    checks: READY_CHECK
  };
}

function unreadySecretPr() {
  return {
    kind: "pull_request",
    title: "fix stuff",
    body: "Generated by an AI tool. It should fix lots of things.",
    authorAssociation: "FIRST_TIME_CONTRIBUTOR",
    changedFiles: 41,
    additions: 1800,
    deletions: 620,
    files: [
      { filename: "src/server.mjs", additions: 900, deletions: 300, patch: `+const token = '${EXAMPLE_GITHUB_TOKEN}';` },
      { filename: "package-lock.json", additions: 900, deletions: 320 }
    ],
    checks: []
  };
}

function docsOnlyPr() {
  return {
    kind: "pull_request",
    title: "docs: clarify webhook dry-run setup",
    body: [
      "Fixes #17.",
      "",
      "Problem: maintainers could not tell which environment variables keep GitHub writes disabled.",
      "Change: document the dry-run setup, labels, and expected local API smoke test.",
      "Risk: none for runtime behavior because this touches documentation only.",
      "Verification: manually checked the rendered Markdown and confirmed no code paths changed."
    ].join("\n"),
    changedFiles: 1,
    additions: 25,
    deletions: 3,
    files: [{ filename: "docs/webhook.md", additions: 25, deletions: 3 }],
    checks: READY_CHECK
  };
}

function dependencyPr({ justified }) {
  const body = [
    "Fixes #51.",
    "",
    "Problem: webhook signature tests should run on the current test harness.",
    justified ? "Change: updates package metadata and keeps the test script aligned with Node." : "Change: updates generated metadata and keeps the test script aligned with Node.",
    justified ? "Dependency rationale: security update for the package metadata path; no runtime dependency is introduced." : "Change was generated from automated output without a maintainer-facing reason.",
    justified ? "Risk: low because the lockfile diff is constrained." : "Risk: not explained.",
    "Verification: npm test passed locally."
  ].join("\n");
  return {
    ...readyPr(),
    title: "deps: update test harness metadata",
    body,
    changedFiles: 2,
    additions: 120,
    deletions: 90,
    files: [
      { filename: "package.json", additions: 5, deletions: 2 },
      { filename: "package-lock.json", additions: 115, deletions: 88 }
    ]
  };
}

function megaDiffPr() {
  return {
    ...readyPr(),
    title: "app: rewrite maintainer workflow",
    changedFiles: 55,
    additions: 3200,
    deletions: 2100,
    files: [{ filename: "src/everything.mjs", additions: 3200, deletions: 2100 }]
  };
}

function aiAssistedPr({ verified }) {
  return {
    ...readyPr(),
    title: "parser: handle repeated patch trailers",
    body: verified
      ? [
        "Fixes #68.",
        "",
        "Problem: repeated trailers in patch text were collapsed in the parser.",
        "Change: preserve repeated trailer keys while keeping the output deterministic.",
        "AI disclosure: Claude suggested the initial parser shape, but I reviewed the diff, rewrote the edge-case handling, and verified it locally.",
        "Risk: low because output remains additive.",
        "Verification: npm test passed locally and I manually checked before/after parser output."
      ].join("\n")
      : "ChatGPT generated this parser update. It should work.",
    files: verified
      ? [{ filename: "src/core/patch.mjs", additions: 44, deletions: 9 }, { filename: "test/patch.test.mjs", additions: 30, deletions: 0 }]
      : [{ filename: "src/core/patch.mjs", additions: 44, deletions: 9 }],
    checks: verified ? READY_CHECK : []
  };
}

function readyIssue() {
  return {
    kind: "issue",
    title: "Webhook dry-run response omits would-post labels",
    body: [
      "Steps to reproduce:",
      "1. Start the server on current main.",
      "2. Send a pull_request webhook with PCF_DRY_RUN=true.",
      "3. Inspect the JSON response.",
      "",
      "Expected: response includes the labels that would be applied.",
      "Actual: response includes the comment but omits labels.",
      "",
      "Environment: commit abc1234 on Node 22, Linux x86_64.",
      "Logs:",
      "```",
      "webhook status=200 event=pull_request dryRun=true",
      "```",
      "Duplicate search: searched existing issues and current main; not a duplicate.",
      "Root cause: formatWebhookDryRun returns only the comment body."
    ].join("\n")
  };
}

function unreadyIssue() {
  return {
    kind: "issue",
    title: "bug",
    body: "AI says there is a vulnerability. Please fix."
  };
}

function securityIssue({ reproducible }) {
  if (!reproducible) {
    return {
      kind: "issue",
      title: "Possible security vulnerability",
      body: "A scanner says this may be an RCE security vulnerability. I do not have logs or steps."
    };
  }
  return {
    kind: "issue",
    title: "Webhook parser accepts unsigned payload in dry-run mode",
    body: [
      "Steps to reproduce:",
      "1. Configure PCF_WEBHOOK_SECRET=test.",
      "2. Send a webhook with an invalid signature.",
      "3. Compare response before and after the check.",
      "",
      "Expected: the request is rejected with 401.",
      "Actual: the old branch accepted the request.",
      "",
      "Environment: current main, Node 22, Linux x86_64.",
      "Logs:",
      "```",
      "signature mismatch",
      "```",
      "Duplicate search: searched existing issues and current main; not a duplicate.",
      "Root cause: signature verification returned skipped when a secret was configured."
    ].join("\n")
  };
}

function issueWithoutDuplicateSearch() {
  return {
    kind: "issue",
    title: "Policy files are ignored for ready PRs",
    body: [
      "Steps to reproduce:",
      "1. Add a CONTRIBUTING.md requiring npm test.",
      "2. Submit a PR body with expected and actual behavior.",
      "3. Run the evaluator.",
      "",
      "Expected: missing npm test evidence creates a repair item.",
      "Actual: the submission passes without the project command.",
      "",
      "Environment: commit abc1234, Node 22.",
      "Logs:",
      "```",
      "policyProfile.hasPolicy=true",
      "```"
    ].join("\n")
  };
}

function deviceSupportIssue() {
  return {
    kind: "issue",
    title: "Request support for Meaco Sefte Pro Fan",
    labels: [{ name: "new device" }, { name: "log provided" }],
    body: [
      "### Log message",
      "",
      "```text",
      "Device matches meaco_seftepro_fan with quality of 101%.",
      "LOCAL DPS: {\"updated_at\": 1780147804.936074, \"1\": true, \"2\": \"Normal\", \"3\": 1}",
      "```",
      "",
      "### Product ID",
      "",
      "hf57kaednmtjbynq",
      "",
      "### Product Name",
      "",
      "Meaco Sefte Pro",
      "",
      "### DPS information",
      "",
      "```text",
      "name: Meaco Sefte Pro Fan",
      "products:",
      "  - id: hf57kaednmtjbynq",
      "    manufacturer: Meaco",
      "    model: Sefte Pro",
      "entities:",
      "  - entity: fan",
      "    dps:",
      "      - id: 1",
      "        type: boolean",
      "        name: switch",
      "```"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "make-all/tuya-local",
      issues: [],
      pullRequests: []
    }
  };
}

function featureRequestIssue({ ready }) {
  if (!ready) {
    return {
      kind: "issue",
      title: "Dark mode",
      labels: [{ name: "enhancement" }],
      body: "Please add dark mode."
    };
  }
  return {
    kind: "issue",
    title: "Add the ability to have TrackLink inserted by default",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am frustrated when I forget to click the TrackLink checkbox before sending a campaign.",
      "",
      "**Describe the solution you'd like**",
      "I would like a setting that automatically enables TrackLink for pasted links."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "knadh/listmonk",
      issues: [],
      pullRequests: []
    }
  };
}

function featureRequestCurrentWorkflowIssue() {
  return {
    kind: "issue",
    title: "Feature request: Select Subscription Status on list export",
    labels: [{ name: "enhancement" }],
    body: [
      "When I use a single opt-in list, I expect exports to distinguish confirmed and unconfirmed subscribers.",
      "Currently, the default export contains every subscriber regardless of subscription status.",
      "I would like to select which statuses should be exported from the List Subscribers overview.",
      "For double opt-in lists, I can already filter confirmed subscriptions and export those."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "knadh/listmonk",
      issues: [],
      pullRequests: []
    }
  };
}

function featureRequestSecurityMonitoringIssue() {
  return {
    kind: "issue",
    title: "[Feature]: Add SSL certificate expiry and SNMP monitoring",
    labels: [{ name: "enhancement" }],
    body: [
      "### Welcome!",
      "",
      "- [x] I have searched open and closed feature requests.",
      "- [x] This is a feature request, not a bug report or support question.",
      "",
      "### Component",
      "",
      "Hub",
      "",
      "### Description",
      "",
      "I propose adding SSL certificate expiry monitoring and SNMP device monitoring to improve system observability.",
      "The SSL monitor should let users enter target domains or IPs, alert thresholds, and notifications before certificates expire.",
      "The SNMP monitor should support v2c and v3, connection details, authentication settings, and custom metric OIDs.",
      "",
      "### Motivation / Use Case",
      "",
      "This would help prevent service outages caused by certificate expiration and would let a homelab monitor switches and routers from the same dashboard."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "henrygd/beszel",
      issues: [],
      pullRequests: []
    }
  };
}

function bugTemplateExpectedFailureIssue() {
  return {
    kind: "issue",
    title: "Android app can no longer connect to my self-hosted instance",
    labels: [{ name: "bug" }, { name: "status/untriaged" }],
    body: [
      "### Describe the Bug",
      "The Android app fails to connect to my self-hosted instance even though the same phone can open the instance URL in a browser.",
      "```text",
      "Network connection failed: Failed to connect to https://example.invalid:443",
      "```",
      "",
      "### Steps to Reproduce",
      "1. Open Android app.",
      "2. Provide self-hosted URL and API key.",
      "3. Attempt to connect.",
      "",
      "### Expected Behaviour",
      "The app should connect because the instance is reachable from the same device browser.",
      "",
      "### Device Details",
      "Android 16 on Pixel 10",
      "",
      "### Exact Karakeep Version",
      "Latest version installed from Google Play store",
      "",
      "### Environment Details",
      "Docker on Debian behind Traefik.",
      "",
      "### Have you checked the troubleshooting guide?",
      "- [x] I have checked the troubleshooting guide and I haven't found a solution to my problem"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  };
}

function conciseProtocolFeatureRequest() {
  return {
    kind: "issue",
    title: "Support SSO",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am trying to implement SSO on my homelab, but the Android app does not support the Jellyfin SSO plugin.",
      "",
      "**Describe the solution you'd like**",
      "Support the SSO login flow used by the Jellyfin plugin so users can authenticate without falling back to password-only app login.",
      "",
      "**Describe alternatives you've considered**",
      "Quick Connect works as a workaround, but it does not provide the same SSO policy coverage.",
      "",
      "**Additional context**",
      "The browser flow works today with the same server."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  };
}

function structuredMediaBugIssue() {
  return {
    kind: "issue",
    title: "Trickplay doesn't load from where the content started playing",
    labels: [{ name: "bug" }],
    body: [
      "### Describe your issue",
      "",
      "If you start a movie or episode in the middle, it will not load trickplay. It only loads if playback starts at the beginning.",
      "",
      "### Steps to reproduce",
      "",
      "1. Play an episode from the middle.",
      "2. Try to initiate swipe to trickplay or seek to trickplay.",
      "3. Observe that trickplay does not work.",
      "",
      "### Expected behavior",
      "",
      "Trickplay is loaded from where playback starts, and seeking should not start trickplay until it is loaded.",
      "",
      "### Screenshots",
      "",
      "_No response_",
      "",
      "### Player",
      "",
      "mpv",
      "",
      "### Additional context",
      "",
      "_No response_",
      "",
      "### Device",
      "",
      "Galaxy S25",
      "",
      "### Android version",
      "",
      "16",
      "",
      "### App version",
      "",
      "1.0.2",
      "",
      "### Jellyfin version",
      "",
      "10.11.8"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  };
}

function structuredBugUncertainReproIssue() {
  return {
    kind: "issue",
    title: "Skipping EP",
    labels: [{ name: "bug" }],
    body: [
      "### Describe your issue",
      "",
      "The app sometimes skips episodes and reports that details do not match the play item.",
      "",
      "### Steps to reproduce",
      "",
      "I don't know how to reproduce this. It may happen after switching apps and coming back.",
      "",
      "### Expected behavior",
      "",
      "The app should not skip from one episode to another unexpectedly.",
      "",
      "### Player",
      "",
      "mpv",
      "",
      "### Device",
      "",
      "A71",
      "",
      "### Android version",
      "",
      "13",
      "",
      "### App version",
      "",
      "1.0.2",
      "",
      "### Jellyfin version",
      "",
      "10.10.7"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  };
}

function combinedDescriptionReproStepsIssue() {
  return {
    kind: "issue",
    title: "[Bug]: 'Minimize to Tray' does not work with Wayland",
    labels: [{ name: "bug" }, { name: "B: usability" }],
    body: [
      "### Guidelines",
      "",
      "- [x] I have encountered this bug in the latest release.",
      "- [x] I have encountered this bug in the official downloads.",
      "- [x] I have searched the issue tracker for open and closed issues.",
      "- [x] I have searched the documentation.",
      "- [x] This issue contains only one bug.",
      "",
      "### Describe the bug",
      "",
      "1. Enable \"Minimize to system tray\" setting.",
      "2. Minimize window.",
      "3. The window is not minimized to tray.",
      "",
      "### Expected Behavior",
      "",
      "Window should be minimized to tray.",
      "",
      "### Issue Labels",
      "",
      "usability issue",
      "",
      "### FreeTube Version",
      "",
      "v0.24.0-beta",
      "",
      "### Operating System Version",
      "",
      "Bazzite 44 NVIDIA Edition (Wayland)",
      "",
      "### Installation Method",
      "",
      "Flathub",
      "",
      "### Primary API used",
      "",
      "Local API",
      "",
      "### Additional Information",
      "",
      "If I add --ozone-platform=x11 to FreeTube's Electron args, the minimize event is correctly triggered and the tray icon works."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "FreeTubeApp/FreeTube",
      issues: [],
      pullRequests: []
    }
  };
}

function maintainerReproducedIssue() {
  return {
    kind: "issue",
    title: "[Bug]: Proxy-settings do not work at launch of FreeTube",
    labels: [{ name: "bug" }, { name: "U: reproduced" }],
    body: [
      "### Describe the bug",
      "",
      "The proxy works during the current session, but after closing and launching FreeTube again the existing proxy settings are ignored.",
      "",
      "### Expected Behavior",
      "",
      "FreeTube should use the configured proxy at launch.",
      "",
      "### FreeTube Version",
      "",
      "v0.21.3 Beta",
      "",
      "### Operating System Version",
      "",
      "Windows 11 Pro 23H2",
      "",
      "### Installation Method",
      "",
      "Chocolatey",
      "",
      "### Primary API used",
      "",
      "Local API"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "FreeTubeApp/FreeTube",
      issues: [],
      pullRequests: []
    }
  };
}

function projectSpecificBugTemplateIssue() {
  return {
    kind: "issue",
    title: "Videos: VAAPI transcoding not working in latest release",
    labels: [{ name: "video" }],
    body: [
      "### What is not working as documented?",
      "",
      "After updating to the latest Docker image, VAAPI encode on Haswell no longer works.",
      "The FFmpeg command aborts with `A hardware device reference is required to upload frames to.` and PhotoPrism falls back to software encoding.",
      "",
      "### How can we reproduce it?",
      "",
      "Use the Docker container on a host with a GPU that supports VAAPI encode (not sure if this only occurs with Intel; the error seems generic).",
      "",
      "### What behavior do you expect?",
      "",
      "VAAPI hardware accelerated transcoding should work.",
      "",
      "### What could be the cause?",
      "",
      "FFmpeg was updated to 8.x in this release.",
      "",
      "### Which software versions do you use?",
      "",
      "- PhotoPrism Edition & Version (Build): May 2026 release, Docker AMD64",
      "",
      "### On what device is PhotoPrism installed?",
      "",
      "Intel i5 4590T",
      "",
      "### Logs, Sample Files, or Screenshots",
      "",
      "[log.txt](https://example.invalid/log.txt)"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "photoprism/photoprism",
      issues: [],
      pullRequests: []
    }
  };
}

function contextualFollowUpIssue() {
  return {
    kind: "issue",
    title: "Videos: Improve and verify hardware transcoding with FFmpeg 8",
    authorAssociation: "MEMBER",
    labels: [{ name: "please-test" }, { name: "video" }],
    body: [
      "#5630 tracked and fixed the VAAPI regression specifically; this issue covers the broader follow-up work to verify all hardware encoders on FFmpeg 8.",
      "",
      "### Acceptance Criteria",
      "- [x] VA-API transcoding MUST initialize a filter device.",
      "- [x] Intel Quick Sync and NVENC transcoding MUST be verified working on FFmpeg 8."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "photoprism/photoprism",
      issues: [
        {
          number: 5630,
          title: "Videos: VAAPI transcoding not working in latest release",
          body: "VAAPI regression fixed in a targeted issue.",
          state: "open",
          labels: ["please-test", "video"],
          htmlUrl: "https://github.example/issues/5630"
        }
      ],
      pullRequests: []
    }
  };
}

function maintainerApprovedIssue() {
  return {
    kind: "issue",
    title: "Crawler: BROWSER_WEB_URL fails on IPv6-enabled Docker networks",
    labels: [{ name: "bug" }, { name: "status/approved" }],
    body: [
      "**Summary**",
      "When running on an IPv6-enabled Docker network, BROWSER_WEB_URL=http://chrome:9222 reports Chrome as Disconnected with HTTP 500 even though Chrome is healthy and reachable via IPv4.",
      "",
      "**Root Cause**",
      "The code resolves chrome to an IPv6 address and assigns it to URL.hostname without brackets, so the URL stays http://chrome:9222/.",
      "```js",
      "const u = new URL('http://chrome:9222');",
      "u.hostname = 'fd3a:d485:7e1d:e::3';",
      "console.log(u.toString());",
      "```",
      "",
      "Steps to Reproduce",
      "1. Run karakeep with an IPv6-enabled Docker network.",
      "2. Set BROWSER_WEB_URL=http://chrome:9222.",
      "3. Observe the crawler reporting Chrome as disconnected.",
      "",
      "Environment",
      "- Docker network with IPv6 enabled",
      "- Chrome remote debugging bound to IPv4"
    ].join("\n")
  };
}

function maintainerAuthoredInternalIssue() {
  return {
    kind: "issue",
    title: "Some users do not restart accessibility service after it is killed by the system",
    authorAssociation: "COLLABORATOR",
    labels: [{ name: "user experience" }, { name: "needs triage" }],
    body: [
      "A user in Discord would tap Proceed and then close the online guide. This does not restart the accessibility service.",
      "It is possible restart suggests it will reboot the device, causing users to avoid that option.",
      "The current online guide is ineffective for users who are unlikely to read the full guide or follow outdated steps.",
      "More aggressive service restarting might have better results."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "keymapperorg/KeyMapper",
      issues: [],
      pullRequests: []
    }
  };
}

function maintainerIceboxFeatureRequest() {
  return {
    kind: "issue",
    title: "Automatically hoard websites that get visited",
    labels: [{ name: "feature request" }, { name: "status/icebox" }],
    body: [
      "### Describe the feature you'd like",
      "I propose an opt-in browser extension setting that automatically snapshots a website once visited.",
      "",
      "### Describe the benefits this would bring to existing Karakeep users",
      "People often try to find a site they visited years ago but forgot the title for. With Karakeep search and AI features, a browser-history-style snapshot can make that possible.",
      "",
      "### Can the goal of this request already be achieved via other means?",
      "There is no browser extension setting that automatically hoards visited websites.",
      "",
      "### Have you searched for an existing open/closed issue?",
      "- [x] I have searched for existing issues and none cover my fundamental request"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  };
}

function llmDomainFeatureRequest() {
  return {
    kind: "issue",
    title: "Feature Request: Allow configuring reasoning behavior for LLM calls",
    labels: [{ name: "feature request" }, { name: "status/approved" }],
    body: [
      "### Describe the feature you'd like",
      "Karakeep currently does not provide a way to control reasoning behavior when making LLM calls.",
      "When using reasoning-capable models with structured JSON output, the model can consume all tokens on reasoning and return content: null.",
      "Example real trace: prompt_tokens: 2244, completion_tokens: 2048, content: null, reasoning_content: present.",
      "Proposed solution: allow users to configure reasoning behavior with parameters such as reasoning effort none.",
      "",
      "### Describe the benefits this would bring to existing Karakeep users",
      "This improves reliability, performance, and compatibility for local and hosted model integrations.",
      "",
      "### Can the goal of this request already be achieved via other means?",
      "A LiteLLM proxy may be able to work around this for one virtual key.",
      "",
      "### Have you searched for an existing open/closed issue?",
      "- [x] I have searched for existing issues and none cover my fundamental request"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  };
}

function policyPr({ ready, ownerRouteOnly = false }) {
  return {
    ...readyPr(),
    title: ready ? "core: enforce repository policy checks" : "update",
    body: ready
      ? [
        "## Description",
        "Fixes #80.",
        "Problem: repository-specific rules were invisible to the evaluator.",
        "Change: load policy files and enforce required PR template sections.",
        "",
        "## Linked issue",
        "Fixes #80.",
        "",
        "## Tests",
        "Verification: npm test passed locally.",
        "",
        "## Risk",
        "Risk is low because the checks only add repair guidance.",
        "",
        "Signed-off-by: Jane Maintainer <jane@example.org>"
      ].join("\n")
      : "I changed the evaluator because an AI tool suggested this would be better.",
    files: [{ filename: "src/core/evaluator.mjs", additions: 48, deletions: 12 }],
    checks: ready ? READY_CHECK : [],
    repositoryFiles: [
      { path: "CONTRIBUTING.md", content: "Every pull request must link an issue, include tests or verification, and use a Signed-off-by line for DCO accountability." },
      { path: ".github/pull_request_template.md", content: "## Description\n## Linked issue\n## Tests\n## Risk\n\n- [ ] I ran the project test command." },
      { path: "CODEOWNERS", content: "/src/core/ @maintainers/core\n/test/ @maintainers/test" },
      { path: "package.json", content: "{\"scripts\":{\"test\":\"node --test\",\"check\":\"node --check src/core/evaluator.mjs\"}}" }
    ],
    authorAssociation: ownerRouteOnly ? "MEMBER" : "CONTRIBUTOR"
  };
}

function commentLinkedIssueContext() {
  return {
    kind: "issue",
    number: 10,
    title: "Add the ability to have TrackLink inserted by default",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am frustrated when I forget to click the TrackLink checkbox before sending a campaign.",
      "",
      "**Describe the solution you'd like**",
      "I would like a setting that automatically enables TrackLink for pasted links."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "knadh/listmonk",
      currentIssueRefs: [9],
      issues: [
        {
          number: 9,
          title: "feat: Auto-track all links and views without manual configuration",
          body: "Automatically track all links and views without manual steps.",
          state: "open",
          labels: ["enhancement"],
          htmlUrl: "https://github.example/issues/9"
        }
      ],
      pullRequests: []
    }
  };
}

function repoContextPr({ mode }) {
  const base = {
    ...readyPr(),
    title: "webhook: include labels in dry-run response",
    body: [
      "Fixes #41.",
      "",
      "Problem: dry-run webhook responses omit the labels that would be applied.",
      "Change: return the maintainer labels beside the comment preview.",
      "Risk: low because this changes dry-run JSON only.",
      "Verification: npm test passed locally. Expected labels are present; actual before omitted labels."
    ].join("\n"),
    files: [
      { filename: "src/github/templates.mjs", additions: 25, deletions: 4 },
      { filename: "test/webhook.test.mjs", additions: 20, deletions: 4 }
    ]
  };

  if (mode === "similar-open") {
    return {
      ...base,
      repositoryContext: {
        repository: "VrtxOmega/premature-contribution-firewall",
        issues: [
          {
            number: 41,
            title: "Dry-run webhook response should include would-apply labels",
            body: "The dry-run JSON response omits labels, so maintainers cannot preview label writes.",
            state: "open",
            labels: ["bug"],
            htmlUrl: "https://github.example/issues/41"
          }
        ]
      }
    };
  }

  if (mode === "concurrent-pr") {
    return {
      ...base,
      repositoryContext: {
        repository: "VrtxOmega/premature-contribution-firewall",
        pullRequests: [
          {
            number: 77,
            title: "webhook: expose dry-run label preview",
            body: "Adds label preview output to dry-run webhook responses.",
            state: "open",
            files: ["src/github/templates.mjs"],
            htmlUrl: "https://github.example/pull/77"
          }
        ]
      }
    };
  }

  return {
    ...base,
    repositoryContext: {
      repository: "VrtxOmega/premature-contribution-firewall",
      upstream: {
        repository: "upstream/premature-contribution-firewall",
        pullRequests: [
          {
            number: 300,
            title: "webhook: include dry-run labels in response",
            body: "Merged fix for dry-run labels.",
            state: "merged",
            files: ["src/github/templates.mjs"],
            htmlUrl: "https://github.example/upstream/pull/300"
          }
        ]
      }
    }
  };
}

function kernelPr({
  ready,
  missingSignoff = false,
  missingFixes = false,
  stableTooLarge = false,
  toolAssisted = false,
  badToolProvenance = false,
  policyRoute = false,
  omitCc = false
}) {
  const signoff = missingSignoff || badToolProvenance ? "" : "Signed-off-by: Jane Maintainer <jane@example.org>";
  const fixes = missingFixes ? "" : "Fixes: 123456789abc (\"sched: add delayed rq clock update\")";
  const cc = omitCc ? "" : "Cc: linux-kernel@vger.kernel.org";
  const stable = stableTooLarge ? "Cc: stable@vger.kernel.org" : "";
  const tool = toolAssisted
    ? "Assisted-by: Claude:claude-code [parser suggestion only]\n"
    : badToolProvenance
      ? "AI generated this patch.\n"
      : "";
  return {
    kind: "pull_request",
    profile: "kernel-grade",
    title: ready ? "sched: guard rq clock update against null rq" : "fix stuff",
    body: [
      "Problem: sched_update_rq_clock() can be reached from the CPU hotplug teardown path after the runqueue pointer has been cleared.",
      "Reachability: reproduce by offlining a CPU while a debug build forces delayed clock updates through the teardown path.",
      "Effect: the current code can panic with a null pointer dereference before CPU offline completes.",
      "Correctness: returning early when rq is NULL is safe because there is no runqueue clock to update and normal scheduler paths still pass a valid rq.",
      tool,
      fixes,
      stable,
      cc,
      "Reported-by: Example Reporter <reporter@example.org>",
      signoff,
      "",
      "Verification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64; kselftest sched."
    ].filter((line) => line !== "").join("\n"),
    authorAssociation: "CONTRIBUTOR",
    changedFiles: stableTooLarge ? 12 : 1,
    additions: stableTooLarge ? 900 : 3,
    deletions: stableTooLarge ? 200 : 0,
    files: [{ filename: "kernel/sched/core.c", additions: stableTooLarge ? 900 : 3, deletions: stableTooLarge ? 200 : 0 }],
    checks: READY_CHECK,
    repositoryFiles: policyRoute
      ? [{ path: "CODEOWNERS", content: "/kernel/sched/ @kernel/sched-maintainers" }]
      : []
  };
}

function readyPatch() {
  return `From 1111111111111111111111111111111111111111 Mon Sep 17 00:00:00 2001
From: Jane Maintainer <jane@example.org>
Date: Fri, 29 May 2026 12:00:00 -0500
Subject: [PATCH 1/1] sched: guard rq clock update against null rq

Problem: sched_update_rq_clock() can be reached from the hotplug teardown path after the runqueue pointer has already been cleared. A reproducer is to offline a CPU while a debug build is forcing the delayed clock update path.

Effect: the current code can panic with a null pointer dereference before CPU offline completes.

Correctness: return early when rq is NULL because there is no runqueue clock to update and the caller already treats teardown as best-effort.

Fixes: 123456789abc ("sched: add delayed rq clock update")
Cc: stable@vger.kernel.org
Cc: linux-kernel@vger.kernel.org
Signed-off-by: Jane Maintainer <jane@example.org>

Verification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64; kselftest sched.

diff --git a/kernel/sched/core.c b/kernel/sched/core.c
index 1111111..2222222 100644
--- a/kernel/sched/core.c
+++ b/kernel/sched/core.c
@@ -100,6 +100,9 @@ void sched_update_rq_clock(struct rq *rq)
 {
+	if (!rq)
+		return;
+
 rq->clock = sched_clock_cpu(cpu_of(rq));
 }`;
}

function unreadyPatch() {
  return `From 2222222222222222222222222222222222222222 Mon Sep 17 00:00:00 2001
From: Patch Bot <bot@example.org>
Date: Fri, 29 May 2026 12:05:00 -0500
Subject: [PATCH] fix stuff

AI generated this and it should fix a crash.

diff --git a/kernel/sched/core.c b/kernel/sched/core.c
index 1111111..3333333 100644
--- a/kernel/sched/core.c
+++ b/kernel/sched/core.c
@@ -100,6 +100,7 @@ void sched_update_rq_clock(struct rq *rq)
 {
+	/* maybe fixes it */
 rq->clock = sched_clock_cpu(cpu_of(rq));
 }`;
}

function twoPatchSeries() {
  return `From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001
From: Jane Maintainer <jane@example.org>
Subject: [PATCH 0/2] sched: harden rq clock teardown

Cover letter: this patch series fixes a CPU hotplug teardown crash and adds a targeted selftest. Reproduce by offlining a CPU on a debug build while delayed rq clock updates are enabled.

Verification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64; kselftest sched.

From 1111111111111111111111111111111111111111 Mon Sep 17 00:00:00 2001
From: Jane Maintainer <jane@example.org>
Subject: [PATCH 1/2] sched: guard rq clock update against null rq

Problem: sched_update_rq_clock() can be reached from the CPU hotplug teardown path after the runqueue pointer has been cleared.
Reachability: reproduce by offlining a CPU with delayed clock updates enabled.
Effect: the current code can panic with a null pointer dereference.
Correctness: returning early when rq is NULL is safe because there is no runqueue clock to update.

Fixes: 123456789abc ("sched: add delayed rq clock update")
Cc: linux-kernel@vger.kernel.org
Signed-off-by: Jane Maintainer <jane@example.org>

Verification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64; kselftest sched.

diff --git a/kernel/sched/core.c b/kernel/sched/core.c
index 1111111..2222222 100644
--- a/kernel/sched/core.c
+++ b/kernel/sched/core.c
@@ -100,6 +100,8 @@ void sched_update_rq_clock(struct rq *rq)
 {
+	if (!rq)
+		return;
 rq->clock = sched_clock_cpu(cpu_of(rq));
 }

From 2222222222222222222222222222222222222222 Mon Sep 17 00:00:00 2001
From: Jane Maintainer <jane@example.org>
Subject: [PATCH 2/2] selftests: add sched rq clock teardown coverage

Problem: the rq clock hotplug crash had no regression coverage.
Reachability: the selftest exercises CPU offline and delayed rq clock paths.
Effect: future regressions are caught before review.
Correctness: the test fails before the fix and passes after it.

Cc: linux-kernel@vger.kernel.org
Signed-off-by: Jane Maintainer <jane@example.org>

Verification: make x86_64_defconfig; make -j32; scripts/checkpatch.pl --strict; sparse C=1; boot tested on x86_64; kselftest sched.

diff --git a/tools/testing/selftests/sched/rq_clock.sh b/tools/testing/selftests/sched/rq_clock.sh
new file mode 100755
index 0000000..4444444
--- /dev/null
+++ b/tools/testing/selftests/sched/rq_clock.sh
@@ -0,0 +1,3 @@
+#!/bin/sh
+echo rq-clock-hotplug
+exit 0`;
}

function secretPatch() {
  return `${readyPatch()}

diff --git a/scripts/leak.sh b/scripts/leak.sh
new file mode 100644
index 0000000..9999999
--- /dev/null
+++ b/scripts/leak.sh
@@ -0,0 +1 @@
+TOKEN="${EXAMPLE_GITHUB_TOKEN}"`;
}

function firstTimerDriveBy() {
  return {
    ...readyPr(),
    title: "ui: reorganize all maintainer panels",
    authorAssociation: "FIRST_TIME_CONTRIBUTOR",
    changedFiles: 11,
    additions: 520,
    deletions: 90,
    files: [{ filename: "public/app.js", additions: 520, deletions: 90 }],
    checks: READY_CHECK
  };
}

function reviewBudgetExcessive() {
  return {
    ...kernelPr({ ready: true }),
    authorAssociation: "FIRST_TIME_CONTRIBUTOR",
    changedFiles: 35,
    additions: 2200,
    deletions: 1500,
    files: [{ filename: "kernel/sched/core.c", additions: 2200, deletions: 1500 }]
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function performanceNow() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
