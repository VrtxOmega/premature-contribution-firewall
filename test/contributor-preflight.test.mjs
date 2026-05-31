import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContributorPreflight,
  evaluateContributorCandidate
} from "../src/core/contributor-preflight.mjs";

test("contributor preflight blocks review-now issue candidates with open PR ownership", () => {
  const proof = {
    queue: {
      items: [
        reviewNowIssue({ number: 7005, title: "Fix plugin install fallback" }),
        reviewNowIssue({ number: 42, title: "Improve command output" }),
        {
          id: "issue-9",
          kind: "issue",
          number: 9,
          title: "Needs reporter details",
          action: "send-repair-request"
        }
      ]
    }
  };

  const preflight = buildContributorPreflight({
    proof,
    checks: [
      {
        number: 7005,
        pullRequests: [
          {
            number: 7010,
            title: "Fix plugin install fallback",
            body: "Closes #7005",
            state: "open",
            htmlUrl: "https://github.com/docker/cli/pull/7010"
          }
        ]
      },
      {
        number: 42,
        pullRequests: []
      }
    ],
    generatedAt: "2026-05-31T12:00:00Z"
  });

  assert.equal(preflight.summary.total, 2);
  assert.equal(preflight.summary.checked, 2);
  assert.equal(preflight.summary.blocked, 1);
  assert.equal(preflight.summary.candidate, 1);
  assert.equal(preflight.summary.unchecked, 0);
  assert.equal(preflight.candidates[0].status, "blocked");
  assert.equal(preflight.candidates[0].blockers[0].id, "open-pr-references-issue");
  assert.match(preflight.candidates[0].contributorAction, /Do not clone or code/);
  assert.equal(preflight.candidates[1].status, "candidate");
  assert.match(preflight.nonClaims.join("\n"), /not permission to code/);
});

test("contributor preflight keeps unchecked state when exact PR overlap was not collected", () => {
  const preflight = buildContributorPreflight({
    proof: {
      queue: {
        items: [reviewNowIssue({ number: 123, title: "Missing scout result" })]
      }
    },
    checks: []
  });

  assert.equal(preflight.summary.total, 1);
  assert.equal(preflight.summary.checked, 0);
  assert.equal(preflight.summary.unchecked, 1);
  assert.equal(preflight.candidates[0].status, "unchecked");
  assert.match(preflight.candidates[0].contributorAction, /manual contributor preflight/);
});

test("contributor preflight recognizes same-repo URLs and ignores closed PRs", () => {
  const blocked = evaluateContributorCandidate(
    reviewNowIssue({ number: 77, repository: "owner/repo" }),
    {
      number: 77,
      pullRequests: [
        {
          number: 80,
          title: "Follow-up fix",
          body: "See https://github.com/owner/repo/issues/77",
          state: "open"
        }
      ]
    }
  );
  const closed = evaluateContributorCandidate(
    reviewNowIssue({ number: 88, repository: "owner/repo" }),
    {
      number: 88,
      pullRequests: [
        {
          number: 89,
          title: "Old attempt",
          body: "Fixes owner/repo#88",
          state: "closed"
        }
      ]
    }
  );

  assert.equal(blocked.status, "blocked");
  assert.equal(closed.status, "candidate");
});

function reviewNowIssue({ number, title = "Review-ready issue", repository = "docker/cli" } = {}) {
  return {
    id: `issue-${number}`,
    kind: "issue",
    number,
    title,
    repository,
    htmlUrl: `https://github.com/${repository}/issues/${number}`,
    action: "review-now"
  };
}
