import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContribution } from "../src/core/evaluator.mjs";
import { enrichWithMaintainerStack } from "../src/core/maintainer-stack.mjs";
import { resolveShieldedPosture } from "../src/core/shielded-posture.mjs";
import { formatReadinessComment } from "../src/github/templates.mjs";
import { classifyNextAction } from "../src/core/queue.mjs";

test("default evaluation stays backward compatible without maintainer stack", () => {
  const result = evaluateContribution({
    kind: "pull_request",
    title: "Fix websocket reconnect timeout",
    body: [
      "Fixes #42",
      "",
      "The websocket client stopped reconnecting after 30s idle.",
      "This restores the backoff loop and adds a regression test.",
      "",
      "Verification:",
      "- npm test",
      "- manual reconnect test on staging"
    ].join("\n"),
    files: [{ filename: "src/ws/client.js", additions: 12, deletions: 4 }],
    checks: [{ name: "ci", conclusion: "success" }]
  });

  assert.equal(result.shieldedPosture?.stackEnabled, false);
  assert.equal(result.maintainerStack, null);
  assert.equal(result.readinessComment, "");
});

test("shielded high assurance enables maintainer stack layers", () => {
  const result = evaluateContribution({
    kind: "pull_request",
    title: "fix",
    body: "quick fix",
    headRef: "fix",
    files: [{ filename: "src/a.js", patch: "password = 'password'" }],
    authorContext: { login: "burst-user", recentPrs24h: 6, accountAgeDays: 14 },
    repositoryFiles: [{
      path: "CONTRIBUTING.md",
      content: "All pull requests must link to an issue before review."
    }]
  }, { shielded: true, assuranceLevel: "high" });

  assert.equal(result.shieldedPosture.shielded, true);
  assert.equal(result.shieldedPosture.assuranceLevel, "high");
  assert.equal(result.shieldedPosture.stackEnabled, true);
  assert.ok(result.maintainerStack);
  assert.ok(result.labels.includes("behavioral-risk"));
  assert.ok(result.labels.includes("high-pr-volume"));
  assert.ok(result.labels.includes("missing-linked-issue"));
  assert.ok(result.readinessComment.includes("PCF readiness summary"));
  assert.match(result.comment, /Maintainer stack/);
});

test("strict issue forms fail when required sections are missing", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Crash on startup",
    body: "It crashes sometimes.",
    repositoryFiles: [{
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      content: [
        "## Description",
        "## Tests",
        "## Linked issue"
      ].join("\n")
    }]
  }, { shielded: true, assuranceLevel: "high" });

  assert.ok(result.maintainerStack.issueForm);
  assert.equal(result.maintainerStack.issueForm.checkStatus, "fail");
  assert.ok(result.labels.includes("issue-form-incomplete"));
});

test("semantic duplicate assist stays deterministic and degraded", () => {
  const enriched = enrichWithMaintainerStack({
    kind: "issue",
    title: "websocket reconnect timeout regression",
    body: "Client fails to reconnect after idle timeout in production.",
    duplicateAssistCandidates: [{
      number: 42,
      title: "websocket reconnect timeout fails after idle",
      body: "Reconnect loop never restarts once the socket idles out.",
      state: "open"
    }]
  }, {
    kind: "issue",
    status: "needs-repair",
    score: 70,
    labels: ["needs-repair"],
    checks: [],
    repositoryContext: { hasContext: false, findings: [] }
  }, {
    shielded: true,
    assuranceLevel: "high"
  });

  assert.ok(enriched.maintainerStack.duplicateAssist.enabled);
  assert.equal(enriched.maintainerStack.duplicateAssist.deterministic, true);
  assert.ok(enriched.maintainerStack.duplicateAssist.suggestions.length >= 1);
});

test("vouch context reads VOUCHED.td without changing authorship claims", () => {
  const enriched = enrichWithMaintainerStack({
    kind: "pull_request",
    title: "Add retry helper",
    body: "Adds bounded retry helper for flaky network calls. Ran npm test.",
    author: "alice",
    repositoryFiles: [{
      path: ".github/VOUCHED.td",
      content: "github:alice vouched by maintainer\n-github:spammy denounced"
    }]
  }, {
    kind: "pull_request",
    status: "ready-for-maintainer",
    score: 90,
    labels: ["ready-for-maintainer"],
    checks: [],
    policyProfile: { hasPolicy: false }
  }, { shielded: true });

  assert.equal(enriched.maintainerStack.vouch.status, "vouched");
  assert.ok(enriched.shieldedPosture.nonClaims.some((line) => line.includes("not AI-authorship")));
});

test("queue routes behavioral and linked-issue labels to reporter evidence", () => {
  const nextAction = classifyNextAction({
    status: "needs-repair",
    labels: ["behavioral-risk", "missing-linked-issue"],
    checks: [
      { status: "fail", label: "missing-linked-issue", title: "Linked issue policy", reason: "missing" }
    ]
  });

  assert.equal(nextAction.id, "ask-reporter-for-evidence");
});

test("resolveShieldedPosture stays off unless explicitly enabled", () => {
  const posture = resolveShieldedPosture({}, {});
  assert.equal(posture.stackEnabled, false);
  assert.equal(posture.behavioralSignals, false);
});

test("formatReadinessComment includes assurance and repair guidance", () => {
  const comment = formatReadinessComment({
    result: {
      status: "needs-repair",
      score: 72,
      summary: "Needs repair before maintainer review.",
      repairSteps: ["Link the pull request to an issue."]
    },
    posture: resolveShieldedPosture({ shielded: true }, {}),
    maintainerStack: {
      author: { enabled: true, summary: "Author context (maintainer-only): author alice, trust band medium." }
    }
  });

  assert.match(comment, /High assurance/);
  assert.match(comment, /Author context/);
  assert.match(comment, /Repair before review/);
});