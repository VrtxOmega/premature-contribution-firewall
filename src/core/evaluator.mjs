import {
  buildPolicyProfile,
  evaluatePolicyRequirements,
  evaluateProjectTestCommand,
  normalizeRepositoryFiles
} from "./policy.mjs";
import { analyzeRepositoryContext, normalizeRepositoryContext } from "./repository-context.mjs";
import { applyFeedbackCalibration } from "./calibration.mjs";

const GENERIC_TITLES = new Set([
  "fix",
  "fix bug",
  "fix stuff",
  "bug",
  "update",
  "changes",
  "improvements",
  "wip",
  "quick fix"
]);

const SIGNALS = {
  issueLink: /\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#\d+\b|github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i,
  testMention: /\b(npm test|node --test|pytest|cargo test|go test|unit tests?|integration tests?|manual(?:ly)? test(?:ed)?|verified|verification)\b/i,
  noTestsReason: /\b(no tests?|not applicable|docs only|documentation only|manual verification only)\b/i,
  repro: /\b(steps to reproduce|repro(?:duce|duction)?|expected|actual|before|after)\b/i,
  expectedActual: /\bexpected\b[\s\S]*\bactual\b|\bactual\b[\s\S]*\bexpected\b/i,
  duplicateSearch: /\b(duplicate|searched existing|searched issues|already fixed|current main|latest main|not a duplicate)\b/i,
  version: /\b(version|commit|sha|main|release|v?\d{4}\.\d+(?:\.\d+)?|v\d+\.\d+|node\s+\d+|python\s+\d+|os:|environment)\b/i,
  logs: /```|stack trace|traceback|journal|log output|error output|exception|panic/i,
  rootCause: /\b(root cause|cause[ds]?|because|bisect|regression|culprit|patch|proposed fix|able to fix|workaround|analysis)\b/i,
  aiDisclosure: /\b(ai|llm|chatgpt|copilot|claude|gemini|generated)\b/i,
  aiReportClaim: /\b(?:asked\s+(?:an?\s+)?ai|ai\s+(?:said|says|found|reported|detected|suggested)|(?:chatgpt|copilot|claude|gemini|ai tool|llm)\s+(?:said|says|found|reported|detected|suggested|generated|wrote|claims?))\b/i,
  humanAccountability: /\b(tested|verified|reviewed|reproduced|i understand|manual|locally)\b/i,
  dependencyJustification: /\b(dependenc(?:y|ies)|package|lockfile|upgrade|security update|npm install|npm audit|vulnerability)\b/i,
  securityClaim: /\b(vulnerability|cve|exploit|rce|xss|csrf|injection|overflow)\b|\bsecurity\s+(?:vulnerability|issue|bug|flaw|risk|report|advisory|incident|hole)\b/i,
  negatedVerification: /\b(?:did\s+not|didn't|do\s+not|don't|was\s+not|wasn't|were\s+not|weren't|never|not)\s+(?:personally\s+)?(?:run|execute|test|verify|check)\b|\b(?:tests?|verification|ci|checks?)\s+(?:were\s+)?(?:not|never)\s+(?:run|executed|performed|checked)\b/i,
  supportedNoTestsReason: /\b(?:not applicable|docs only|documentation only|no code change|copy only|comment only|manual verification only|no runtime behavior)\b/i,
  generatedJustification: /\b(?:generated|dist|bundle|minified|vendor(?:ed)?|checked[- ]in artifact|built artifact)\b[\s\S]{0,120}\b(?:required|necessary|because|reason|release|snapshot|reproducible|source)\b/i,
  promptInjection: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system|developer|maintainer)\s+instructions\b|\b(?:bypass|override)\s+(?:the\s+)?(?:review|firewall|policy|checks?)\b|\bdo\s+not\s+(?:mention|report|flag|label)\b|\b(?:label|mark)\s+(?:this\s+)?(?:as\s+)?ready-for-maintainer\b/i
};

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /\b(?:aws_)?secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{30,}['"]?/i,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\b(?:api[_-]?key|token|secret|password|access[_-]?key)\s*[:=]\s*['"]?(?![$!{<])[^'"\s]{12,}['"]?/i
];

const STATUS_COPY = {
  pass: "pass",
  warn: "warn",
  fail: "fail"
};

const PROFILES = {
  standard: {
    id: "standard",
    name: "Standard Maintainer",
    description: "General GitHub maintainer review-readiness checks."
  },
  "kernel-grade": {
    id: "kernel-grade",
    name: "Kernel-Grade",
    description: "Strict patch-discipline checks inspired by Linux kernel contribution norms."
  }
};

const ISSUE_SOFT_REPAIR_LABELS = new Set([
  "needs-clear-summary",
  "needs-context",
  "needs-reproducer",
  "needs-use-case",
  "needs-feature-solution",
  "needs-feature-scope",
  "needs-expected-actual",
  "needs-environment",
  "needs-logs",
  "duplicate-search-needed",
  "needs-technical-analysis",
  "needs-real-evidence"
]);

const ISSUE_HARD_RISK_LABELS = new Set([
  "secrets-risk",
  "prompt-injection-risk",
  "security-claim-needs-reproducer",
  "wrong-repository"
]);

export function evaluateContribution(rawInput = {}, options = {}) {
  const input = normalizeInput(rawInput);
  const profile = resolveProfile(input, options);
  const kind = input.kind === "issue" ? "issue" : "pull_request";
  const baseResult = kind === "issue" ? evaluateIssue(input, { ...options, profile }) : evaluatePullRequest(input, { ...options, profile });
  baseResult.profile = profile;
  const result = options.feedbackCalibration
    ? applyFeedbackCalibration(baseResult, input, options.feedbackCalibration)
    : baseResult;
  result.profile = profile;
  result.comment = renderMarkdownReport(result);
  return result;
}

export function availableProfiles() {
  return Object.values(PROFILES);
}

export function normalizeInput(rawInput = {}) {
  const files = Array.isArray(rawInput.files) ? rawInput.files : [];
  const additions = numberOrSum(rawInput.additions, files, "additions");
  const deletions = numberOrSum(rawInput.deletions, files, "deletions");
  const changedFiles = Number.isFinite(Number(rawInput.changedFiles))
    ? Number(rawInput.changedFiles)
    : files.length;

  return {
    kind: rawInput.kind || rawInput.type || "pull_request",
    title: String(rawInput.title || ""),
    body: String(rawInput.body || ""),
    authorAssociation: String(rawInput.authorAssociation || rawInput.author_association || ""),
    draft: Boolean(rawInput.draft),
    labels: normalizeLabels(rawInput.labels),
    changedFiles,
    additions,
    deletions,
    files,
    checks: Array.isArray(rawInput.checks) ? rawInput.checks : [],
    commits: normalizeCommits(rawInput.commits),
    profile: String(rawInput.profile || rawInput.reviewProfile || ""),
    contributingText: String(rawInput.contributingText || rawInput.contributing || ""),
    repositoryFiles: normalizeRepositoryFiles(rawInput.repositoryFiles || rawInput.policyFiles),
    repositoryContext: normalizeRepositoryContext(rawInput.repositoryContext || rawInput.repoContext),
    submissionFormat: String(rawInput.submissionFormat || rawInput.format || ""),
    patchSeries: rawInput.patchSeries || null,
    htmlUrl: rawInput.htmlUrl || rawInput.html_url || "",
    repository: rawInput.repository || null,
    number: rawInput.number || rawInput.issue_number || null
  };
}

export function evaluatePullRequest(input, options = {}) {
  const profile = options.profile || resolveProfile(input, options);
  const checks = [];
  const labels = new Set();
  const repairSteps = [];
  const strengths = [];
  const metrics = collectMetrics(input);
  const body = input.body.trim();
  const title = input.title.trim();
  const suspiciousPathFindings = findSuspiciousPaths(input.files);
  const docsOnly = suspiciousPathFindings.length === 0 && input.files.length > 0 && input.files.every((file) => isDocFile(file.filename));
  const testFiles = input.files.filter((file) => isTestFile(file.filename));
  const hasNegatedVerification = SIGNALS.negatedVerification.test(body);
  const hasTestMention = SIGNALS.testMention.test(body) && !hasNegatedVerification;
  const hasNoTestsReason = SIGNALS.noTestsReason.test(body) && !hasNegatedVerification && (docsOnly || SIGNALS.supportedNoTestsReason.test(body));
  const hasIssueLink = SIGNALS.issueLink.test(body);
  const totalLines = input.additions + input.deletions;
  const secretFindings = findSecrets(input);
  const generatedFileFindings = findGeneratedFileRisks(input.files);
  const promptInjection = SIGNALS.promptInjection.test(aggregateContributionText(input));
  const policyProfile = buildPolicyProfile(input);
  const repositoryTriage = analyzeRepositoryContext(input);
  const signedOff = hasHumanSignedOff(aggregateContributionText(input));

  addCheck(checks, labels, {
    id: "title",
    title: "Clear title",
    status: titleIsClear(title) ? "pass" : "fail",
    label: "needs-clear-summary",
    penalty: 10,
    reason: titleIsClear(title)
      ? "The title names a specific change."
      : "The title is too vague for triage."
  });

  addCheck(checks, labels, {
    id: "body",
    title: "Review narrative",
    status: body.length >= 160 ? "pass" : body.length >= 80 ? "warn" : "fail",
    label: "needs-context",
    penalty: body.length >= 80 ? 6 : 14,
    reason: body.length >= 160
      ? "The description gives enough context for first-pass review."
      : "The description needs a clearer problem, change summary, and risk note."
  });

  addCheck(checks, labels, {
    id: "scope",
    title: "Reviewable scope",
    status: input.changedFiles > 25 || totalLines > 1200 ? "fail" : input.changedFiles > 10 || totalLines > 600 ? "warn" : "pass",
    label: "too-broad",
    penalty: input.changedFiles > 25 || totalLines > 1200 ? 24 : 10,
    blocking: input.changedFiles > 25 || totalLines > 1200,
    reason: `Touches ${input.changedFiles} file(s) with ${totalLines} changed line(s).`
  });

  addCheck(checks, labels, {
    id: "path-safety",
    title: "Repository path safety",
    status: suspiciousPathFindings.length > 0 ? "fail" : "pass",
    label: "suspicious-path",
    penalty: 30,
    blocking: suspiciousPathFindings.length > 0,
    reason: suspiciousPathFindings.length > 0
      ? `Found suspicious repository path(s): ${suspiciousPathFindings.slice(0, 3).join(", ")}.`
      : "Changed paths look like normal repository-relative paths."
  });

  addCheck(checks, labels, {
    id: "tests",
    title: "Tests or test rationale",
    status: docsOnly || testFiles.length > 0 || hasTestMention || hasNoTestsReason ? "pass" : "fail",
    label: "needs-tests",
    penalty: 18,
    reason: docsOnly
      ? "Documentation-only change."
      : testFiles.length > 0
        ? `Includes ${testFiles.length} test file(s).`
        : hasTestMention
          ? "Body includes a test or verification command."
          : hasNoTestsReason
            ? "Body includes an explicit no-test rationale."
            : "No test file, test command, or explicit no-test rationale found."
  });

  addCheck(checks, labels, {
    id: "negated-verification",
    title: "No contradicted verification claims",
    status: hasNegatedVerification ? "fail" : "pass",
    label: "needs-human-verification",
    penalty: 14,
    reason: hasNegatedVerification
      ? "The submission mentions verification language while saying the work was not actually run or checked."
      : "Verification language is not contradicted by a no-run statement."
  });

  addCheck(checks, labels, {
    id: "verification",
    title: "Before/after evidence",
    status: hasTestMention && (SIGNALS.repro.test(body) || SIGNALS.issueLink.test(body)) ? "pass" : hasTestMention || SIGNALS.repro.test(body) ? "warn" : "fail",
    label: "needs-human-verification",
    penalty: hasTestMention || SIGNALS.repro.test(body) ? 8 : 16,
    reason: hasTestMention && (SIGNALS.repro.test(body) || SIGNALS.issueLink.test(body))
      ? "Includes verification tied to an issue, reproducer, or before/after behavior."
      : "Maintainers need a reproducible reason to believe the change works."
  });

  const policyRequirements = evaluatePolicyRequirements({
    input,
    body,
    docsOnly,
    testFiles,
    policyProfile,
    hasTestMention,
    hasNoTestsReason,
    hasIssueLink,
    signedOff
  });
  addCheck(checks, labels, {
    id: "policy",
    title: "Repository policy fit",
    status: policyRequirements.status,
    label: "policy-failed",
    penalty: policyRequirements.status === "warn" ? 8 : 14,
    reason: policyRequirements.reason
  });

  const projectTestCommand = evaluateProjectTestCommand({
    body,
    policyProfile,
    hasTestMention,
    hasNoTestsReason,
    docsOnly
  });
  addCheck(checks, labels, {
    id: "project-test-command",
    title: "Discovered project test command",
    status: projectTestCommand.status,
    label: "needs-project-test-command",
    penalty: projectTestCommand.status === "fail" ? 12 : 7,
    reason: projectTestCommand.reason
  });

  addCheck(checks, labels, {
    id: "repository-context",
    title: "Repository duplicate, concurrent, and upstream context",
    status: repositoryTriage.checkStatus,
    label: repositoryTriage.labels[0],
    labels: repositoryTriage.labels,
    penalty: repositoryTriage.checkStatus === "fail" ? 18 : repositoryTriage.checkStatus === "warn" ? 10 : 0,
    reason: repositoryTriage.summary
  });

  const patchLocalVerification = input.submissionFormat === "patch_series" && hasTestMention;
  const ciSignal = classifyCiSignal(input.checks);
  addCheck(checks, labels, {
    id: "ci",
    title: "CI signal",
    status: patchLocalVerification || ciSignal.status === "pass" ? "pass" : ciSignal.status === "fail" ? "fail" : "warn",
    label: ciSignal.status === "fail" ? "ci-failed" : "ci-missing",
    penalty: ciSignal.status === "fail" ? 18 : 7,
    reason: patchLocalVerification
      ? "Plain-text patch submission includes local verification evidence in place of GitHub CI."
      : ciSignal.reason
  });

  const dependencyRisk = hasDependencyChange(input.files) && !SIGNALS.dependencyJustification.test(body);
  addCheck(checks, labels, {
    id: "dependencies",
    title: "Dependency and generated-file discipline",
    status: dependencyRisk ? "warn" : "pass",
    label: "dependency-review",
    penalty: 8,
    reason: dependencyRisk
      ? "Dependency or lockfile changes need an explicit reason."
      : "No unexplained dependency or generated-file churn found."
  });

  const unexplainedGeneratedFiles = generatedFileFindings.filter(() => !SIGNALS.generatedJustification.test(body));
  addCheck(checks, labels, {
    id: "generated-artifacts",
    title: "Generated artifact discipline",
    status: unexplainedGeneratedFiles.length > 0 ? "warn" : "pass",
    label: "generated-artifact-review",
    penalty: 10,
    reason: unexplainedGeneratedFiles.length > 0
      ? `Generated or bundled artifact path(s) need a reviewable source/rationale: ${unexplainedGeneratedFiles.slice(0, 3).join(", ")}.`
      : "No unexplained generated, bundled, or minified artifact churn found."
  });

  addCheck(checks, labels, {
    id: "secrets",
    title: "Obvious secret leakage",
    status: secretFindings.length > 0 ? "fail" : "pass",
    label: "secrets-risk",
    penalty: 40,
    blocking: secretFindings.length > 0,
    reason: secretFindings.length > 0
      ? `Found ${secretFindings.length} obvious secret-like string(s).`
      : "No obvious token/private-key patterns found in supplied text."
  });

  addCheck(checks, labels, {
    id: "prompt-injection",
    title: "Prompt-injection and review-bypass language",
    status: promptInjection ? "fail" : "pass",
    label: "prompt-injection-risk",
    penalty: 20,
    blocking: promptInjection,
    reason: promptInjection
      ? "Submission contains instruction-hijacking or review-bypass language that should be quarantined before automation uses it."
      : "No obvious instruction-hijacking or review-bypass language found."
  });

  addCheck(checks, labels, {
    id: "draft",
    title: "Ready for review state",
    status: input.draft ? "fail" : "pass",
    label: "draft-pr",
    penalty: 10,
    reason: input.draft ? "Draft PRs should not consume maintainer review time yet." : "PR is not marked draft."
  });

  const firstTimer = /FIRST_TIME|NONE/i.test(input.authorAssociation);
  const aiWithoutVerification = SIGNALS.aiDisclosure.test(body) && !SIGNALS.humanAccountability.test(body);
  addCheck(checks, labels, {
    id: "accountability",
    title: "Contributor accountability",
    status: aiWithoutVerification ? "fail" : firstTimer && (input.changedFiles > 10 || testFiles.length === 0) ? "warn" : "pass",
    label: aiWithoutVerification ? "needs-human-verification" : "maintainer-attention-risk",
    penalty: aiWithoutVerification ? 18 : 6,
    reason: aiWithoutVerification
      ? "AI/tool disclosure without human testing or understanding creates review risk."
      : firstTimer
        ? "First-time contributor with elevated review burden."
        : "Contributor context does not add extra review burden."
  });

  if (profile.id === "kernel-grade") {
    addKernelGradePullRequestChecks({ checks, labels, input, body, title, totalLines, firstTimer, hasTestMention, policyProfile });
  }

  const score = scoreChecks(checks);
  const status = classify(score, checks);
  const blockers = checks.filter((check) => check.status === "fail" && check.blocking);
  const failing = checks.filter((check) => check.status === "fail");
  const warning = checks.filter((check) => check.status === "warn");
  const reviewBudget = estimateReviewBudget(input, checks, profile.id);
  const provenance = analyzeProvenance(input);

  for (const check of [...blockers, ...failing, ...warning]) {
    if (check.repair) repairSteps.push(check.repair);
  }
  if (!repairSteps.length && status === "ready-for-maintainer") {
    repairSteps.push("No repair required before maintainer review.");
  }

  if (SIGNALS.issueLink.test(body)) strengths.push("Links the change to an issue.");
  if (testFiles.length > 0 || SIGNALS.testMention.test(body)) strengths.push("Includes a test or verification signal.");
  if (input.changedFiles <= 5 && totalLines <= 300) strengths.push("Keeps the diff small enough for focused review.");

  addStatusLabel(labels, status);

  return {
    kind: "pull_request",
    submissionFormat: input.submissionFormat || "github",
    status,
    score,
    labels: [...labels],
    summary: summarize(status, score, "pull request", blockers, failing, warning, reviewBudget),
    strengths,
    blockers: blockers.map(publicCheck),
    repairSteps: repairSteps.length ? unique(repairSteps) : defaultRepairSteps("pull request", failing, warning),
    checks: checks.map(publicCheck),
    metrics,
    reviewBudget,
    provenance,
    policyProfile: publicPolicyProfile(policyProfile),
    repositoryContext: publicRepositoryContext(repositoryTriage),
    patchSeries: input.patchSeries || null,
    secretFindings
  };
}

export function evaluateIssue(input, options = {}) {
  const profile = options.profile || resolveProfile(input, options);
  const checks = [];
  const labels = new Set();
  const repairSteps = [];
  const strengths = [];
  const body = input.body.trim();
  const title = input.title.trim();
  const securityClaim = SIGNALS.securityClaim.test(`${title}\n${body}`);
  const aiWithoutEvidence = SIGNALS.aiReportClaim.test(body) && !SIGNALS.logs.test(body) && !SIGNALS.repro.test(body);
  const wrongRepository = detectWrongRepositoryIssue(input, { title, body });
  const secretFindings = findSecrets(input);
  const promptInjection = SIGNALS.promptInjection.test(aggregateContributionText(input));
  const policyProfile = buildPolicyProfile(input);
  const repositoryTriage = analyzeRepositoryContext(input);
  const issueEvidence = analyzeIssueEvidence(input, { title, body });
  const maintainerTriage = analyzeMaintainerTriage(input.labels, input.authorAssociation);
  const featureRequest = issueEvidence.featureRequestIntent && !issueEvidence.deviceSupportIntent && !securityClaim;
  const repositoryContextCleared = repositoryTriage.hasContext && repositoryTriage.checkStatus === "pass";
  const hasReproductionSignal = SIGNALS.repro.test(body) && !issueEvidence.hasUncertainReproduction;
  const hasReproducer = featureRequest
    ? issueEvidence.hasFeatureUseCase
    : hasReproductionSignal || issueEvidence.deviceSupportComplete || issueEvidence.structuredBugReportComplete || issueEvidence.configLogBugReportComplete || issueEvidence.rootCauseCrashEvidence;
  const hasExpectedActual = featureRequest
    ? issueEvidence.hasFeatureSolution
    : issueEvidence.hasBugBehaviorEvidence || issueEvidence.deviceSupportComplete || issueEvidence.structuredBugReportComplete || issueEvidence.configLogBugReportComplete;
  const hasEnvironment = featureRequest || SIGNALS.version.test(body) || issueEvidence.hasDeviceIdentity || issueEvidence.hasStructuredEnvironment;
  const hasLogEvidence = featureRequest || SIGNALS.logs.test(body) || issueEvidence.hasDeviceTelemetry || issueEvidence.structuredBugReportComplete;
  const hasDuplicateSearch = SIGNALS.duplicateSearch.test(body) || repositoryContextCleared;
  const hasTechnicalAnalysis = featureRequest
    ? issueEvidence.featureRequestComplete || issueEvidence.hasFeatureScope
    : SIGNALS.rootCause.test(body) || issueEvidence.deviceSupportComplete || issueEvidence.structuredBugReportComplete;

  addCheck(checks, labels, {
    id: "title",
    title: "Clear title",
    status: titleIsClear(title) ? "pass" : "fail",
    label: "needs-clear-summary",
    penalty: 10,
    reason: titleIsClear(title) ? "The title names the observed problem." : "The title is too vague for triage."
  });

  addCheck(checks, labels, {
    id: "body",
    title: "Issue detail",
    status: body.length >= 220 ? "pass" : body.length >= 120 ? "warn" : "fail",
    label: "needs-context",
    penalty: body.length >= 120 ? 8 : 16,
    reason: "A maintainer needs enough detail to reproduce or classify the report."
  });

  addCheck(checks, labels, {
    id: featureRequest ? "feature-use-case" : "reproducer",
    title: featureRequest ? "Feature use case" : "Minimal reproducer",
    status: hasReproducer ? "pass" : "fail",
    label: featureRequest ? "needs-use-case" : "needs-reproducer",
    penalty: featureRequest ? 18 : 24,
    blocking: !hasReproducer,
    reason: featureRequest && issueEvidence.hasFeatureUseCase
      ? "Feature request describes the user problem, workflow, or use case."
      : featureRequest
        ? "Feature request needs a concrete user problem, workflow, or use case."
        : hasReproductionSignal
      ? "Includes reproduction language."
      : issueEvidence.deviceSupportComplete
        ? "Device-support report includes product identity, local telemetry, and DPS mapping evidence."
        : issueEvidence.structuredBugReportComplete
          ? "Structured bug report includes concrete steps, expected behavior, and environment."
          : issueEvidence.configLogBugReportComplete
            ? "Structured config/log bug report includes environment, component, YAML, and diagnostic output."
            : issueEvidence.rootCauseCrashEvidence
              ? "Crash report includes root-cause analysis and diagnostic stack evidence."
        : "No clear steps to reproduce, expected behavior, or actual behavior found."
  });

  addCheck(checks, labels, {
    id: featureRequest ? "feature-solution" : "expected-actual",
    title: featureRequest ? "Requested behavior" : "Expected and actual behavior",
    status: hasExpectedActual ? "pass" : "warn",
    label: featureRequest ? "needs-feature-solution" : "needs-expected-actual",
    penalty: 8,
    reason: featureRequest && issueEvidence.hasFeatureSolution
      ? "Feature request describes the requested behavior or solution."
      : featureRequest
        ? "Feature request should describe the requested behavior or solution."
        : issueEvidence.hasExplicitExpectedActual
      ? "Expected and actual behavior are present."
      : issueEvidence.hasBugBehaviorEvidence
        ? "Expected behavior and concrete observed failure output are present."
      : issueEvidence.deviceSupportComplete
        ? "Device-support request uses product/DPS evidence instead of a classic expected/actual bug format."
      : issueEvidence.structuredBugReportComplete
        ? "Structured bug template includes observed issue and expected behavior."
        : issueEvidence.configLogBugReportComplete
          ? "Project bug template includes problem, component, config, logs, and environment evidence."
        : "Expected and actual behavior should be explicit."
  });

  addCheck(checks, labels, {
    id: "environment",
    title: "Version or environment",
    status: hasEnvironment ? "pass" : "warn",
    label: "needs-environment",
    penalty: 8,
    reason: featureRequest
      ? "Feature request does not need version or environment details unless it is platform-specific."
      : SIGNALS.version.test(body)
      ? "Includes version, commit, or environment signal."
      : issueEvidence.hasDeviceIdentity
        ? "Includes device product identity that can route a support request."
        : issueEvidence.hasStructuredEnvironment
          ? "Includes environment fields from the issue template."
        : "No version, commit, release, or environment detail found."
  });

  addCheck(checks, labels, {
    id: "logs",
    title: "Logs or concrete error",
    status: hasLogEvidence ? "pass" : "warn",
    label: "needs-logs",
    penalty: 7,
    reason: featureRequest
      ? "Feature request does not need logs or stack traces."
      : SIGNALS.logs.test(body)
      ? "Includes logs, stack trace, or concrete error output."
      : issueEvidence.hasDeviceTelemetry
        ? "Includes device telemetry or DPS output."
        : issueEvidence.structuredBugReportComplete
          ? "Structured bug report gives concrete reproduction and environment; extra logs are not required for initial triage."
        : "No logs or concrete error output supplied."
  });

  addCheck(checks, labels, {
    id: "duplicate-search",
    title: "Duplicate search",
    status: hasDuplicateSearch ? "pass" : "warn",
    label: "duplicate-search-needed",
    penalty: 6,
    reason: SIGNALS.duplicateSearch.test(body)
      ? "Reporter described duplicate/current-main search."
      : repositoryContextCleared
        ? "Repository context was checked and no duplicate, solved, concurrent, or upstream-fixed signal was found."
        : "No duplicate-search or current-main check described."
  });

  addCheck(checks, labels, {
    id: featureRequest ? "feature-scope" : "technical-analysis",
    title: featureRequest ? "Alternatives or acceptance criteria" : "Technical analysis",
    status: hasTechnicalAnalysis ? "pass" : "warn",
    label: featureRequest ? "needs-feature-scope" : "needs-technical-analysis",
    penalty: 5,
    reason: featureRequest && issueEvidence.hasFeatureScope
      ? "Feature request describes alternatives, constraints, or concrete behavior boundaries."
      : featureRequest && issueEvidence.featureRequestComplete
        ? "Feature request has enough use-case and requested behavior detail for maintainer triage."
      : featureRequest
        ? "Feature request would be easier to review with alternatives, constraints, or acceptance criteria."
        : SIGNALS.rootCause.test(body)
      ? "Includes a root-cause hypothesis, patch, or technical analysis."
      : issueEvidence.deviceSupportComplete
        ? "Includes concrete product/DPS mapping evidence that gives maintainers review material."
      : issueEvidence.structuredBugReportComplete
        ? "Structured report narrows the problem enough for initial maintainer triage."
        : "A root-cause hypothesis or patch would reduce maintainer load."
  });

  addCheck(checks, labels, {
    id: "repository-scope",
    title: "Repository scope",
    status: wrongRepository ? "fail" : "pass",
    label: "wrong-repository",
    penalty: 35,
    blocking: wrongRepository,
    reason: wrongRepository
      ? "This looks like a package or dependency issue that the target repository explicitly routes elsewhere."
      : "The issue appears to belong to this repository's scope."
  });

  addCheck(checks, labels, {
    id: "security-claim",
    title: "Security claim discipline",
    status: securityClaim && !SIGNALS.repro.test(body) ? "fail" : "pass",
    label: "security-claim-needs-reproducer",
    penalty: 18,
    blocking: securityClaim && !SIGNALS.repro.test(body),
    reason: securityClaim
      ? "Security reports need reproducible technical evidence before private escalation."
      : "No unsupported security escalation found."
  });

  addCheck(checks, labels, {
    id: "ai-report-evidence",
    title: "Tool-found report evidence",
    status: aiWithoutEvidence ? "fail" : "pass",
    label: "needs-real-evidence",
    penalty: 18,
    reason: aiWithoutEvidence
      ? "Tool-generated claims without logs or reproducer waste maintainer time."
      : "The report is not relying only on tool output."
  });

  addCheck(checks, labels, {
    id: "repository-context",
    title: "Repository duplicate, concurrent, and upstream context",
    status: repositoryTriage.checkStatus,
    label: repositoryTriage.labels[0],
    labels: repositoryTriage.labels,
    penalty: repositoryTriage.checkStatus === "fail" ? 18 : repositoryTriage.checkStatus === "warn" ? 10 : 0,
    reason: repositoryTriage.summary
  });

  addCheck(checks, labels, {
    id: "secrets",
    title: "Obvious secret leakage",
    status: secretFindings.length > 0 ? "fail" : "pass",
    label: "secrets-risk",
    penalty: 40,
    blocking: secretFindings.length > 0,
    reason: secretFindings.length > 0
      ? `Found ${secretFindings.length} obvious secret-like string(s).`
      : "No obvious token/private-key patterns found in supplied text."
  });

  addCheck(checks, labels, {
    id: "prompt-injection",
    title: "Prompt-injection and review-bypass language",
    status: promptInjection ? "fail" : "pass",
    label: "prompt-injection-risk",
    penalty: 20,
    blocking: promptInjection,
    reason: promptInjection
      ? "Issue body contains instruction-hijacking or review-bypass language that should be quarantined before automation uses it."
      : "No obvious instruction-hijacking or review-bypass language found."
  });

  const score = scoreChecks(checks);
  const maintainerTriageDecision = applyIssueMaintainerTriage({
    status: classify(score, checks),
    score,
    checks,
    labels,
    maintainerTriage,
    repositoryTriage
  });
  const status = maintainerTriageDecision.status;
  const blockers = checks.filter((check) => check.status === "fail" && check.blocking);
  const failing = checks.filter((check) => check.status === "fail");
  const warning = checks.filter((check) => check.status === "warn");
  const reviewBudget = estimateReviewBudget(input, checks, profile.id);

  for (const check of [...blockers, ...failing, ...warning]) {
    if (maintainerTriageDecision.suppressSoftRepairs && ISSUE_SOFT_REPAIR_LABELS.has(check.label)) continue;
    if (check.repair) repairSteps.push(check.repair);
  }
  if (SIGNALS.repro.test(body)) strengths.push("Includes reproduction details.");
  if (SIGNALS.version.test(body)) strengths.push("Names version, commit, or environment.");
  if (SIGNALS.logs.test(body)) strengths.push("Includes logs or concrete error output.");
  if (issueEvidence.deviceSupportComplete) strengths.push("Includes device identity, local telemetry, and DPS mapping evidence.");
  if (issueEvidence.structuredBugReportComplete) strengths.push("Completes the bug template with steps, expected behavior, and environment details.");
  if (featureRequest && issueEvidence.hasFeatureUseCase) strengths.push("Describes a concrete feature use case.");
  if (featureRequest && issueEvidence.hasFeatureSolution) strengths.push("Describes the requested feature behavior.");
  if (maintainerTriage.state === "approved") strengths.push("Repository labels indicate this has already been accepted for maintainer attention.");
  if (maintainerTriage.state === "backlog") strengths.push("Repository labels indicate this belongs in the accepted backlog rather than the active review queue.");
  if (maintainerTriage.state === "authored") strengths.push("Issue was opened by a repository collaborator, member, or owner.");
  addStatusLabel(labels, status);

  return {
    kind: "issue",
    submissionFormat: input.submissionFormat || "github",
    status,
    score,
    labels: [...labels],
    summary: summarize(status, score, "issue", blockers, failing, warning, reviewBudget),
    strengths,
    blockers: blockers.map(publicCheck),
    repairSteps: repairSteps.length ? unique(repairSteps) : defaultRepairSteps("issue", failing, warning),
    checks: checks.map(publicCheck),
    metrics: {
      bodyLength: body.length,
      titleLength: title.length
    },
    reviewBudget,
    provenance: analyzeProvenance(input),
    maintainerTriage: publicMaintainerTriage(maintainerTriage),
    policyProfile: publicPolicyProfile(policyProfile),
    repositoryContext: publicRepositoryContext(repositoryTriage),
    patchSeries: null,
    secretFindings
  };
}

function analyzeIssueEvidence(input = {}, { title = "", body = "" } = {}) {
  const labels = normalizeLabels(input.labels || []);
  const labelText = labels.join(" ");
  const text = `${title}\n${body}\n${labelText}`;
  const deviceSupportIntent = /\b(request support|device support|new device|product id|product name|dps information|local dps|device matches)\b/i.test(text);
  const featureRequestIntent = /\[feature\]|\b(feature request|feature description|enhancement|describe the feature|describe the solution|solution you'd like|alternatives you've considered|related to a problem|use case|requesting|add the ability|support for)\b/i.test(text);
  const hasProductId = /###\s*product\s+id\s*\n+\s*[a-z0-9][a-z0-9_-]{5,}/i.test(body)
    || /\bproduct_?id\b[\s:=]+["']?[a-z0-9][a-z0-9_-]{5,}/i.test(body);
  const hasProductName = /###\s*product\s+name\s*\n+\s*[^\n#][^\n]{1,}/i.test(body)
    || /\b(manufacturer|model)\b[\s:]+[^\n]+/i.test(body);
  const hasDeviceTelemetry = /\b(local\s+dps|dps information|device matches)\b/i.test(body)
    && (/```/.test(body) || /[\[{][\s\S]{20,}[\]}]/.test(body) || /^\s*(name|products|entities):\s+/mi.test(body));
  const hasDeviceIdentity = deviceSupportIntent && hasProductId && hasProductName;
  const featureDescription = markdownSection(body, /feature description|describe (?:the )?(?:feature(?:\/enhancement)?|enhancement)|describe the solution|solution you'd like/i);
  const featureWhy = markdownSection(body, /why would this be helpful|why is this helpful|use case|related to a problem|additional information/i);
  const featureFuture = markdownSection(body, /future implementation|current implementation|acceptance criteria|alternatives|additional information/i);
  const hasFeatureUseCase = featureRequestIntent && (
    hasMeaningfulSection(featureWhy) ||
    /\b(use case|workflow|problem|frustrated|current approach|current workflow|currently|need to|want to|so that|because|when i|i expect)\b/i.test(body)
    || /describe the feature you'd like to request/i.test(body)
  );
  const hasFeatureSolution = featureRequestIntent && (
    hasMeaningfulSection(featureDescription) ||
    /\b(describe the solution|solution you'd like|requested behavior|add (?:a|an|the)?|allow(?:s|ing)?|support(?:s|ing)?|setting|should|would like)\b/i.test(body)
  );
  const hasFeatureScope = featureRequestIntent && (
    hasMeaningfulSection(featureFuture, { minLength: 2 }) ||
    /\b(alternatives?|constraints?|acceptance criteria|current approach|workaround|manual|instead|at least|configurable|rate limits?|preserv(?:e|ing|es)|detect conflicts?)\b/i.test(body)
    || /describe alternatives you've considered/i.test(body)
  );
  const configSection = markdownSection(body, /yaml config|configuration|config/i);
  const logsSection = markdownSection(body, /anything in the logs that might be useful for us|logs?|log output|error output/i);
  const componentSection = markdownSection(body, /component causing the issue|component|platform causing the issue/i);
  const hasStructuredConfig = hasMeaningfulSection(configSection);
  const hasStructuredLogs = hasMeaningfulSection(logsSection);
  const hasStructuredComponent = hasMeaningfulSection(componentSection, { minLength: 2 });
  const hasExplicitExpectedActual = SIGNALS.expectedActual.test(body);
  const hasExpectedSignal = /\b(expected|should|should be able|intended|healthy|reachable|worked(?:\s+just\s+fine)?|prior to|previously)\b/i.test(body);
  const hasObservedFailureSignal = /\b(actual|observed|result|results in|failure mode|fails?|failed|error|unable|cannot|can't|does not|doesn't|disconnected|rejects|returns|reports|broken|crash(?:es|ed|-loops?)?|reboots?)\b/i.test(body);
  const hasBugBehaviorEvidence = !featureRequestIntent && (
    hasExplicitExpectedActual
    || (hasExpectedSignal && hasObservedFailureSignal && (SIGNALS.repro.test(body) || SIGNALS.logs.test(body) || SIGNALS.rootCause.test(body)))
    || (SIGNALS.rootCause.test(body) && hasObservedFailureSignal && SIGNALS.logs.test(body))
  );
  const rootCauseCrashEvidence = !featureRequestIntent
    && SIGNALS.rootCause.test(body)
    && SIGNALS.logs.test(body)
    && /\b(?:crash(?:es|ed|-loops?)?|reboots?|panic|null(?:ptr| pointer)?|deref(?:erence)?|backtrace|stack trace)\b/i.test(body);
  const issueDescription = markdownSection(body, /the problem|problem description|describe (?:your|the) issue|describe the bug|what is not working as documented|what happened/i);
  const explicitStepsToReproduce = markdownSection(body, /steps to reproduce(?: (?:the )?(?:issue|behavior)\.?)?|reproduction|how can we reproduce it/i);
  const stepsToReproduce = explicitStepsToReproduce || (hasEmbeddedReproductionSteps(issueDescription) ? issueDescription : "");
  const expectedBehavior = markdownSection(body, /expected behaviou?r|what behaviou?r do you expect|what did you expect to happen|what is the expected behaviou?r/i);
  const hasStructuredIssueDescription = hasMeaningfulSection(issueDescription);
  const hasUncertainReproduction = hasUncertainReproductionSteps(stepsToReproduce);
  const hasStructuredSteps = hasMeaningfulSection(stepsToReproduce) && !hasUncertainReproduction;
  const hasStructuredExpectedBehavior = hasMeaningfulSection(expectedBehavior);
  const structuredEnvironmentSections = [
    markdownSection(body, /device/i),
    markdownSection(body, /android version/i),
    markdownSection(body, /app version/i),
    markdownSection(body, /jellyfin version/i),
    markdownSection(body, /player/i),
    markdownSection(body, /(?:free)?tube version/i),
    markdownSection(body, /operating system version/i),
    markdownSection(body, /installation method/i),
    markdownSection(body, /primary api used/i),
    markdownSection(body, /last known working/i),
    markdownSection(body, /which software versions do you use/i),
    markdownSection(body, /on what device is .+ installed/i),
    markdownSection(body, /audiobookshelf version/i),
    markdownSection(body, /how are you running audiobookshelf/i),
    markdownSection(body, /what os is your audiobookshelf server hosted from/i),
    markdownSection(body, /what browsers are you seeing/i),
    markdownSection(body, /which version of esphome has the issue/i),
    markdownSection(body, /what type of installation are you using/i),
    markdownSection(body, /what platform are you using/i),
    markdownSection(body, /system information/i)
  ];
  const structuredCrashEnvironmentKeys = body.match(/\b(?:APP_NAME|PACKAGE_NAME|VERSION_NAME|VERSION_CODE|SDK_INT|OS_VERSION|RELEASE|MODEL|MANUFACTURER|BRAND|DEVICE)\b/g) || [];
  const hasStructuredEnvironment = structuredEnvironmentSections.some((section) => hasMeaningfulSection(section, { minLength: 2 }))
    || new Set(structuredCrashEnvironmentKeys).size >= 2;
  const structuredBugReportComplete = !featureRequestIntent
    && hasStructuredIssueDescription
    && hasStructuredSteps
    && hasStructuredExpectedBehavior
    && hasStructuredEnvironment;
  const configLogBugReportComplete = !featureRequestIntent
    && hasStructuredIssueDescription
    && hasStructuredEnvironment
    && hasStructuredComponent
    && hasStructuredConfig
    && hasStructuredLogs;
  return {
    deviceSupportIntent,
    hasDeviceIdentity,
    hasDeviceTelemetry,
    deviceSupportComplete: deviceSupportIntent && hasDeviceIdentity && hasDeviceTelemetry,
    featureRequestIntent,
    hasFeatureUseCase,
    hasFeatureSolution,
    hasFeatureScope,
    featureRequestComplete: featureRequestIntent && hasFeatureUseCase && hasFeatureSolution,
    hasExplicitExpectedActual,
    hasBugBehaviorEvidence,
    rootCauseCrashEvidence,
    hasUncertainReproduction,
    hasStructuredEnvironment,
    structuredBugReportComplete,
    configLogBugReportComplete
  };
}

function markdownSection(body = "", headingPattern) {
  const source = headingPattern instanceof RegExp ? headingPattern.source : String(headingPattern);
  const sectionPattern = new RegExp(`^#{2,6}\\s*(?:${source})[?:]?\\s*\\n([\\s\\S]*?)(?=^#{2,6}\\s+|(?![\\s\\S]))`, "im");
  const match = sectionPattern.exec(body);
  return match ? match[1].trim() : "";
}

function hasUncertainReproductionSteps(section = "") {
  const text = String(section || "");
  return /\b(?:idk|i don't know|i do not know|not sure|unsure|no idea)\s+(?:how\s+)?to\s+reproduce\b/i.test(text)
    || /\b(?:can't|cannot|can not)\s+reproduce\b/i.test(text)
    || /\bhard to reproduce\b/i.test(text)
    || /^\s*(?:unknown|not sure|unsure|n\/a|no idea)\s*$/im.test(text)
    || /\bsteps?\s+(?:are|is)\s+(?:unknown|unclear)\b/i.test(text);
}

function detectWrongRepositoryIssue(input = {}, { title = "", body = "" } = {}) {
  const repository = String(input.repository || input.repositoryContext?.repository || "").toLowerCase();
  if (repository !== "termux/termux-app") return false;
  const text = `${title}\n${body}`;
  const packageInstallSignal = /\b(?:pip|pkg|apt|npm|gem|cargo)\s+install\b/i.test(text)
    || /\b(?:install(?:ing|ation)?|build(?:ing)?)\s+(?:fails?|failed|error|crash(?:es)?|cannot|can't)\b/i.test(text)
    || /\b(?:package|dependency|wheel|cryptography|maturin|rust crate|repository errors?)\b/i.test(text);
  const appScopeSignal = /\b(?:terminal session|extra-keys|keyboard|paste|termux crashes?|crash(?:es|ing)? termux|termuxactivity|bytequeue|terminalemulator)\b/i.test(text);
  return packageInstallSignal && !appScopeSignal;
}

function hasMeaningfulSection(section = "", { minLength = 8 } = {}) {
  const cleaned = String(section)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\b(?:_?no response_?|n\/a|none|null|not applicable)\b/gi, "")
    .trim();
  return cleaned.length >= minLength && /[a-z0-9]/i.test(cleaned);
}

function hasEmbeddedReproductionSteps(section = "") {
  const numberedSteps = String(section).match(/^\s*\d+\.\s+\S.+$/gm) || [];
  return numberedSteps.length >= 2;
}

function analyzeMaintainerTriage(labels = [], authorAssociation = "") {
  const normalized = normalizeLabels(labels).map((label) => label.trim()).filter(Boolean);
  const labelText = normalized.join(" ");
  const backlog = /\b(?:status[/: -]?)?(?:icebox|backlog|deferred|later|someday|parking lot)\b/i.test(labelText);
  const pendingClarification = /\b(?:status[/: -]?)?(?:pending[ _-]?clarification|needs?[ _-]?info|waiting[ _-]?for[ _-]?(?:reporter|response|author)|more[ _-]?info|stale)\b/i.test(labelText);
  const approved = /\b(?:status[/: -]?)?(?:approved|accepted|confirmed|reproduced|ready[ _-]?(?:for[ _-]?)?(?:implementation|review)?)\b/i.test(labelText);
  const authored = isMaintainerAuthorAssociation(authorAssociation);

  if (pendingClarification) {
    return {
      state: "pending-clarification",
      label: "maintainer-pending-clarification",
      summary: "Repository labels say maintainer clarification is already pending."
    };
  }
  if (backlog) {
    return {
      state: "backlog",
      label: "maintainer-backlog",
      summary: "Repository labels place this item in an accepted backlog or icebox."
    };
  }
  if (approved) {
    return {
      state: "approved",
      label: "maintainer-approved",
      summary: "Repository labels say this item is approved or accepted for maintainer attention."
    };
  }
  if (authored) {
    return {
      state: "authored",
      label: "maintainer-authored",
      summary: "Issue author is a repository collaborator, member, or owner."
    };
  }
  return {
    state: "none",
    label: "",
    summary: "No explicit maintainer triage label detected."
  };
}

function applyIssueMaintainerTriage({ status, score, checks, labels, maintainerTriage, repositoryTriage }) {
  if (!maintainerTriage || maintainerTriage.state === "none") {
    return {
      status,
      suppressSoftRepairs: false
    };
  }

  const hasHardRisk = checks.some((check) => check.status === "fail" && ISSUE_HARD_RISK_LABELS.has(check.label));
  const contextFindings = repositoryTriage?.findings?.length || 0;
  const contextConflict = repositoryTriage?.hasContext && repositoryTriage.checkStatus !== "pass" && contextFindings > 0;
  labels.add(maintainerTriage.label);

  if (maintainerTriage.state === "pending-clarification") {
    return {
      status: status === "ready-for-maintainer" ? "needs-repair" : status,
      suppressSoftRepairs: false
    };
  }

  if (maintainerTriage.state === "backlog" && !hasHardRisk) {
    clearIssueSoftRepairLabels(labels);
    return {
      status: "low-review-value",
      suppressSoftRepairs: true
    };
  }

  if (maintainerTriage.state === "approved" && score >= 60 && !hasHardRisk && !contextConflict) {
    clearIssueSoftRepairLabels(labels);
    return {
      status: "ready-for-maintainer",
      suppressSoftRepairs: true
    };
  }

  if (maintainerTriage.state === "authored" && score >= 40 && !hasHardRisk && !contextConflict) {
    clearIssueSoftRepairLabels(labels);
    return {
      status: "ready-for-maintainer",
      suppressSoftRepairs: true
    };
  }

  return {
    status,
    suppressSoftRepairs: false
  };
}

function isMaintainerAuthorAssociation(authorAssociation = "") {
  return /^(OWNER|MEMBER|COLLABORATOR)$/i.test(String(authorAssociation || ""));
}

function clearIssueSoftRepairLabels(labels) {
  for (const label of ISSUE_SOFT_REPAIR_LABELS) labels.delete(label);
}

function publicMaintainerTriage(maintainerTriage) {
  if (!maintainerTriage || maintainerTriage.state === "none") {
    return {
      state: "none",
      summary: "No explicit maintainer triage label detected."
    };
  }
  return {
    state: maintainerTriage.state,
    label: maintainerTriage.label,
    summary: maintainerTriage.summary
  };
}

export function renderMarkdownReport(result) {
  const statusLine = `**Status:** ${result.status} (${result.score}/100)`;
  const profileLine = `**Profile:** ${result.profile?.name || "Standard Maintainer"}`;
  const budgetLine = result.reviewBudget
    ? `**Review budget:** ${result.reviewBudget.level} (${result.reviewBudget.minutes} min est.)`
    : "";
  const provenanceLine = result.provenance
    ? `**Provenance:** ${result.provenance.summary}`
    : "";
  const policyLine = result.policyProfile?.hasPolicy
    ? `**Policy sources:** ${result.policyProfile.summary}`
    : "**Policy sources:** none supplied";
  const repositoryContextLine = result.repositoryContext?.hasContext
    ? `**Repository context:** ${result.repositoryContext.summary}`
    : "**Repository context:** none supplied";
  const maintainerTriageLine = result.maintainerTriage?.state && result.maintainerTriage.state !== "none"
    ? `**Maintainer triage:** ${result.maintainerTriage.summary}`
    : "";
  const calibrationLine = result.calibration?.active
    ? `**Feedback calibration:** ${result.calibration.summary}`
    : "";
  const seriesLine = result.patchSeries
    ? `**Patch series:** ${result.patchSeries.patchCount} patch(es), ${result.patchSeries.messageCount} message(s), cover=${result.patchSeries.coverLetter ? "yes" : "no"}`
    : "";
  const repositoryContextDetails = renderRepositoryContext(result.repositoryContext);
  const calibrationDetails = renderFeedbackCalibration(result.calibration);
  const labelsLine = result.labels.length ? `**Labels:** ${result.labels.map((label) => `\`${label}\``).join(", ")}` : "**Labels:** none";
  const blockers = result.blockers.length
    ? result.blockers.map((check) => `- ${check.title}: ${check.reason}`).join("\n")
    : "- None.";
  const repairs = result.repairSteps.length
    ? result.repairSteps.map((step) => `- ${step}`).join("\n")
    : "- No repair steps.";
  const checkLines = result.checks
    .map((check) => `- ${STATUS_COPY[check.status]}: ${check.title} - ${check.reason}`)
    .join("\n");

  const lines = [
    "## Premature Contribution Firewall Review Readiness",
    "",
    profileLine,
    statusLine,
    budgetLine,
    provenanceLine,
    policyLine,
    repositoryContextLine,
    maintainerTriageLine,
    calibrationLine,
    seriesLine,
    labelsLine,
    "",
    result.summary,
    "",
    "### Blockers",
    blockers,
    "",
    "### Repair Checklist",
    repairs,
    "",
    "### Repository Context",
    repositoryContextDetails,
  ];

  if (result.calibration?.active) {
    lines.push(
      "",
      "### Feedback Calibration",
      calibrationDetails
    );
  }

  lines.push(
    "",
    "### Checks",
    checkLines,
    "",
    "<!-- premature-contribution-firewall-review -->"
  );

  return lines.filter((line, index, list) => line || list[index - 1] !== "").join("\n");
}

function addCheck(checks, labels, check) {
  const repair = repairFor(check);
  const normalized = {
    blocking: false,
    penalty: check.status === "pass" ? 0 : check.penalty || 0,
    ...check,
    repair
  };
  checks.push(normalized);
  if (normalized.status !== "pass" && normalized.label) labels.add(normalized.label);
  for (const label of normalized.labels || []) {
    if (normalized.status !== "pass" && label) labels.add(label);
  }
}

function repairFor(check) {
  const map = {
    "needs-clear-summary": "Replace the vague title with the specific behavior or subsystem being changed.",
    "needs-context": "Add a concise problem statement, change summary, and risk/impact note.",
    "too-broad": "Split unrelated work into a smaller PR that a maintainer can review in one focused pass.",
    "suspicious-path": "Use normal repository-relative paths only; remove traversal, absolute, URL, or control-character path material.",
    "needs-tests": "Add a test, run an existing test command, or explain why testing is not applicable.",
    "needs-human-verification": "Add the exact verification you personally ran, including before/after evidence where possible.",
    "possibly-duplicate": "Check the listed similar issue before asking maintainers to triage this as new work.",
    "possibly-solved": "Confirm the listed closed or solved issue does not already resolve this submission.",
    "linked-issue-closed": "Explain why the linked issue is still relevant even though repository context says it is closed.",
    "concurrent-work": "Coordinate with the listed active pull request before requesting maintainer review.",
    "possibly-upstream-fixed": "Check the listed upstream fix or release and state whether this still reproduces on current upstream.",
    "repo-context-unavailable": "Retry repository context collection or include a repositoryContext payload before relying on duplicate/upstream checks.",
    "policy-failed": "Update the submission to satisfy the repository contribution policy.",
    "ci-missing": "Run the repository checks locally or wait for CI before requesting maintainer review.",
    "ci-failed": "Fix failing CI before requesting maintainer review.",
    "dependency-review": "Explain why dependency or lockfile changes are necessary.",
    "generated-artifact-review": "Explain why generated, bundled, vendored, or minified artifacts are included and point to their source.",
    "secrets-risk": "Remove leaked secret-like material and rotate the exposed credential before resubmitting.",
    "prompt-injection-risk": "Remove instruction-hijacking or review-bypass text before routing the submission through automated maintainer tooling.",
    "draft-pr": "Mark the PR ready only after the repair checklist is complete.",
    "maintainer-attention-risk": "Reduce reviewer burden with tests, a smaller diff, and clear ownership of the change.",
    "needs-reproducer": "Add minimal steps to reproduce, expected behavior, and actual behavior.",
    "needs-use-case": "Describe the user problem, workflow, or use case the feature would solve.",
    "needs-feature-solution": "Describe the requested behavior or solution clearly enough to evaluate.",
    "needs-feature-scope": "Add alternatives, constraints, acceptance criteria, or concrete behavior boundaries.",
    "needs-expected-actual": "Spell out expected behavior and actual behavior in separate lines.",
    "needs-environment": "Add version, commit, OS/runtime, or environment details.",
    "needs-logs": "Attach the exact error output, stack trace, or relevant logs.",
    "duplicate-search-needed": "Search existing issues and current main, then state what you found.",
    "needs-technical-analysis": "Add a root-cause hypothesis, narrowed file/function, or proposed patch.",
    "wrong-repository": "Move this to the repository named by the target project's issue template or explain why it belongs here.",
    "security-claim-needs-reproducer": "Provide a verified reproducer and technical evidence for the security claim.",
    "needs-real-evidence": "Replace tool-only claims with reproducible evidence from a real run.",
    "needs-project-test-command": "Run the discovered project test command or explain why that exact command is not applicable.",
    "kernel-subject-discipline": "Use a concise subsystem-prefixed patch subject under 75 characters that describes the change and why it matters.",
    "needs-dco-signoff": "Add a human Signed-off-by line and make sure the submitter can certify the Developer Certificate of Origin.",
    "needs-patch-rationale": "Explain the specific problem, how it is reached, the user-visible effect, and why this fix is correct.",
    "needs-fixes-tag": "For a bug fix, add a proper Fixes: tag with a 12+ character commit id and quoted subject.",
    "stable-discipline-failed": "Only request stable handling for small, tested, obviously correct bug fixes with proper Fixes/stable metadata.",
    "needs-maintainer-targeting": "Show maintainer/list targeting evidence such as get_maintainer output, Cc lines, subsystem lists, or Reviewed-by/Acked-by tags.",
    "needs-kernel-build-evidence": "Add concrete build/style/runtime evidence such as allmodconfig/allnoconfig/defconfig, checkpatch, sparse, smatch, KUnit, kselftest, boot, or a clear runtime-test limitation.",
    "needs-tool-provenance": "Disclose meaningful tool-generated content with Assisted-by/tool details and human verification.",
    "needs-series-split": "Split the work into a reviewable patch series or explain the cover-letter structure.",
    "review-budget-high": "Reduce the maintainer review budget with a smaller diff, clearer scope, better tests, or prior review.",
    "drive-by-risk": "Get pre-review or subsystem-owner feedback before sending a broad first-time contribution to busy maintainers."
  };
  return map[check.label] || "";
}

function scoreChecks(checks) {
  const penalty = checks.reduce((sum, check) => sum + (check.status === "pass" ? 0 : check.penalty || 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function addKernelGradePullRequestChecks({ checks, labels, input, body, title, totalLines, firstTimer, hasTestMention, policyProfile }) {
  const text = aggregateContributionText(input);
  const subject = normalizePatchSubject(title);
  const subjectDisciplined = subject.length > 0
    && subject.length <= 75
    && /^[a-z0-9][\w+./-]*:\s+\S/i.test(subject)
    && !/\b(ai|chatgpt|claude|copilot|llm|generated|tool)\b/i.test(subject);
  const signedOff = hasHumanSignedOff(text);
  const toolGenerated = hasMeaningfulToolGeneration(text);
  const assistedBy = /^Assisted-by:\s*[^:\n]+:[^\s\n]+(?:\s+\[[^\]]+\])*/mi.test(text);
  const fixesTag = /^Fixes:\s*[0-9a-f]{12,40}\s+\("[^"]+"\)/mi.test(text);
  const bugfix = /\b(fix(?:es|ed)?|bug|regression|oops|panic|null|race|leak|crash|hang|corruption|build failure|security|Fixes:)\b/i.test(text);
  const stableRequest = /\b(stable@(?:vger\.)?kernel\.org|stable@vger\.kernel\.org|Cc:\s*stable|-stable\b|stable tree)\b/im.test(text);
  const textMaintainerTargeting = /^(Cc|Reviewed-by|Acked-by|Reported-by|Link):\s+.+$/mi.test(text)
    || /\b(get_maintainer\.pl|MAINTAINERS|linux-[\w.-]+@vger\.kernel\.org|lore\.kernel\.org)\b/i.test(text);
  const policyMaintainerTargeting = Boolean(policyProfile?.ownerMatches?.length || policyProfile?.maintainerMatches?.length);
  const maintainerTargeting = textMaintainerTargeting || policyMaintainerTargeting;
  const problemEvidence = /\b(problem|bug|regression|root cause|cause|because|oops|panic|null|data corruption|race|hang|build failure|security|leak)\b/i.test(text);
  const reachabilityEvidence = /\b(reproduce|reached|trigger|path|when|if|on a running system|steps|call chain|backtrace|reported)\b/i.test(text);
  const effectEvidence = /\b(effect|impact|results?|would|can|user-visible|panic|oops|leak|crash|hang|corruption|warning|failure)\b/i.test(text);
  const correctnessEvidence = /\b(correct|safe|because|only place|no other references|prevents|avoids|fixes|verified|tested)\b/i.test(text);
  const buildEvidence = /\b(make\s+\S*(allmodconfig|allnoconfig|defconfig|oldconfig|htmldocs|pdfdocs)|allmodconfig|allnoconfig|defconfig|O=|build tested|gcc|clang|x86_64|arm64|ppc64)\b/i.test(text);
  const styleEvidence = /\b(checkpatch|scripts\/checkpatch\.pl|sparse|smatch|coccinelle|clang-tidy|C=1)\b/i.test(text);
  const runtimeEvidence = /\b(runtime|run-time|boot tested|reproduced|syzkaller|kselftest|kunit|selftests|no runtime testing|not runtime tested|hardware unavailable)\b/i.test(text);
  const seriesNeeded = input.changedFiles > 5 || totalLines > 300;
  const seriesSignal = /\[PATCH[^\]]*\b[0-9]+\/[0-9]+\]|\bcover letter\b|\bpatch series\b|\b[0-9]+\/[0-9]+\b/i.test(text);
  const budget = estimateReviewBudget(input, checks, "kernel-grade");

  addCheck(checks, labels, {
    id: "kernel-subject",
    title: "Kernel-grade patch subject",
    status: subjectDisciplined ? "pass" : "fail",
    label: "kernel-subject-discipline",
    penalty: 12,
    reason: subjectDisciplined
      ? `Subject is subsystem-prefixed and ${subject.length} characters after patch tags.`
      : "Subject should be subsystem-prefixed, under 75 characters, and describe the patch rather than the tool."
  });

  addCheck(checks, labels, {
    id: "dco-signoff",
    title: "Human DCO sign-off",
    status: signedOff ? "pass" : "fail",
    label: "needs-dco-signoff",
    penalty: 22,
    blocking: !signedOff,
    reason: signedOff
      ? "A human Signed-off-by line is present."
      : "Kernel-grade submissions need a human Signed-off-by line."
  });

  addCheck(checks, labels, {
    id: "patch-rationale",
    title: "Problem, reachability, effect, and correctness",
    status: problemEvidence && reachabilityEvidence && effectEvidence && correctnessEvidence ? "pass" : "fail",
    label: "needs-patch-rationale",
    penalty: 18,
    reason: problemEvidence && reachabilityEvidence && effectEvidence && correctnessEvidence
      ? "Commit text explains the problem, how it is reached, impact, and why the fix is correct."
      : "Commit text must explain the concrete problem, how it is reached, the effect, and why the fix is correct."
  });

  addCheck(checks, labels, {
    id: "fixes-tag",
    title: "Fixes tag discipline",
    status: !bugfix || fixesTag ? "pass" : "warn",
    label: "needs-fixes-tag",
    penalty: 9,
    reason: !bugfix
      ? "No bug-fix signal requiring a Fixes tag was detected."
      : fixesTag
        ? "Bug-fix metadata includes a well-formed Fixes tag."
        : "Bug-fix-like work should include a proper Fixes tag when a prior commit is known."
  });

  addCheck(checks, labels, {
    id: "stable-discipline",
    title: "Stable-tree discipline",
    status: !stableRequest ? "pass" : stableRequest && fixesTag && totalLines <= 100 && hasTestMention ? "pass" : "fail",
    label: "stable-discipline-failed",
    penalty: 16,
    blocking: stableRequest && totalLines > 100,
    reason: !stableRequest
      ? "No stable-tree handling requested."
      : stableRequest && fixesTag && totalLines <= 100 && hasTestMention
        ? "Stable request is small, tested, and tied to a Fixes tag."
        : "Stable requests should be small, tested, obviously correct bug fixes with Fixes/stable metadata."
  });

  addCheck(checks, labels, {
    id: "maintainer-targeting",
    title: "Maintainer and list targeting",
    status: maintainerTargeting ? "pass" : "warn",
    label: "needs-maintainer-targeting",
    penalty: 8,
    reason: maintainerTargeting
      ? policyMaintainerTargeting && !textMaintainerTargeting
        ? "Repository policy maps touched files to owners or maintainers."
        : "Submission shows maintainer/list/review routing evidence."
      : "Show get_maintainer, Cc, subsystem list, Link, Reviewed-by, or Acked-by routing evidence."
  });

  addCheck(checks, labels, {
    id: "kernel-build-evidence",
    title: "Kernel-grade build and analysis evidence",
    status: buildEvidence && (styleEvidence || runtimeEvidence) ? "pass" : buildEvidence || styleEvidence || runtimeEvidence ? "warn" : "fail",
    label: "needs-kernel-build-evidence",
    penalty: buildEvidence || styleEvidence || runtimeEvidence ? 9 : 20,
    reason: buildEvidence && (styleEvidence || runtimeEvidence)
      ? "Build evidence is paired with style/static/runtime evidence."
      : "Kernel-grade review needs concrete build plus style/static/runtime evidence or an explicit limitation."
  });

  addCheck(checks, labels, {
    id: "tool-provenance",
    title: "Tool-generated content transparency",
    status: !toolGenerated ? "pass" : toolGenerated && assistedBy && signedOff && hasTestMention ? "pass" : toolGenerated && assistedBy && signedOff ? "warn" : "fail",
    label: "needs-tool-provenance",
    penalty: toolGenerated && assistedBy && signedOff ? 8 : 18,
    reason: !toolGenerated
      ? "No meaningful tool-generated content signal detected."
      : toolGenerated && assistedBy && signedOff && hasTestMention
        ? "Tool use is disclosed with Assisted-by, human sign-off, and verification."
        : "Meaningful tool-generated content needs Assisted-by/tool details, human sign-off, and verification."
  });

  addCheck(checks, labels, {
    id: "patch-series-discipline",
    title: "Patch series discipline",
    status: !seriesNeeded || seriesSignal ? "pass" : "warn",
    label: "needs-series-split",
    penalty: 9,
    reason: !seriesNeeded
      ? "Diff is small enough to review as one patch."
      : seriesSignal
        ? "Large work includes patch-series or cover-letter structure."
        : "Large work should be split into a numbered patch series or explained in a cover letter."
  });

  addCheck(checks, labels, {
    id: "review-budget",
    title: "Maintainer review budget",
    status: budget.minutes > 90 ? "fail" : budget.minutes > 45 ? "warn" : "pass",
    label: "review-budget-high",
    penalty: budget.minutes > 90 ? 18 : 9,
    blocking: budget.minutes > 120,
    reason: `Estimated maintainer review budget is ${budget.minutes} minutes (${budget.level}).`
  });

  addCheck(checks, labels, {
    id: "drive-by-risk",
    title: "Drive-by contribution risk",
    status: firstTimer && !maintainerTargeting && !/^Reviewed-by:\s+.+$/mi.test(text) ? "warn" : "pass",
    label: "drive-by-risk",
    penalty: 8,
    reason: firstTimer && !maintainerTargeting
      ? "First-time broad contributions should show prior review or subsystem routing before hitting busy maintainers."
      : "Contributor/routing context does not look like an avoidable drive-by burden."
  });
}

function classify(score, checks) {
  const blocking = checks.some((check) => check.status === "fail" && check.blocking);
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  if (blocking || score < 50) return "low-review-value";
  if (score >= 80 && failures === 0 && warnings === 0) return "ready-for-maintainer";
  return "needs-repair";
}

function summarize(status, score, kind, blockers, failing, warning, reviewBudget = null) {
  const budgetSuffix = reviewBudget ? ` Estimated review budget: ${reviewBudget.minutes} minutes (${reviewBudget.level}).` : "";
  if (status === "ready-for-maintainer") {
    return `This ${kind} is ready for maintainer attention. It has enough context, scope control, and verification signal to review.${budgetSuffix}`;
  }
  if (status === "low-review-value") {
    return `This ${kind} should not consume maintainer review time yet. Score ${score}/100 with ${blockers.length || failing.length} hard problem(s) and ${warning.length} warning(s).${budgetSuffix}`;
  }
  return `This ${kind} is directionally useful but needs repair before maintainer review. Score ${score}/100 with ${failing.length} failure(s) and ${warning.length} warning(s).${budgetSuffix}`;
}

function defaultRepairSteps(kind, failing, warning) {
  if (!failing.length && !warning.length) return [`No repair required before maintainer review.`];
  return [`Repair the failed and warning checks before asking maintainers to review this ${kind}.`];
}

function addStatusLabel(labels, status) {
  labels.add(status);
}

function publicCheck(check) {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    reason: check.reason,
    label: check.label,
    blocking: Boolean(check.blocking),
    repair: check.repair || ""
  };
}

function collectMetrics(input) {
  return {
    changedFiles: input.changedFiles,
    additions: input.additions,
    deletions: input.deletions,
    totalLines: input.additions + input.deletions,
    bodyLength: input.body.length,
    titleLength: input.title.length,
    submissionFormat: input.submissionFormat || "github"
  };
}

function publicPolicyProfile(policyProfile) {
  return {
    hasPolicy: Boolean(policyProfile?.hasPolicy),
    summary: policyProfile?.summary || "no repository policy supplied",
    sources: policyProfile?.sources || [],
    requiredSections: policyProfile?.requiredSections || [],
    testCommands: policyProfile?.testCommands || [],
    requires: policyProfile?.requires || {},
    ownerMatches: (policyProfile?.ownerMatches || []).slice(0, 20),
    maintainerMatches: (policyProfile?.maintainerMatches || []).slice(0, 20)
  };
}

function publicRepositoryContext(repositoryTriage) {
  return {
    hasContext: Boolean(repositoryTriage?.hasContext),
    source: repositoryTriage?.source || "none",
    repository: repositoryTriage?.repository || "",
    upstreamRepository: repositoryTriage?.upstreamRepository || "",
    status: repositoryTriage?.checkStatus || "pass",
    summary: repositoryTriage?.summary || "No repository context supplied.",
    labels: repositoryTriage?.labels || [],
    similarOpenIssues: repositoryTriage?.similarOpenIssues || [],
    similarClosedIssues: repositoryTriage?.similarClosedIssues || [],
    linkedClosedIssues: repositoryTriage?.linkedClosedIssues || [],
    concurrentPullRequests: repositoryTriage?.concurrentPullRequests || [],
    upstreamSolved: repositoryTriage?.upstreamSolved || [],
    findings: (repositoryTriage?.findings || []).slice(0, 12)
  };
}

function renderRepositoryContext(repositoryContext) {
  if (!repositoryContext?.hasContext) return "- None supplied.";
  if (!repositoryContext.findings?.length) return `- ${repositoryContext.summary}`;
  return repositoryContext.findings.map((item) => {
    const number = item.number ? `#${item.number} ` : "";
    const source = item.scope === "upstream" ? "upstream" : "repo";
    const overlap = item.fileOverlap?.length ? `; file overlap: ${item.fileOverlap.slice(0, 3).join(", ")}` : "";
    const url = item.url ? ` (${item.url})` : "";
    return `- ${item.relation} ${source}: ${number}${item.title || item.sha || item.tagName || "untitled"} [${item.state}]${overlap}${url}`;
  }).join("\n");
}

function renderFeedbackCalibration(calibration) {
  if (!calibration?.active) return "- None supplied.";
  const lines = [`- ${calibration.summary}`];
  for (const match of calibration.matches || []) {
    const expected = match.expectedStatus ? ` expects ${match.expectedStatus}` : "";
    const replay = match.replayPassed === null ? "" : `; replay ${match.replayPassed ? "passing" : "failing"}`;
    lines.push(`- ${match.source} ${match.id || "match"}${expected}${replay}: ${match.title || match.reason || "feedback evidence"}`);
  }
  return lines.join("\n");
}

function resolveProfile(input, options = {}) {
  const requested = String(options.profile || input.profile || "standard").trim() || "standard";
  return PROFILES[requested] || PROFILES.standard;
}

function normalizeCommits(commits) {
  if (!Array.isArray(commits)) return [];
  return commits.map((commit) => {
    if (typeof commit === "string") return commit;
    return String(commit.message || commit.body || commit.title || "");
  }).filter(Boolean);
}

function aggregateContributionText(input) {
  return [
    input.title,
    input.body,
    input.contributingText,
    ...input.commits,
    ...input.files.map((file) => `${file.filename || ""}\n${file.patch || ""}`)
  ].filter(Boolean).join("\n");
}

function normalizePatchSubject(title) {
  return title
    .replace(/^Subject:\s*/i, "")
    .replace(/^\s*\[[^\]]*PATCH[^\]]*\]\s*/i, "")
    .trim();
}

function hasHumanSignedOff(text) {
  const signoffs = text.match(/^Signed-off-by:\s*.+<[^>]+>.*$/gmi) || [];
  return signoffs.some((line) => !/\b(ai|chatgpt|claude|copilot|bot|assistant|llm)\b/i.test(line));
}

function hasMeaningfulToolGeneration(text) {
  return /\b(chatgpt|claude|copilot|llm|coding assistant|ai-generated|ai generated|generated by ai|generated by a tool|tool-generated|tool-suggested|coccinelle generated|checkpatch\.pl --fix)\b/i.test(text);
}

function analyzeProvenance(input) {
  const text = aggregateContributionText(input);
  const signedOff = hasHumanSignedOff(text);
  const assistedBy = /^Assisted-by:\s*[^:\n]+:[^\s\n]+/mi.test(text);
  const toolGenerated = hasMeaningfulToolGeneration(text);
  const reviewedBy = /^Reviewed-by:\s+.+<[^>]+>.*$/gmi.test(text);
  let summary = "human-accountability not fully stated";
  if (signedOff && !toolGenerated) summary = "human signed-off; no meaningful tool-generated signal";
  if (signedOff && toolGenerated && assistedBy) summary = "tool use disclosed; human signed-off";
  if (!signedOff && toolGenerated) summary = "tool use mentioned without human sign-off";
  return {
    signedOff,
    assistedBy,
    toolGenerated,
    reviewedBy,
    summary
  };
}

function estimateReviewBudget(input, checks, profileId = "standard") {
  const totalLines = input.additions + input.deletions;
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const dependencyPenalty = hasDependencyChange(input.files) ? 8 : 0;
  const profilePenalty = profileId === "kernel-grade" ? 10 : 0;
  const minutes = Math.ceil(8 + (input.changedFiles * 3) + (totalLines / 35) + dependencyPenalty + profilePenalty);
  const level = minutes > 90 ? "excessive" : minutes > 45 ? "high" : minutes > 25 ? "moderate" : "low";
  return {
    minutes,
    level,
    changedFiles: input.changedFiles,
    totalLines,
    failures,
    warnings
  };
}

function numberOrSum(value, files, field) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return files.reduce((sum, file) => sum + (Number(file[field]) || 0), 0);
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function titleIsClear(title) {
  const trimmed = title.trim();
  const normalized = trimmed.toLowerCase();
  if (GENERIC_TITLES.has(normalized)) return false;
  if (trimmed.length >= 12) return true;
  return /\b(?:add|allow|enable|support)\s+(?:2fa|mfa|sso|oidc|saml|ldap|oauth|webauthn|passkeys?)\b/i.test(trimmed);
}

function isDocFile(filename = "") {
  return /\.(md|mdx|rst|txt|adoc)$/i.test(filename) || filename.startsWith("docs/");
}

function isTestFile(filename = "") {
  return /(^|\/)(test|tests|spec|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs)$/i.test(filename);
}

function findSuspiciousPaths(files) {
  return files
    .map((file) => String(file.filename || file.path || ""))
    .filter((filename) => {
      const normalized = filename.replace(/\\/g, "/");
      const segments = normalized.split("/");
      return !normalized
        || normalized.startsWith("/")
        || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
        || normalized.includes("\0")
        || segments.includes("..")
        || segments.some((segment) => segment.trim() !== segment);
    });
}

function findGeneratedFileRisks(files) {
  return files
    .map((file) => String(file.filename || file.path || ""))
    .filter((filename) => /(^|\/)(dist|build|coverage|generated|vendor|third_party|public\/assets)\//i.test(filename)
      || /\.(min|bundle|generated)\.(js|css)$/i.test(filename)
      || /\.map$/i.test(filename));
}

function hasDependencyChange(files) {
  return files.some((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum|poetry\.lock|requirements\.txt|package\.json)$/i.test(file.filename || ""));
}

function classifyCiSignal(checks) {
  if (!checks.length) {
    return { status: "missing", reason: "No CI result was supplied." };
  }
  const conclusions = checks.map((check) => String(check.conclusion || check.status || "").toLowerCase());
  const hasFailure = conclusions.some((conclusion) => !["success", "passed", "pass", "neutral", "skipped"].includes(conclusion));
  if (hasFailure) {
    return { status: "fail", reason: "One or more supplied checks failed or is incomplete." };
  }
  const hasPassingSignal = conclusions.some((conclusion) => ["success", "passed", "pass"].includes(conclusion));
  if (!hasPassingSignal) {
    return { status: "weak", reason: "CI was supplied, but only neutral or skipped checks were present." };
  }
  return { status: "pass", reason: "At least one supplied check passed and no supplied checks failed." };
}

function findSecrets(input) {
  const haystacks = [input.body, ...input.files.map((file) => `${file.filename}\n${file.patch || ""}`)];
  const findings = [];
  for (const text of haystacks) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push(pattern.source);
    }
  }
  return unique(findings);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
