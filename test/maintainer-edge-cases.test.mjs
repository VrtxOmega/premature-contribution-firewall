import test from "node:test";
import assert from "node:assert/strict";
import { ADVERSARIAL_CASES, runAdversary } from "../src/core/adversary.mjs";
import { BENCHMARK_CASES, runBenchmark } from "../src/core/benchmark.mjs";
import { evaluateContributorCandidate } from "../src/core/contributor-preflight.mjs";
import { evaluateContribution } from "../src/core/evaluator.mjs";
import { analyzeRepositoryContext } from "../src/core/repository-context.mjs";
import { classifyNextAction } from "../src/core/queue.mjs";

test("maintainer proof surfaces stay broad and green", () => {
  const benchmark = runBenchmark();
  const adversary = runAdversary();

  assert.equal(benchmark.benchmark.total, BENCHMARK_CASES.length);
  assert.equal(benchmark.benchmark.passed, BENCHMARK_CASES.length);
  assert.equal(adversary.adversary.total, ADVERSARIAL_CASES.length);
  assert.equal(adversary.adversary.passed, ADVERSARIAL_CASES.length);

  const benchmarkCategories = new Set(BENCHMARK_CASES.map((item) => item.category));
  for (const category of [
    "standard-pr",
    "issue",
    "repo-policy",
    "repo-context",
    "kernel-grade",
    "patch-series",
    "tool-use",
    "review-budget"
  ]) {
    assert.ok(benchmarkCategories.has(category), `missing benchmark category ${category}`);
  }

  const repoContextCases = BENCHMARK_CASES.filter((item) => item.category === "repo-context");
  assert.ok(repoContextCases.length >= 12, `expected at least 12 repo-context benchmark cases, got ${repoContextCases.length}`);

  const adversaryCategories = new Set(ADVERSARIAL_CASES.map((item) => item.category));
  for (const category of ["duplicate-evasion", "context-evasion", "queue-explanation", "queue-actor"]) {
    assert.ok(adversaryCategories.has(category), `missing adversarial category ${category}`);
  }
});

test("maintainer prior-work matrix: explicit duplicate of closed issue", () => {
  const result = evaluateContribution({
    kind: "issue",
    number: 99,
    title: "Webhook dry-run response omits would-post labels",
    body: "Duplicate of #42. Same bug still happens on current main.",
    repositoryContext: {
      repository: "owner/repo",
      issues: [
        {
          number: 42,
          title: "Dry-run response omits would-post labels",
          body: "Fixed by #55.",
          state: "closed",
          labels: ["fixed"]
        }
      ]
    }
  });

  assert.ok(result.labels.includes("linked-issue-closed"));
  assert.ok(result.labels.includes("possibly-solved"));
  assert.equal(result.repositoryContext.findings.length >= 1, true);
});

test("maintainer prior-work matrix: title similarity against closed issue without explicit reference", () => {
  const analysis = analyzeRepositoryContext({
    kind: "issue",
    title: "Dry-run webhook response omits would-post labels",
    body: "Steps to reproduce: run dry-run webhook. Actual: labels missing.",
    repositoryContext: {
      repository: "owner/repo",
      issues: [
        {
          number: 1,
          title: "Dry-run webhook response omits would-post labels",
          state: "closed",
          labels: ["fixed"],
          body: "Closed after release 0.1.1."
        }
      ]
    }
  });

  assert.ok(analysis.labels.includes("possibly-solved"));
  assert.ok(analysis.similarClosedIssues.length >= 1);
});

test("maintainer prior-work matrix: upstream release notes already fixed the failure mode", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Crash on empty patch body",
    body: [
      "Steps to reproduce:",
      "1. Submit an empty patch through evaluate-patch.",
      "Expected: parser returns a repair checklist.",
      "Actual: process crashes.",
      "Environment: Node 22."
    ].join("\n"),
    repositoryContext: {
      repository: "owner/repo",
      upstream: {
        repository: "upstream/repo",
        releases: [
          {
            tagName: "v1.2.0",
            title: "v1.2.0",
            body: "Fixed crash on empty patch body in #500.",
            state: "published"
          }
        ]
      }
    }
  });

  assert.ok(result.labels.includes("possibly-upstream-fixed"));
  assert.ok(result.repositoryContext.upstreamSolved.length >= 1);
});

test("maintainer prior-work matrix: merged local pull request already landed similar work", () => {
  const result = evaluateContribution({
    kind: "pull_request",
    title: "webhook: include labels in dry-run response",
    body: "Fixes #41. Verification: npm test passed locally.",
    files: [{ filename: "src/github/templates.mjs" }],
    checks: [{ name: "ci", conclusion: "success" }],
    repositoryContext: {
      repository: "owner/repo",
      pullRequests: [
        {
          number: 88,
          title: "webhook: include labels in dry-run response",
          state: "merged",
          files: ["src/github/templates.mjs"],
          body: "Merged fix for dry-run labels."
        }
      ]
    }
  });

  assert.ok(result.labels.includes("possibly-solved"));
  assert.ok(result.repositoryContext.similarClosedPullRequests?.length >= 1);
});

test("maintainer prior-work matrix: draft concurrent pull request still blocks fresh review", () => {
  const result = evaluateContribution({
    kind: "pull_request",
    title: "webhook: expose dry-run label preview",
    body: "Fixes #41. Verification: npm test passed locally.",
    files: [{ filename: "src/github/templates.mjs" }],
    checks: [{ name: "ci", conclusion: "success" }],
    repositoryContext: {
      repository: "owner/repo",
      pullRequests: [
        {
          number: 77,
          title: "webhook: expose dry-run label preview",
          state: "open",
          draft: true,
          files: ["src/github/templates.mjs"]
        }
      ]
    }
  });

  assert.ok(result.labels.includes("concurrent-work"));
});

test("maintainer prior-work matrix: follow-up language cannot hide same-bug recurrence", () => {
  const result = evaluateContribution({
    kind: "issue",
    number: 200,
    title: "Broken files do not show up in Hidden",
    body: "Follow-up to #5389. Same bug: broken files still missing from Hidden tab after import.",
    repositoryContext: {
      repository: "photoprism/photoprism",
      issues: [
        {
          number: 5389,
          title: "Broken files do not show up in Hidden",
          state: "open",
          body: "Original report still open.",
          labels: ["bug"]
        }
      ]
    }
  });

  assert.ok(result.labels.includes("possibly-duplicate"));
  assert.equal(result.repositoryContext.similarOpenIssues.length >= 1, true);
});

test("maintainer prior-work matrix: structured follow-up still stays reviewable", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Videos: Improve and verify hardware transcoding with FFmpeg 8",
    authorAssociation: "MEMBER",
    body: [
      "#5630 tracked and fixed the VAAPI regression specifically; this issue covers the broader follow-up work to verify all hardware encoders on FFmpeg 8.",
      "### Acceptance Criteria",
      "- [x] VA-API transcoding MUST initialize a filter device."
    ].join("\n"),
    repositoryContext: {
      repository: "photoprism/photoprism",
      issues: [
        {
          number: 5630,
          title: "Videos: VAAPI transcoding not working in latest release",
          state: "open",
          labels: ["please-test", "video"]
        }
      ]
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("possibly-duplicate"), false);
});

test("maintainer prior-work matrix: repository context failures are surfaced", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Queue export omits nextAction counts",
    body: [
      "Steps to reproduce:",
      "1. Run the maintainer queue against a saved fixture.",
      "Expected: summary includes nextAction counts.",
      "Actual: counts are missing."
    ].join("\n"),
    repositoryContext: {
      hasContext: true,
      source: "github-search",
      repository: "owner/repo",
      error: "GitHub API rate limit exceeded"
    }
  });

  assert.ok(result.labels.includes("repo-context-unavailable"));
  assert.match(result.repositoryContext.summary, /rate limit exceeded/i);
});

test("maintainer queue routing: duplicate context beats reporter evidence", () => {
  const action = classifyNextAction({
    status: "needs-repair",
    labels: ["duplicate-search-needed", "possibly-solved", "linked-issue-closed"],
    checks: []
  }, { coarseAction: "send-repair-request" });

  assert.equal(action.id, "check-duplicate-or-fixed-first");
  assert.match(action.reason, /Repository context label: possibly-solved/);
  assert.doesNotMatch(action.reason, /Reporter evidence label/);
});

test("maintainer queue routing: concurrent work routes to maintainer context check", () => {
  const action = classifyNextAction({
    status: "needs-repair",
    labels: ["possibly-duplicate", "concurrent-work", "needs-reproducer"],
    checks: []
  }, { coarseAction: "send-repair-request" });

  assert.equal(action.id, "check-duplicate-or-fixed-first");
  assert.match(action.reason, /Repository context label/);
});

test("contributor preflight edge cases: partial issue numbers do not false-positive", () => {
  const blocked = evaluateContributorCandidate(
    { id: "issue-1", kind: "issue", number: 1, title: "Parser edge case", repository: "owner/repo", action: "review-now" },
    {
      number: 1,
      pullRequests: [
        {
          number: 10,
          title: "Unrelated work",
          body: "Touches issue tracker #10 only.",
          state: "open"
        }
      ]
    }
  );

  assert.equal(blocked.status, "candidate");
});

test("contributor preflight edge cases: draft open pull requests still block", () => {
  const blocked = evaluateContributorCandidate(
    { id: "issue-42", kind: "issue", number: 42, title: "Fix plugin install fallback", repository: "docker/cli", action: "review-now" },
    {
      number: 42,
      pullRequests: [
        {
          number: 7010,
          title: "Fix plugin install fallback",
          body: "Closes #42",
          state: "open",
          draft: true
        }
      ]
    }
  );

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers[0].id, "open-pr-references-issue");
});