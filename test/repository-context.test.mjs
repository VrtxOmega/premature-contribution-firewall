import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContribution, renderMarkdownReport } from "../src/core/evaluator.mjs";
import { analyzeRepositoryContext } from "../src/core/repository-context.mjs";

test("repository context detects similar open issues, concurrent PRs, and upstream fixes", () => {
  const input = readyPrWithContext();
  const analysis = analyzeRepositoryContext(input);

  assert.equal(analysis.hasContext, true);
  assert.equal(analysis.checkStatus, "fail");
  assert.ok(analysis.similarOpenIssues.some((item) => item.number === "41"));
  assert.ok(analysis.concurrentPullRequests.some((item) => item.number === "77"));
  assert.ok(analysis.upstreamSolved.some((item) => item.number === "300"));
  assert.ok(analysis.labels.includes("possibly-duplicate"));
  assert.ok(analysis.labels.includes("concurrent-work"));
  assert.ok(analysis.labels.includes("possibly-upstream-fixed"));
});

test("repository context findings repair an otherwise ready pull request", () => {
  const result = evaluateContribution(readyPrWithContext());

  assert.equal(result.status, "needs-repair");
  assert.ok(result.labels.includes("possibly-duplicate"));
  assert.ok(result.labels.includes("concurrent-work"));
  assert.ok(result.labels.includes("possibly-upstream-fixed"));
  assert.equal(result.repositoryContext.hasContext, true);
  assert.ok(result.repositoryContext.findings.length >= 3);
  assert.ok(result.checks.some((check) => check.id === "repository-context" && check.status === "fail"));
});

test("missing repository context stays missing after evaluator normalization", () => {
  const result = evaluateContribution({
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
      "```text",
      "policyProfile.hasPolicy=true",
      "```"
    ].join("\n")
  });

  assert.equal(result.repositoryContext.hasContext, false);
  assert.ok(result.labels.includes("duplicate-search-needed"));
});

test("closed linked issue is surfaced before maintainer triage", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Webhook dry-run response omits would-post labels",
    body: [
      "Steps to reproduce:",
      "1. Start current main.",
      "2. Send a pull_request webhook with PCF_DRY_RUN=true.",
      "",
      "Expected: response includes labels.",
      "Actual: response omits labels.",
      "",
      "Environment: Node 22 on Linux.",
      "Logs:",
      "```",
      "dry-run labels missing",
      "```",
      "Duplicate search: searched current main.",
      "Root cause: formatter omitted labels.",
      "Related: #42"
    ].join("\n"),
    repositoryContext: {
      repository: "VrtxOmega/premature-contribution-firewall",
      issues: [
        {
          number: 42,
          title: "Dry-run response omits would-post labels",
          body: "Fixed by #55 and released in 0.1.1.",
          state: "closed",
          labels: ["fixed"],
          htmlUrl: "https://github.example/issues/42"
        }
      ]
    }
  });

  assert.equal(result.status, "needs-repair");
  assert.ok(result.labels.includes("linked-issue-closed"));
  assert.ok(result.labels.includes("possibly-solved"));
  assert.ok(result.repositoryContext.linkedClosedIssues.some((item) => item.number === "42"));
});

test("contextual follow-up references do not become duplicate blockers", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Index: Show un-indexable files in Hidden with a clear error",
    authorAssociation: "MEMBER",
    labels: [{ name: "idea" }],
    body: [
      "Follow-up to #5389.",
      "",
      "**As a user, I want files that fail to decode to still appear in Hidden, so that I can remove or re-process them.**",
      "",
      "### Background",
      "The earlier issue reported broken files disappearing from the UI. This follow-up tracks the storage and visibility rules needed for a focused implementation.",
      "",
      "### Acceptance Criteria",
      "- [ ] A file that fails to decode MUST be recorded with a non-empty file error.",
      "- [ ] The corresponding photo MUST be assigned photo_quality = -1."
    ].join("\n"),
    repositoryContext: {
      repository: "photoprism/photoprism",
      issues: [
        {
          number: 5389,
          title: "Broken files do not show up in Hidden",
          body: "Closed after a first pass; follow-up work remains.",
          state: "closed",
          labels: ["fixed"],
          htmlUrl: "https://github.example/issues/5389"
        }
      ]
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("linked-issue-closed"), false);
  assert.equal(result.labels.includes("possibly-solved"), false);
  assert.equal(result.repositoryContext.linkedClosedIssues.length, 0);
});

test("contextual open tracking references do not become duplicate blockers", () => {
  const result = evaluateContribution({
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
      ]
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("possibly-duplicate"), false);
  assert.equal(result.repositoryContext.similarOpenIssues.length, 0);
});

test("comment-supplied issue refs surface open linked duplicates", () => {
  const result = evaluateContribution({
    kind: "issue",
    number: 10,
    title: "Add the ability to have TrackLink inserted by default",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am frustrated when I forget to click the TrackLink checkbox before sending the campaign.",
      "",
      "**Describe the solution you'd like**",
      "I would like a setting that automatically enables TrackLink for pasted links."
    ].join("\n"),
    repositoryContext: {
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
      ]
    }
  });

  assert.equal(result.status, "needs-repair");
  assert.ok(result.labels.includes("possibly-duplicate"));
  assert.ok(result.repositoryContext.similarOpenIssues.some((item) => item.number === "9" && item.directReference));
});

test("external GitHub issue URLs are not treated as local linked issues", () => {
  const result = evaluateContribution({
    kind: "issue",
    number: 10,
    title: "Document SMTP relay hostname requirement",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I spent time debugging smtp-relay.google.com and found that it requires a HELO hostname.",
      "",
      "**Describe the solution you'd like**",
      "Add documentation near SMTP settings so users know when to configure the HELO hostname.",
      "",
      "I found a related explanation at https://github.com/other/project/issues/42."
    ].join("\n"),
    repositoryContext: {
      repository: "knadh/listmonk",
      issues: [
        {
          number: 42,
          title: "Unrelated closed local issue",
          body: "This closed local issue should not be linked by an external URL.",
          state: "closed",
          labels: ["fixed"],
          htmlUrl: "https://github.example/issues/42"
        }
      ]
    }
  });

  assert.equal(result.labels.includes("linked-issue-closed"), false);
  assert.equal(result.labels.includes("possibly-solved"), false);
  assert.equal(result.repositoryContext.linkedClosedIssues.length, 0);
});

test("markdown report includes repository context findings", () => {
  const result = evaluateContribution(readyPrWithContext());
  const markdown = renderMarkdownReport(result);

  assert.match(markdown, /Repository context:/);
  assert.match(markdown, /concurrent-pr repo: #77/);
  assert.match(markdown, /upstream-solved upstream: #300/);
});

function readyPrWithContext() {
  return {
    kind: "pull_request",
    title: "webhook: include labels in dry-run response",
    body: [
      "Fixes #41.",
      "",
      "Problem: dry-run webhook responses omit the labels that would be applied.",
      "Change: return the maintainer labels beside the comment preview.",
      "Risk: low because this changes dry-run JSON only.",
      "Verification: npm test passed locally. Expected labels are present; actual before omitted labels."
    ].join("\n"),
    authorAssociation: "CONTRIBUTOR",
    changedFiles: 2,
    additions: 45,
    deletions: 8,
    files: [
      { filename: "src/github/templates.mjs", additions: 25, deletions: 4 },
      { filename: "test/webhook.test.mjs", additions: 20, deletions: 4 }
    ],
    checks: [{ name: "test", conclusion: "success" }],
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
      ],
      pullRequests: [
        {
          number: 77,
          title: "webhook: expose dry-run label preview",
          body: "Adds label preview output to dry-run webhook responses.",
          state: "open",
          files: ["src/github/templates.mjs"],
          htmlUrl: "https://github.example/pull/77"
        }
      ],
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
