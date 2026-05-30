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
