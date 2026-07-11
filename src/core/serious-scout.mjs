import { canonicalizeAnalysisText } from "./text-safety.mjs";

const DEFAULT_SERIOUS_MIN_SCORE = 70;
const DEFAULT_MAX_RETURNED = 50;

const SERIOUS_QUERY_PRESETS = {
  serious: [
    'is:issue is:open archived:false comments:>0 crash',
    'is:issue is:open archived:false comments:>0 regression',
    'is:issue is:open archived:false comments:>0 "data loss"',
    'is:issue is:open archived:false comments:>0 deadlock',
    'is:issue is:open archived:false comments:>0 "incorrect result"',
    'is:issue is:open archived:false comments:>0 panic',
    'is:issue is:open archived:false comments:>0 "memory leak"',
    'is:issue is:open archived:false comments:>0 "wrong output"'
  ],
  systems: [
    'is:issue is:open archived:false comments:>0 crash language:Rust',
    'is:issue is:open archived:false comments:>0 panic language:Rust',
    'is:issue is:open archived:false comments:>0 deadlock language:Go',
    'is:issue is:open archived:false comments:>0 regression language:Python',
    'is:issue is:open archived:false comments:>0 "incorrect result" language:TypeScript'
  ],
  "maintainer-grade": [
    'is:issue is:open archived:false comments:>2 label:bug "steps to reproduce" -author:app/github-actions -author:github-actions[bot]',
    'is:issue is:open archived:false comments:>2 label:bug "expected" "actual" -author:app/github-actions -author:github-actions[bot]',
    'is:issue is:open archived:false comments:>2 regression "bisect" -author:app/github-actions -author:github-actions[bot]',
    'is:issue is:open archived:false comments:>2 crash "stack trace" -author:app/github-actions -author:github-actions[bot]',
    'is:issue is:open archived:false comments:>2 "data loss" "version" -author:app/github-actions -author:github-actions[bot]',
    'is:issue is:open archived:false comments:>2 panic "minimal repro" -author:app/github-actions -author:github-actions[bot]'
  ]
};

const IMPACT_PATTERNS = [
  ["data-loss", /\b(data loss|corrupt(?:ion|ed)?|truncate[sd]?|lost data|drop(?:ped)? data)\b/i, 26],
  ["security", /\b(security|vulnerab(?:le|ility)|auth bypass|privilege escalation|permission bypass)\b/i, 24],
  ["crash", /\b(crash(?:es|ed|ing)?|segfault|segmentation fault|fatal error|abort(?:ed)?|panic)\b/i, 22],
  ["incorrect-result", /\b(wrong output|incorrect result|wrong result|incorrectly|miscompil(?:e|es|ed|ation)|false positive|false negative)\b/i, 20],
  ["regression", /\b(regression|broke|broken since|worked in|used to work|after upgrade|since v?\d)\b/i, 18],
  ["concurrency", /\b(deadlock|race condition|data race|hangs?|freezes?|timeout|stuck)\b/i, 18],
  ["resource-leak", /\b(memory leak|fd leak|descriptor leak|goroutine leak|leak(?:ing)? memory|unbounded memory)\b/i, 16],
  ["install-breakage", /\b(build fail(?:s|ed|ure)?|compile fail(?:s|ed)?|cannot install|startup fail(?:s|ed)?)\b/i, 12]
];

const EVIDENCE_PATTERNS = [
  ["steps", /\b(steps to reproduce|reproduction|repro|minimal repro|mre)\b/i, 16],
  ["expected-actual", /\b(expected|actual)\b[\s\S]{0,240}\b(actual|expected)\b/i, 14],
  ["stack-trace", /\b(stack trace|traceback|exception|assertion failed|panic:|fatal:|error:)\b/i, 14],
  ["version", /\b(version|commit|sha|main|nightly|release|v?\d+\.\d+(?:\.\d+)?)\b/i, 8],
  ["test-case", /\b(failing test|test case|fixture|reproducer|bisect|git bisect)\b/i, 10],
  ["logs", /\b(logs?|console output|stderr|stdout)\b/i, 6]
];

const SCOPE_PATTERNS = [
  ["path", /\b(?:src|lib|packages?|cmd|internal|core|crates?|app|tests?)\/[A-Za-z0-9._/-]+\b/i, 12],
  ["path", /\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:c|cc|cpp|cs|go|h|hpp|java|js|jsx|kt|mjs|py|rb|rs|swift|ts|tsx)\b/i, 12],
  ["component", /\b(component|module|package|provider|adapter|parser|compiler|runtime|cli|api|backend|frontend)\b/i, 8],
  ["narrow-title", /\b(fix|panic|crash|regression|deadlock|leak|incorrect|wrong)\b/i, 6]
];

const COSMETIC_PATTERNS = [
  ["typo", /\b(typo|spelling|grammar|wording|copy edit|copyedit|misspell(?:ed|ing)?)\b/i],
  ["formatting", /\b(whitespace|indent(?:ation)?|formatting|prettier|black|gofmt|rustfmt|lint-only|lint only)\b/i],
  ["docs-only", /\b(readme|docs?|documentation|comment|javadoc|docstring|broken link|website copy)\b/i],
  ["visual-polish", /\b(color|theme|icon|alignment|margin|padding|css polish|ui polish)\b/i],
  ["chore", /\b(chore|cleanup|refactor only|rename only|bump dependency|dependabot)\b/i]
];

const PROCESS_PATTERNS = [
  ["feature-request", /\b(feature request|proposal|rfc|idea|enhancement|wish(?:list)?|would be nice|support for|add support)\b/i],
  ["question", /\b(question|how do i|help wanted\?|discussion|usage help)\b/i],
  ["needs-design", /\b(needs design|architecture|design discussion|breaking change)\b/i]
];

const GENERATED_NOISE_PATTERNS = [
  ["agent-tracker", /\b(ai agent tracker|agent tracker|autoworker|worker tracker|generated tracker|orchestrator tracker|codex tracker|hive advisory|qa full playthrough)\b/i],
  ["bot-report", /\b(ci monitor|daily report|automated report|scheduled workflow|rolling \d+-day dashboard|swe-bench|bot)\b/i],
  ["ci-generated-issue", /\b(created automatically|automatically created|issue cr[ée]ée automatiquement|e2e-report-to-issues|github-actions|actions\/runs|test [ée]chou[ée])\b/i],
  ["design-boilerplate", /\b(\[designed\]|design plan|plan-review|intake:|auto-suggested|suggested fix injection)\b/i],
  ["scaffold-repo", /\b(gamefactory|nes-style|web-browser-game|dyad-wu-wei|auto[-_]?trader[_-]?codex)\b/i]
];

const AUTOMATED_CI_REPORT_PATTERNS = [
  ["generated-ci-body", /\b(created automatically|automatically created|issue cr[ée]ée automatiquement|e2e-report-to-issues|scripts\/ci|github actions|github-actions|actions\/runs)\b/i],
  ["ci-failure-report", /\b(e2e regression|ci run|workflow run|test [ée]chou[ée]|test failed|failed workflow|staging.*4xx|precondition)\b/i],
  ["bot-author", /\b(app\/github-actions|github-actions(?:\[bot\])?|dependabot(?:\[bot\])?)\b/i]
];

const PLATFORM_RISK_PATTERNS = [
  ["game-compatibility", /\b(proton|wine|steam|game compatibility|sea of thieves|app(?:lication)? id \d{3,}|gpu|driver)\b/i],
  ["mobile-platform", /\b(android|ios|iphone|ipad|safari|macos|windows-only|linux-only)\b/i],
  ["hardware", /\b(hardware|device-specific|firmware|bluetooth|usb|kernel module)\b/i]
];

const BLOCKED_LABEL_PATTERNS = [
  /\bduplicate\b/i,
  /\bwontfix\b/i,
  /\binvalid\b/i,
  /\bstale\b/i,
  /\bblocked\b/i,
  /\bneeds design\b/i,
  /\bquestion\b/i
];

const POSITIVE_LABEL_PATTERNS = [
  ["confirmed", /\b(confirmed|accepted|reproduced|triaged)\b/i, 12],
  ["bug", /\b(bug|regression|crash|panic|data loss)\b/i, 10],
  ["help-wanted", /\b(help wanted|good first issue|up for grabs)\b/i, 4]
];

const INVITATION_LABEL_PATTERN = /\b(help wanted|good first issue|up for grabs|status: accepting prs|contributions welcome)\b/i;
const MAINTAINER_ASSOCIATIONS = new Set(["owner", "member", "collaborator"]);
const PROGRAM_ASSIGNMENT_PATTERNS = [
  ["program-label", /\b(gssoc|gsoc|girl script|hacktoberfest|osoc|jwoc|swoc)\b/i],
  ["mentor-label", /\b(mentor:|level:beginner|level:intermediate|level:advanced|valid-issue|needs-labels)\b/i],
  ["assignment-required", /\b(wait for triage|request assignment|officially assigned|without being assigned|automatically closed)\b/i]
];
const CLAIMED_WORK_PATTERNS = [
  ["reporter-plans-pr", /\[[xX]\]\s*I plan to submit a PR|\[[xX]\]\s*I'm planning to submit a PR|\bI plan to submit (?:a )?PR\b/i],
  ["work-in-progress", /\b(I'?m working on this|working on this|PR is ready|I have made (?:a |an )?pull request|I opened (?:a |an )?PR)\b/i],
  ["assignment-requested", /\b(can I work on this|could you assign this to me|please assign(?: this)? to me|I would like to work on this)\b/i]
];

export function defaultSeriousSearchQueries(preset = "serious") {
  return [...(SERIOUS_QUERY_PRESETS[preset] || SERIOUS_QUERY_PRESETS.serious)];
}

export function buildSeriousCandidateScout(input = {}) {
  input = plainObject(input);
  const issues = normalizeIssues(input.issues || input.items || input.candidates || []);
  const collection = normalizeCollectionIntegrity(input.collection);
  const overlap = normalizeOverlapIntegrity(input.overlap, issues);
  const options = {
    minScore: clampNumber(input.minScore, DEFAULT_SERIOUS_MIN_SCORE, 0, 100),
    maxReturned: clampNumber(input.maxReturned, DEFAULT_MAX_RETURNED, 1, 500)
  };
  const rows = issues
    .map((issue) => scoreIssue(issue))
    .sort(compareRows);
  const returnedRows = rows
    .filter((row) => row.score >= options.minScore || row.status === "blocked")
    .slice(0, options.maxReturned);
  const summary = summarizeRows(issues, returnedRows);

  return {
    ok: true,
    artifact: "pcf-serious-candidate-scout",
    generatedAt: input.generatedAt || new Date().toISOString(),
    profile: "serious-upstream-contributor",
    sourceQueries: normalizeStrings(input.sourceQueries || input.queries || []),
    thresholds: {
      minScore: options.minScore,
      maxReturned: options.maxReturned
    },
    collection,
    overlap,
    automation: automationVerdict(summary, { collection, overlap }),
    summary,
    candidates: returnedRows,
    nextActions: returnedRows
      .filter((row) => row.status === "candidate")
      .slice(0, 10)
      .map((row) => ({
        repository: row.repository,
        item: row.item,
        title: row.title,
        score: row.score,
        seriousness: row.seriousness,
        nextGate: row.nextGate
      })),
    nonClaims: [
      "Serious scout is read-only: it does not clone repositories, write patches, open PRs, comment, label, or contact maintainers.",
      "A candidate means the issue looks serious and reviewable enough to spend preflight time, not that a patch should be written immediately.",
      "Run contribution policy, AI/tooling policy, open-PR overlap, current-upstream reproduction, TODO/FIXME, and diff-shape gates before coding.",
    "Cosmetic, docs-only, feature-request, duplicate, stale, assigned, generated-tracker, bot-created CI/E2E report, platform-compatibility, and no-repro rows are intentionally down-ranked or blocked."
    ]
  };
}

export function renderSeriousScoutMarkdown(report = {}) {
  const candidateRows = (report.candidates || []).map((row) => [
    row.status,
    row.repository,
    row.item,
    row.title,
    row.score,
    row.seriousness,
    row.blocker || row.warning || "none",
    row.nextGate
  ]);

  return [
    "# PCF Serious Candidate Scout",
    "",
    `Generated: ${report.generatedAt || ""}`,
    "",
    "## Safety Posture",
    "",
    "Dry-run: **yes**",
    "",
    "No repositories were cloned. No comments, labels, pull requests, patches, or other GitHub writes were made.",
    "",
    "## Summary",
    "",
    `Issues inspected: ${report.summary?.total || 0}`,
    `Returned rows: ${report.summary?.returned || 0}`,
    `Serious candidates: ${report.summary?.candidate || 0}`,
    `Needs manual review: ${report.summary?.review || 0}`,
    `Blocked or low-value: ${report.summary?.blocked || 0}`,
    `Cosmetic/docs-only blocked: ${report.summary?.cosmeticBlocked || 0}`,
    `No-repro review rows: ${report.summary?.noReproReview || 0}`,
    `Collection integrity: ${report.collection?.complete === false ? "incomplete" : "complete"} (${report.collection?.errors?.length || 0} error(s))`,
    `Overlap coverage: ${report.overlap?.required ? `${report.overlap.checked || 0} checked, ${report.overlap.failed || 0} failed, ${report.overlap.unchecked || 0} unchecked` : "not requested in this artifact"}`,
    `Automation verdict: ${report.automation?.status || "NO_ACTION"} - ${report.automation?.reason || "No automation verdict supplied."}`,
    "",
    "## Search Queries",
    "",
    ...((report.sourceQueries || []).length ? report.sourceQueries.map((query) => `- \`${query}\``) : ["- Fixture or caller-supplied input."]),
    "",
    "## Candidate Queue",
    "",
    "| Status | Repository | Item | Title | Score | Seriousness | Gate Signal | Next Gate |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    ...(candidateRows.length ? candidateRows : [["none", "n/a", "n/a", "No candidate rows in this run.", "0", "n/a", "none", "No action."]]).map(markdownRow),
    "",
    "## Non-Claims",
    "",
    ...(report.nonClaims || []).map((claim) => `- ${claim}`),
    ""
  ].join("\n");
}

export function renderSeriousScoutSummary(report = {}) {
  return [
    "PCF Serious Candidate Scout",
    `Issues inspected: ${report.summary?.total || 0}`,
    `Candidates: ${report.summary?.candidate || 0}`,
    `Review: ${report.summary?.review || 0}`,
    `Blocked: ${report.summary?.blocked || 0}`,
    `Cosmetic/docs-only blocked: ${report.summary?.cosmeticBlocked || 0}`,
    `Automation verdict: ${report.automation?.status || "NO_ACTION"} - ${report.automation?.reason || "No automation verdict supplied."}`,
    "Non-claim: candidates still need policy, overlap, current-upstream repro, TODO/FIXME, and diff-shape gates.",
    ""
  ].join("\n");
}

function scoreIssue(issue) {
  const labels = issue.labels.map((label) => label.toLowerCase());
  const text = `${issue.title}\n${issue.body}\n${labels.join(" ")}`;
  const automationText = `${issue.authorLogin}\n${text}`;
  const signals = [];
  const warnings = [];
  const blockers = [];
  let score = 0;

  for (const [id, pattern, points] of IMPACT_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ id, points, reason: signalReason(id) });
      score += points;
    }
  }
  for (const [id, pattern, points] of EVIDENCE_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ id, points, reason: signalReason(id) });
      score += points;
    }
  }
  for (const [id, pattern, points] of SCOPE_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ id, points, reason: signalReason(id) });
      score += points;
    }
  }
  for (const [id, pattern, points] of POSITIVE_LABEL_PATTERNS) {
    if (labels.some((label) => pattern.test(label))) {
      signals.push({ id, points, reason: signalReason(id) });
      score += points;
    }
  }

  const cosmeticHits = matchingPatternIds(COSMETIC_PATTERNS, text);
  const processHits = matchingPatternIds(PROCESS_PATTERNS, text);
  const generatedNoiseHits = matchingPatternIds(GENERATED_NOISE_PATTERNS, `${issue.repository}\n${text}`);
  const automatedCiHits = matchingPatternIds(AUTOMATED_CI_REPORT_PATTERNS, automationText);
  const programAssignmentHits = matchingPatternIds(PROGRAM_ASSIGNMENT_PATTERNS, text);
  const claimedWorkHits = matchingPatternIds(CLAIMED_WORK_PATTERNS, removeNegatedClaimPhrases(text));
  const platformRiskHits = matchingPatternIds(PLATFORM_RISK_PATTERNS, text);
  const blockedLabels = labels.filter((label) => BLOCKED_LABEL_PATTERNS.some((pattern) => pattern.test(label)));
  const impactScore = sumSignalPoints(signals, IMPACT_PATTERNS.map(([id]) => id));
  const evidenceScore = sumSignalPoints(signals, EVIDENCE_PATTERNS.map(([id]) => id));
  const concreteScopeScore = sumSignalPoints(signals, ["path", "component"]);

  if (cosmeticHits.length && impactScore < 18) {
    blockers.push({
      id: "cosmetic-or-docs-only",
      reason: `Looks cosmetic/docs-only: ${cosmeticHits.slice(0, 3).join(", ")}.`
    });
    score -= 45;
  } else if (cosmeticHits.length) {
    warnings.push({
      id: "cosmetic-language-present",
      reason: `Cosmetic/docs terms also present: ${cosmeticHits.slice(0, 3).join(", ")}.`
    });
    score -= 8;
  }

  if (processHits.length && impactScore < 18) {
    blockers.push({
      id: "feature-or-process-request",
      reason: `Looks like a feature/process request, not a concrete fixable bug: ${processHits.slice(0, 3).join(", ")}.`
    });
    score -= 35;
  } else if (processHits.length) {
    warnings.push({
      id: "feature-language-present",
      reason: `Feature/process terms also present: ${processHits.slice(0, 3).join(", ")}.`
    });
    score -= 6;
  }

  if (blockedLabels.length) {
    blockers.push({
      id: "blocked-label",
      reason: `Repository label blocks contributor scouting: ${blockedLabels.slice(0, 3).join(", ")}.`
    });
    score -= 40;
  }
  if (automatedCiHits.length && (issue.authorIsBot || automatedCiHits.includes("generated-ci-body"))) {
    blockers.push({
      id: "automated-ci-issue",
      reason: `Looks like a bot-created CI/E2E report, not a maintainer-scoped contribution target: ${automatedCiHits.slice(0, 3).join(", ")}.`
    });
    score -= 65;
  }
  if (generatedNoiseHits.length) {
    blockers.push({
      id: "generated-issue-noise",
      reason: `Looks like generated tracker/planning noise, not a normal maintainer issue: ${generatedNoiseHits.slice(0, 3).join(", ")}.`
    });
    score -= 55;
  }
  if (programAssignmentHits.length >= 2 || programAssignmentHits.includes("assignment-required")) {
    blockers.push({
      id: "program-assignment-workflow",
      reason: `Looks like a contest/mentorship assignment queue that requires maintainer assignment first: ${programAssignmentHits.slice(0, 3).join(", ")}.`
    });
    score -= 50;
  }
  if (claimedWorkHits.length) {
    blockers.push({
      id: "claimed-work",
      reason: `Issue appears already claimed or reporter-owned: ${claimedWorkHits.slice(0, 3).join(", ")}.`
    });
    score -= 45;
  }
  if (platformRiskHits.length && concreteScopeScore < 12) {
    blockers.push({
      id: "platform-compatibility-risk",
      reason: `Platform/game/hardware-specific issue without concrete code scope: ${platformRiskHits.slice(0, 3).join(", ")}.`
    });
    score -= 35;
  }
  if (issue.assigned) {
    blockers.push({ id: "assigned", reason: "Issue is assigned or appears owner-held." });
    score -= 30;
  }
  if (issue.maintainerAuthored && !labels.some((label) => INVITATION_LABEL_PATTERN.test(label))) {
    blockers.push({
      id: "maintainer-owned-without-invitation",
      reason: "Issue is maintainer-authored/owned and has no explicit help-wanted or contribution invitation label."
    });
    score -= 35;
  }
  if (issue.openPullRequestOverlap || issue.overlapStatus === "found") {
    blockers.push({ id: "open-pr-overlap", reason: "Open PR overlap was supplied for this issue." });
    score -= 45;
  } else if (issue.overlapStatus === "error" || issue.overlapStatus === "unchecked") {
    warnings.push({
      id: "overlap-unverified",
      reason: issue.overlapStatus === "error"
        ? `Open PR overlap collection failed: ${issue.overlapCollectionError || "unknown error"}.`
        : "Open PR overlap was not checked for this issue."
    });
    score -= 18;
  }
  if (issue.state && issue.state !== "open") {
    blockers.push({ id: "not-open", reason: `Issue is ${issue.state}, not open.` });
    score -= 60;
  }

  if (impactScore < 18) {
    blockers.push({
      id: "not-serious-enough",
      reason: "No strong crash, regression, correctness, data-loss, deadlock, leak, or build-breakage signal."
    });
    score -= 20;
  }
  if (evidenceScore < 14) {
    warnings.push({
      id: "needs-reproduction-evidence",
      reason: "Serious terms are present, but reproduction evidence is thin or missing."
    });
    score -= 18;
  }
  if (!issue.body || issue.body.trim().length < 120) {
    warnings.push({
      id: "thin-body",
      reason: "Issue body is too thin to trust without manual inspection."
    });
    score -= 8;
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const status = blockers.length ? "blocked" : warnings.length ? "review" : "candidate";
  const blocker = blockers[0]?.reason || "";
  const warning = warnings[0]?.reason || "";

  return {
    repository: issue.repository,
    item: issue.number ? `#${issue.number}` : issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    status,
    score: clampedScore,
    seriousness: seriousnessForScore(clampedScore, impactScore),
    impactScore,
    evidenceScore,
    labels: issue.labels,
    signals,
    blockers,
    warnings,
    blocker,
    warning,
    reason: blocker || warning || "High-impact issue with concrete evidence and reviewable scope.",
    nextGate: nextGateForStatus(status)
  };
}

function normalizeIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .filter((issue) => issue && typeof issue === "object" && !Array.isArray(issue))
    .map((issue, index) => {
      const repository = normalizeRepository(issue.repository || issue.repo || issue.repository_url || issue.html_url || issue.url);
      return {
        id: String(issue.id || (issue.number ? `issue-${issue.number}` : `issue-${index + 1}`)),
        repository,
        number: issue.number || "",
        title: canonicalizeAnalysisText(issue.title),
        body: canonicalizeAnalysisText(issue.body || issue.description),
        authorLogin: normalizeAuthorLogin(issue),
        authorIsBot: normalizeAuthorIsBot(issue),
        authorAssociation: normalizeAuthorAssociation(issue),
        maintainerAuthored: normalizeMaintainerAuthored(issue),
        labels: normalizeLabels(issue.labels || []),
        url: String(issue.htmlUrl || issue.html_url || issue.url || ""),
        state: String(issue.state || "open").toLowerCase(),
        assigned: Boolean(issue.assigned || issue.assignee || issue.assignees?.length),
        openPullRequestOverlap: Boolean(issue.openPullRequestOverlap || issue.openPrOverlap || issue.overlap?.open),
        overlapStatus: normalizeOverlapStatus(issue),
        overlapCollectionError: String(issue.overlapCollectionError || issue.overlapError || "")
      };
    })
    .filter((issue) => issue.repository || issue.title || issue.number);
}

function normalizeAuthorLogin(issue = {}) {
  const author = issue.author || issue.user || {};
  if (typeof author === "string") return author;
  return String(author.login || issue.authorLogin || issue.userLogin || "");
}

function normalizeAuthorIsBot(issue = {}) {
  const author = issue.author || issue.user || {};
  const login = normalizeAuthorLogin(issue);
  const type = typeof author === "object" ? String(author.type || "") : "";
  return Boolean(
    issue.authorIsBot
    || issue.userIsBot
    || type.toLowerCase() === "bot"
    || /\[bot\]$/i.test(login)
    || /^app\//i.test(login)
    || /^github-actions$/i.test(login)
  );
}

function normalizeAuthorAssociation(issue = {}) {
  return String(issue.authorAssociation || issue.author_association || issue.author?.association || "").toLowerCase();
}

function normalizeMaintainerAuthored(issue = {}) {
  if (issue.maintainerAuthored || issue.maintainerOwned) return true;
  return MAINTAINER_ASSOCIATIONS.has(normalizeAuthorAssociation(issue));
}

function summarizeRows(inputRows, rows) {
  const candidates = rows.filter((row) => row.status === "candidate");
  const blocked = rows.filter((row) => row.status === "blocked");
  const cosmeticBlocked = rows.filter((row) => row.blockers.some((blocker) => blocker.id === "cosmetic-or-docs-only"));
  const noReproReview = rows.filter((row) => row.status === "review" && row.warnings.some((warning) => warning.id === "needs-reproduction-evidence"));
  return {
    total: inputRows.length,
    returned: rows.length,
    candidate: candidates.length,
    review: rows.filter((row) => row.status === "review").length,
    blocked: blocked.length,
    cosmeticBlocked: cosmeticBlocked.length,
    noReproReview: noReproReview.length,
    promotionRate: rows.length ? Number((candidates.length / rows.length).toFixed(4)) : 0,
    blockRate: rows.length ? Number((blocked.length / rows.length).toFixed(4)) : 0
  };
}

function automationVerdict(summary = {}, { collection = {}, overlap = {} } = {}) {
  if ((summary.total || 0) === 0) {
    return {
      status: "NO_ACTION",
      reason: "No issues were inspected; check search configuration or rate-limit errors before relying on this run.",
      nextGate: "Fix collection before making contribution decisions."
    };
  }
  if (collection.complete === false) {
    return {
      status: "NO_ACTION",
      reason: "Issue collection was incomplete or failed; partial search results cannot authorize promotion.",
      nextGate: "Repair collection and rerun the same bounded scout before promoting any candidate."
    };
  }
  if (overlap.required && overlap.complete === false) {
    return {
      status: "NO_ACTION",
      reason: "Open-PR overlap coverage was incomplete; unchecked ownership cannot authorize promotion.",
      nextGate: "Complete open-PR overlap checks for every preliminary candidate before promotion."
    };
  }
  if ((summary.candidate || 0) > 0) {
    return {
      status: "PROMOTE",
      reason: "Serious candidate rows cleared the impact, evidence, and scope bar.",
      nextGate: "Run policy, AI/tooling, open-PR overlap, current-upstream repro, TODO/FIXME, and diff-shape gates before coding."
    };
  }
  return {
    status: "NO_ACTION",
    reason: "No issue cleared the serious-candidate bar; do not spend engineering time on this run.",
    nextGate: "Keep the artifact as evidence and search again later or with stronger queries."
  };
}

function normalizeCollectionIntegrity(value = null) {
  if (!value || typeof value !== "object") {
    return {
      source: "caller-supplied",
      complete: false,
      queries: 0,
      incompleteResults: 0,
      errors: [{ scope: "integrity", message: "Collection integrity metadata was not supplied." }]
    };
  }
  const errors = Array.isArray(value.errors) ? value.errors.map(normalizeIntegrityError) : [];
  const incompleteResults = clampNumber(value.incompleteResults, 0, 0, 10_000);
  return {
    source: String(value.source || "caller-supplied"),
    complete: value.complete !== false && errors.length === 0 && incompleteResults === 0,
    queries: clampNumber(value.queries, 0, 0, 10_000),
    incompleteResults,
    errors
  };
}

function normalizeOverlapIntegrity(value = null, issues = []) {
  const rowStatuses = issues.map((issue) => issue.overlapStatus).filter(Boolean);
  const inferredRequired = rowStatuses.length > 0;
  const inferredFailed = rowStatuses.filter((status) => status === "error").length;
  const inferredUnchecked = rowStatuses.filter((status) => status === "unchecked").length;
  if (!value || typeof value !== "object") {
    return {
      required: inferredRequired,
      complete: !inferredRequired || (inferredFailed === 0 && inferredUnchecked === 0),
      checked: rowStatuses.filter((status) => status === "clear" || status === "found").length,
      found: rowStatuses.filter((status) => status === "found").length,
      failed: inferredFailed,
      unchecked: inferredUnchecked,
      errors: inferredFailed ? [{ scope: "overlap", message: "One or more per-issue overlap checks failed." }] : []
    };
  }
  const required = value.required === true || inferredRequired;
  const failed = Math.max(clampNumber(value.failed, 0, 0, 10_000), inferredFailed);
  const unchecked = Math.max(clampNumber(value.unchecked, 0, 0, 10_000), inferredUnchecked);
  const errors = Array.isArray(value.errors) ? value.errors.map(normalizeIntegrityError) : [];
  return {
    required,
    complete: !required || (value.complete !== false && failed === 0 && unchecked === 0 && errors.length === 0),
    checked: clampNumber(value.checked, 0, 0, 10_000),
    found: clampNumber(value.found, 0, 0, 10_000),
    failed,
    unchecked,
    errors
  };
}

function normalizeIntegrityError(error) {
  if (typeof error === "string") return { scope: "collection", message: error };
  return {
    scope: String(error?.scope || error?.query || "collection"),
    message: String(error?.message || error?.error || "unknown error")
  };
}

function normalizeOverlapStatus(issue = {}) {
  const explicit = String(issue.overlapStatus || issue.overlap?.status || "").toLowerCase();
  if (["clear", "found", "error", "unchecked"].includes(explicit)) return explicit;
  if (issue.openPullRequestOverlap || issue.openPrOverlap || issue.overlap?.open) return "found";
  if (issue.overlapCollectionError || issue.overlapError) return "error";
  return "";
}

function removeNegatedClaimPhrases(text) {
  return String(text || "")
    .replace(/\b(?:i(?:'m| am)|we(?:'re| are))\s+not\s+(?:currently\s+)?working on this\b/gi, "")
    .replace(/\b(?:nobody|no one|no-one)\s+is\s+(?:currently\s+)?working on this\b/gi, "")
    .replace(/\bi\s+(?:do not|don't)\s+plan to submit (?:a )?pr\b/gi, "");
}

function compareRows(left, right) {
  const statusOrder = { candidate: 0, review: 1, blocked: 2 };
  return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
    || right.score - left.score
    || String(left.repository).localeCompare(String(right.repository))
    || Number(left.number || 0) - Number(right.number || 0);
}

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : [labels])
    .map((label) => typeof label === "string" ? label : label?.name)
    .map((label) => canonicalizeAnalysisText(label).trim())
    .filter(Boolean);
}

function normalizeStrings(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeRepository(value = "") {
  const text = String(value || "").trim();
  const direct = text.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  if (direct) return direct[1];
  const githubUrl = text.match(/github\.com\/([^/\s]+\/[^/#?\s]+)/i);
  if (githubUrl) return githubUrl[1].replace(/\.git$/, "");
  const apiUrl = text.match(/\/repos\/([^/\s]+\/[^/#?\s]+)/i);
  if (apiUrl) return apiUrl[1].replace(/\.git$/, "");
  return "";
}

function matchingPatternIds(patterns, text) {
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
}

function sumSignalPoints(signals, ids) {
  const allowed = new Set(ids);
  return signals
    .filter((signal) => allowed.has(signal.id))
    .reduce((sum, signal) => sum + signal.points, 0);
}

function seriousnessForScore(score, impactScore) {
  if (score >= 85 && impactScore >= 22) return "high";
  if (score >= 70 && impactScore >= 18) return "medium";
  return "low";
}

function nextGateForStatus(status) {
  if (status === "blocked") return "Do not code; inspect blocker or choose another issue.";
  if (status === "review") return "Manually inspect evidence, repo policy, overlap, and current-upstream behavior before cloning.";
  return "Run policy, AI/tooling, overlap, current-upstream repro, TODO/FIXME, and diff-shape gates.";
}

function signalReason(id) {
  return id.replaceAll("-", " ");
}

function markdownRow(values) {
  return `| ${values.map(markdownCell).join(" | ")} |`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
