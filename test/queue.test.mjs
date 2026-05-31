import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMaintainerQueue,
  classifyNextAction,
  evaluateQueueItem,
  formatMaintainerQueueMarkdown
} from "../src/core/queue.mjs";
import { buildFeedbackCalibration } from "../src/core/calibration.mjs";

test("maintainer queue summarizes ready, repair, and low-value work", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const queue = buildMaintainerQueue(fixture, { now: "2026-05-30T00:00:00Z" });

  assert.equal(queue.ok, true);
  assert.equal(queue.dryRun, true);
  assert.equal(queue.repository, "VrtxOmega/premature-contribution-firewall-demo");
  assert.equal(queue.summary.total, 3);
  assert.equal(queue.summary.statuses["ready-for-maintainer"], 1);
  assert.equal(queue.summary.statuses["needs-repair"], 1);
  assert.equal(queue.summary.statuses["low-review-value"], 1);
  assert.equal(queue.summary.contextFindings, 3);
  assert.equal(queue.summary.calibrationMatches, 0);
  assert.equal(queue.summary.nextActions["review-now"], 1);
  assert.equal(queue.summary.nextActions["check-duplicate-or-fixed-first"], 1);
  assert.equal(queue.summary.nextActions["ask-reporter-for-evidence"], 1);
  assert.equal(queue.summary.nextActionOwners.maintainer, 2);
  assert.equal(queue.summary.nextActionOwners.reporter, 1);
  assert.equal(queue.summary.repairSubActions["check-duplicate-or-fixed-first"], 1);
  assert.equal(queue.summary.repairSubActions["ask-reporter-for-evidence"], 1);
  assert.ok(queue.nextActionGroups.some((group) => group.id === "check-duplicate-or-fixed-first" && group.count === 1));
  assert.equal(queue.items[0].status, "ready-for-maintainer");
  assert.equal(queue.items[0].nextAction.id, "review-now");
  assert.equal(queue.items[0].nextAction.maintainerAction, "Start normal review now.");
  assert.equal(queue.items[1].action, "send-repair-request");
  assert.equal(queue.items[1].nextAction.id, "check-duplicate-or-fixed-first");
  assert.ok(queue.items[1].nextAction.evidence.labels.includes("possibly-duplicate"));
  assert.ok(queue.items[1].labels.includes("possibly-duplicate"));
  assert.ok(queue.markdown.includes("Maintainer Queue"));
  assert.ok(queue.markdown.includes("Next actions:"));
  assert.ok(queue.markdown.includes("Next action lanes:"));
});

test("maintainer queue carries feedback calibration matches", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const calibration = buildFeedbackCalibration({
    repository: fixture.repository,
    candidates: [
      {
        id: "feedback-queue-12",
        repository: fixture.repository,
        kind: "pull_request",
        title: "webhook: reject oversized payload bodies",
        expectedStatus: "ready-for-maintainer",
        fixture: {
          input: {
            kind: "pull_request",
            repository: fixture.repository,
            title: "webhook: reject oversized payload bodies",
            files: [{ filename: "src/server.mjs" }]
          },
          expect: { status: "ready-for-maintainer" }
        },
        replay: {
          passed: true,
          actualStatus: "ready-for-maintainer",
          profile: "standard",
          labels: ["ready-for-maintainer"]
        }
      }
    ]
  });
  const queue = buildMaintainerQueue(fixture, {
    now: "2026-05-30T00:00:00Z",
    feedbackCalibration: calibration
  });

  assert.equal(queue.summary.calibrationMatches, 1);
  assert.equal(queue.summary.calibrationReviewNeeded, 0);
  assert.equal(queue.items[0].calibration.active, true);
  assert.match(queue.markdown, /Feedback calibration matches: 1/);
});

test("queue items preserve maintainer reasons and evaluation details", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const item = evaluateQueueItem(fixture.items[2]);

  assert.equal(item.kind, "issue");
  assert.equal(item.status, "low-review-value");
  assert.equal(item.action, "do-not-review-yet");
  assert.equal(item.nextAction.id, "ask-reporter-for-evidence");
  assert.ok(item.topReasons.some((reason) => reason.id === "reproducer"));
  assert.equal(item.evaluation.kind, "issue");
  assert.equal(item.fixtureInput.kind, "issue");
  assert.equal(item.fixtureInput.title, "Bug");
  assert.equal(item.fixtureInput.body.includes("vulnerability"), true);
});

test("queue repair sub-actions distinguish reporter, context, routing, maintainer, and waiting work", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const calibration = buildFeedbackCalibration({
    repository: "VrtxOmega/premature-contribution-firewall-demo",
    feedbackEntries: [
      {
        id: "decision-needed",
        repository: "VrtxOmega/premature-contribution-firewall-demo",
        item: {
          kind: "pull_request",
          number: 12,
          title: "webhook: reject oversized payload bodies",
          repository: "VrtxOmega/premature-contribution-firewall-demo",
          status: "ready-for-maintainer",
          labels: ["ready-for-maintainer"]
        },
        verdict: "too-lenient",
        expectedStatus: "needs-repair",
        note: "Maintainer wants to compare this exception before changing the heuristic."
      }
    ]
  });
  const payload = {
    repository: "VrtxOmega/premature-contribution-firewall-demo",
    items: [
      { ...fixture.items[0], repository: "VrtxOmega/premature-contribution-firewall-demo" },
      fixture.items[1],
      fixture.items[2],
      wrongRepositoryIssue(),
      backlogIssue()
    ],
    feedbackCalibration: calibration
  };
  const queue = buildMaintainerQueue(payload, { now: "2026-05-30T00:00:00Z" });
  const byId = Object.fromEntries(queue.items.map((item) => [item.id, item]));

  assert.equal(byId["pr-ready-small"].action, "review-now");
  assert.equal(byId["pr-ready-small"].nextAction.id, "needs-maintainer-decision");
  assert.equal(byId["pr-context-duplicate"].nextAction.id, "check-duplicate-or-fixed-first");
  assert.equal(byId["issue-low-evidence"].nextAction.id, "ask-reporter-for-evidence");
  assert.equal(byId["wrong-repository"].nextAction.id, "route-to-subsystem-or-process");
  assert.equal(byId["accepted-backlog"].nextAction.id, "not-actionable-yet");
  assert.equal(queue.summary.nextActions["needs-maintainer-decision"], 1);
  assert.equal(queue.summary.nextActions["check-duplicate-or-fixed-first"], 1);
  assert.equal(queue.summary.nextActions["ask-reporter-for-evidence"], 1);
  assert.equal(queue.summary.nextActions["route-to-subsystem-or-process"], 1);
  assert.equal(queue.summary.nextActions["not-actionable-yet"], 1);
  assert.equal(queue.summary.repairSubActions["check-duplicate-or-fixed-first"], 1);
  assert.equal(queue.summary.repairSubActions["ask-reporter-for-evidence"], 1);
  assert.equal(queue.summary.repairSubActions["route-to-subsystem-or-process"], 1);
  assert.equal(queue.summary.repairSubActions["not-actionable-yet"], 1);
});

test("queue response templates are dry-run drafts for every next-action lane", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const calibration = buildFeedbackCalibration({
    repository: "VrtxOmega/premature-contribution-firewall-demo",
    feedbackEntries: [
      {
        id: "decision-needed",
        repository: "VrtxOmega/premature-contribution-firewall-demo",
        item: {
          kind: "pull_request",
          number: 12,
          title: "webhook: reject oversized payload bodies",
          repository: "VrtxOmega/premature-contribution-firewall-demo",
          status: "ready-for-maintainer",
          labels: ["ready-for-maintainer"]
        },
        verdict: "too-lenient",
        expectedStatus: "needs-repair",
        note: "Maintainer wants to decide this exception."
      }
    ]
  });
  const queue = buildMaintainerQueue({
    repository: "VrtxOmega/premature-contribution-firewall-demo",
    items: [
      readyPr(),
      fixture.items[0],
      fixture.items[1],
      fixture.items[2],
      wrongRepositoryIssue(),
      backlogIssue()
    ],
    feedbackCalibration: calibration
  }, { now: "2026-05-30T00:00:00Z" });
  const byAction = Object.fromEntries(queue.items.map((item) => [item.nextAction.id, item]));

  for (const expected of [
    "review-now",
    "ask-reporter-for-evidence",
    "check-duplicate-or-fixed-first",
    "route-to-subsystem-or-process",
    "needs-maintainer-decision",
    "not-actionable-yet"
  ]) {
    const template = byAction[expected]?.responseTemplate;
    assert.ok(template, `missing response template for ${expected}`);
    assert.equal(template.id, expected);
    assert.equal(template.dryRun, true);
    assert.equal(template.shouldPost, false);
    assert.equal(template.posting, "disabled");
    assert.match(template.body, /PCF dry-run/);
    assert.match(template.body, /No comments, labels, closures, merges, or other GitHub writes were made automatically/);
  }

  assert.equal(byAction["ask-reporter-for-evidence"].responseTemplate.audience, "reporter");
  assert.equal(byAction["ask-reporter-for-evidence"].responseTemplate.channel, "github-comment-draft");
  assert.match(byAction["ask-reporter-for-evidence"].responseTemplate.body, /Please add or clarify/);
  assert.match(byAction["check-duplicate-or-fixed-first"].responseTemplate.body, /check related or already-fixed work/);
  assert.match(byAction["route-to-subsystem-or-process"].responseTemplate.body, /route this through project process/);
  assert.match(byAction["needs-maintainer-decision"].responseTemplate.body, /maintainer judgment is needed/);
  assert.match(byAction["not-actionable-yet"].responseTemplate.body, /stay out of active review/);
  assert.ok(queue.nextActionGroups.every((group) => group.responseTemplate?.dryRun === true));
});

test("queue nextAction reasons match the selected action family", () => {
  const contextFirst = classifyNextAction({
    status: "needs-repair",
    labels: ["duplicate-search-needed", "possibly-solved", "linked-issue-closed"],
    checks: []
  }, { coarseAction: "send-repair-request" });
  const parkedFirst = classifyNextAction({
    status: "needs-repair",
    labels: ["needs-technical-analysis", "maintainer-pending-clarification"],
    checks: []
  }, { coarseAction: "send-repair-request" });
  const routeFirst = classifyNextAction({
    status: "low-review-value",
    labels: ["needs-reproducer", "wrong-repository"],
    checks: []
  }, { coarseAction: "do-not-review-yet" });
  const maintainerOwned = classifyNextAction({
    status: "low-review-value",
    labels: ["needs-context", "maintainer-authored"],
    checks: []
  }, { coarseAction: "do-not-review-yet" });

  assert.equal(contextFirst.id, "check-duplicate-or-fixed-first");
  assert.match(contextFirst.reason, /Repository context label: possibly-solved/);
  assert.doesNotMatch(contextFirst.reason, /Reporter evidence label/);
  assert.equal(parkedFirst.id, "not-actionable-yet");
  assert.match(parkedFirst.reason, /Blocked or parked label: maintainer-pending-clarification/);
  assert.doesNotMatch(parkedFirst.reason, /Reporter evidence label/);
  assert.equal(routeFirst.id, "route-to-subsystem-or-process");
  assert.match(routeFirst.reason, /Routing or process label: wrong-repository/);
  assert.equal(maintainerOwned.id, "needs-maintainer-decision");
  assert.match(maintainerOwned.reason, /Maintainer-owned label: maintainer-authored/);
  assert.doesNotMatch(maintainerOwned.reason, /Reporter evidence label/);
});

test("queue markdown is README-ready", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/queue-sample.json", import.meta.url), "utf8"));
  const queue = buildMaintainerQueue(fixture, { now: "2026-05-30T00:00:00Z" });
  const markdown = formatMaintainerQueueMarkdown(queue);

  assert.match(markdown, /Ready: 1/);
  assert.match(markdown, /Needs repair: 1/);
  assert.match(markdown, /Low review value: 1/);
  assert.match(markdown, /check-duplicate-or-fixed-first: 1/);
  assert.match(markdown, /Next action: check-duplicate-or-fixed-first/);
  assert.match(markdown, /Next action lanes:/);
  assert.match(markdown, /next maintainer move: Check related/);
  assert.match(markdown, /Response draft:/);
  assert.match(markdown, /Duplicate or fixed-first check/);
  assert.match(markdown, /No comments, labels, closures, merges, or other GitHub writes were made automatically/);
  assert.match(markdown, /webhook: include labels in dry-run response/);
});

function readyPr() {
  return {
    id: "review-now-ready",
    kind: "pull_request",
    repository: "owner/repo",
    number: 99,
    title: "queue: show response drafts",
    body: [
      "Fixes #98.",
      "",
      "Problem: maintainers need dry-run response drafts.",
      "Change: expose copyable response templates.",
      "Verification: npm test passed locally.",
      "Risk: low because this only adds dry-run output."
    ].join("\n"),
    changedFiles: 1,
    additions: 18,
    deletions: 2,
    files: [{ filename: "src/core/queue.mjs", additions: 18, deletions: 2 }],
    checks: [{ name: "test", conclusion: "success" }],
    repositoryContext: {
      repository: "owner/repo",
      issues: [],
      pullRequests: []
    }
  };
}

function wrongRepositoryIssue() {
  return {
    id: "wrong-repository",
    kind: "issue",
    repository: "termux/termux-app",
    number: 100,
    title: "pip install cryptography fails",
    body: [
      "### Problem description",
      "Running pip install cryptography fails while building a wheel.",
      "",
      "### Steps to reproduce",
      "1. Open Termux.",
      "2. Run pip install cryptography.",
      "",
      "### Expected behavior",
      "The package installs.",
      "",
      "### Actual behavior",
      "The build fails in maturin with a Rust crate error.",
      "",
      "### System information",
      "Termux 0.118 on Android 14."
    ].join("\n"),
    repositoryContext: {
      repository: "termux/termux-app",
      issues: [],
      pullRequests: []
    }
  };
}

function backlogIssue() {
  return {
    id: "accepted-backlog",
    kind: "issue",
    repository: "owner/repo",
    number: 101,
    title: "Add long-term import scheduler",
    labels: ["status/icebox"],
    body: [
      "### Feature description",
      "Add a scheduler for long-running imports.",
      "",
      "### Why would this be helpful?",
      "Operators currently run imports manually during maintenance windows.",
      "",
      "### Alternatives",
      "Manual import remains possible."
    ].join("\n"),
    repositoryContext: {
      repository: "owner/repo",
      issues: [],
      pullRequests: []
    }
  };
}
