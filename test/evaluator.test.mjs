import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution, renderMarkdownReport } from "../src/core/evaluator.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}

test("unready pull request is blocked before maintainer review", async () => {
  const result = evaluateContribution(await fixture("pr-unready"));
  assert.equal(result.kind, "pull_request");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.score < 50);
  assert.ok(result.labels.includes("too-broad"));
  assert.ok(result.labels.includes("needs-tests"));
  assert.ok(result.labels.includes("secrets-risk"));
  assert.ok(result.repairSteps.some((step) => step.includes("Split unrelated work")));
});

test("ready pull request passes as reviewable", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.blockers.length, 0);
  assert.ok(result.strengths.some((item) => item.includes("test")));
  assert.equal(result.profile.id, "standard");
  assert.ok(result.reviewBudget.minutes > 0);
});

test("unready issue requires reproducer and real evidence", async () => {
  const result = evaluateContribution(await fixture("issue-unready"));
  assert.equal(result.kind, "issue");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-reproducer"));
  assert.ok(result.labels.includes("needs-real-evidence"));
  assert.ok(result.blockers.some((check) => check.id === "reproducer"));
});

test("ready issue has enough evidence for maintainer attention", async () => {
  const result = evaluateContribution(await fixture("issue-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
});

test("device support report with logs and repository context is reviewable", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Request support for Meaco Sefte Pro Fan",
    labels: [{ name: "new device" }, { name: "log provided" }],
    body: [
      "### Log message",
      "",
      "```text",
      "Device matches meaco_seftepro_fan with quality of 101%.",
      "LOCAL DPS: {\"1\": true, \"2\": \"Normal\", \"3\": 1}",
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
      "entities:",
      "  - entity: fan",
      "```"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "make-all/tuya-local",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.equal(result.labels.includes("duplicate-search-needed"), false);
  assert.ok(result.strengths.some((item) => item.includes("device identity")));
});

test("complete feature request is evaluated as a feature request, not a bug report", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Notion Integration",
    labels: [{ name: "enhancement" }],
    body: [
      "### Describe the feature you'd like to request",
      "",
      "I’d like floccus to support direct syncing with Notion, so bookmarks can be pushed/pulled to Notion databases without using an intermediate service.",
      "Current workflow: I sync bookmarks from floccus to Linkwarden, then pull them into Notion. This adds complexity and an extra point of failure.",
      "Use case: keep a central, searchable Notion database of bookmarks with tags, notes, and original metadata.",
      "",
      "### Describe the solution you'd like",
      "",
      "Add a Notion connector that authenticates with Notion, lets users choose a target database, maps bookmark fields to Notion properties, supports incremental sync, and respects rate limits.",
      "",
      "### Describe alternatives you've considered",
      "",
      "- Continue using Linkwarden as an intermediary.",
      "- Export/import bookmarks manually into Notion.",
      "- Use a dedicated bookmarking service with native Notion support."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "floccusaddon/floccus",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.ok(result.checks.some((check) => check.id === "feature-use-case" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "feature-solution" && check.status === "pass"));
  assert.ok(result.strengths.some((item) => item.includes("feature use case")));
});

test("thin feature request still needs repair before maintainer review", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Dark mode",
    labels: [{ name: "enhancement" }],
    body: "Please add dark mode."
  });

  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-use-case"));
  assert.ok(result.blockers.some((check) => check.id === "feature-use-case"));
});

test("feature request with problem and requested behavior does not require alternatives", () => {
  const result = evaluateContribution({
    kind: "issue",
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
      source: "github-api",
      repository: "knadh/listmonk",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-feature-scope"), false);
  assert.ok(result.checks.some((check) => check.id === "feature-scope" && check.status === "pass"));
});

test("markdown report includes status, labels, repairs, and marker", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  const markdown = renderMarkdownReport(result);
  assert.match(markdown, /Premature Contribution Firewall Review Readiness/);
  assert.match(markdown, /Profile:/);
  assert.match(markdown, /Review budget:/);
  assert.match(markdown, /ready-for-maintainer/);
  assert.match(markdown, /Repair Checklist/);
  assert.match(markdown, /<!-- premature-contribution-firewall-review -->/);
});

test("kernel-grade ready patch passes strict maintainer profile", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-ready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.provenance.signedOff, true);
  assert.ok(result.checks.some((check) => check.id === "dco-signoff" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "kernel-build-evidence" && check.status === "pass"));
});

test("kernel-grade unready patch blocks before maintainer attention", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-unready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-dco-signoff"));
  assert.ok(result.labels.includes("needs-tool-provenance"));
  assert.ok(result.labels.includes("review-budget-high"));
  assert.ok(result.blockers.some((check) => check.id === "dco-signoff"));
});

test("repository policy files make ready submissions easier to route", async () => {
  const result = evaluateContribution(await fixture("pr-policy-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.policyProfile.hasPolicy, true);
  assert.ok(result.policyProfile.sources.some((source) => source.type === "codeowners"));
  assert.ok(result.policyProfile.testCommands.includes("npm test"));
  assert.ok(result.policyProfile.ownerMatches.some((match) => match.owners.includes("@maintainers/core")));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "pass"));
});

test("repository policy files block submissions that ignore local rules", async () => {
  const result = evaluateContribution(await fixture("pr-policy-unready"));
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("policy-failed"));
  assert.ok(result.labels.includes("needs-project-test-command"));
  assert.ok(result.checks.some((check) => check.id === "policy" && check.status === "fail"));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "fail"));
});
