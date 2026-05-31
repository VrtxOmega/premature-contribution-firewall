import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildWatchlistReport,
  renderWatchlistMarkdown,
  renderWatchlistSummary
} from "../src/core/watchlist.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/run-watchlist.mjs", import.meta.url));

test("watchlist report aggregates candidate, blocked, unchecked, and disabled repos", () => {
  const report = buildWatchlistReport({
    config: {
      name: "Test radar",
      repositories: [
        { repository: "owner/repo", priority: "high" },
        { repository: "off/repo", enabled: false }
      ]
    },
    runs: [
      {
        entry: { repository: "owner/repo", priority: "high" },
        proof: proofFor("owner/repo", [
          candidateRow({ number: 1, status: "candidate" }),
          candidateRow({ number: 2, status: "blocked", blocker: "#9" }),
          candidateRow({ number: 3, status: "unchecked" })
        ])
      },
      {
        entry: { repository: "off/repo", enabled: false },
        disabled: true
      }
    ],
    generatedAt: "2026-05-31T12:00:00Z"
  });

  assert.equal(report.artifact, "pcf-watchlist-report");
  assert.equal(report.dryRun, true);
  assert.equal(report.summary.scanned, 1);
  assert.equal(report.summary.disabled, 1);
  assert.equal(report.summary.candidates, 1);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.unchecked, 1);
  assert.equal(report.candidates[0].status, "candidate");
  assert.match(report.nonClaims.join("\n"), /does not clone repositories/);
});

test("watchlist markdown and summary are operator-readable", () => {
  const report = buildWatchlistReport({
    config: {
      name: "Test radar",
      repositories: [{ repository: "owner/repo", priority: "high" }]
    },
    runs: [
      {
        entry: { repository: "owner/repo", priority: "high" },
        proof: proofFor("owner/repo", [candidateRow({ number: 7, status: "candidate" })])
      }
    ],
    generatedAt: "2026-05-31T12:00:00Z"
  });
  const markdown = renderWatchlistMarkdown(report);
  const summary = renderWatchlistSummary(report);

  assert.match(markdown, /PCF Watchlist Contribution Radar/);
  assert.match(markdown, /Candidate Queue/);
  assert.match(markdown, /current-upstream behavior/);
  assert.match(markdown, /No repositories were cloned/);
  assert.match(summary, /Candidates: 1/);
});

test("watchlist CLI runs fixture-backed repos without network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-watchlist-"));
  const fixturePath = join(dir, "queue.json");
  const configPath = join(dir, "watchlist.json");
  try {
    await writeFile(fixturePath, JSON.stringify({
      repository: "owner/repo",
      items: [readyIssue(101)]
    }), "utf8");
    await writeFile(configPath, JSON.stringify({
      name: "Fixture radar",
      defaults: {
        limit: 5,
        includeIssues: true,
        includePullRequests: false,
        contributorPreflight: true
      },
      repositories: [
        {
          repository: "owner/repo",
          priority: "high",
          fixture: "queue.json",
          preflightChecks: [
            {
              number: 101,
              pullRequests: []
            }
          ]
        },
        {
          repository: "disabled/repo",
          enabled: false
        }
      ]
    }), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--config",
      configPath,
      "--format",
      "json"
    ], { cwd: repoRoot });
    const report = JSON.parse(stdout);

    assert.equal(report.summary.scanned, 1);
    assert.equal(report.summary.disabled, 1);
    assert.equal(report.summary.candidates, 1);
    assert.equal(report.candidates[0].repository, "owner/repo");
    assert.equal(report.candidates[0].status, "candidate");

    const { stdout: overrideStdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--format",
      "markdown",
      "--config",
      configPath,
      "--format",
      "json"
    ], { cwd: repoRoot });
    assert.doesNotThrow(() => JSON.parse(overrideStdout));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function proofFor(repository, candidates) {
  return {
    repository,
    breakdown: {
      total: candidates.length,
      reviewNow: candidates.length
    },
    queue: {
      items: candidates.map((candidate) => ({
        id: candidate.id,
        kind: "issue",
        number: candidate.number,
        repository,
        title: candidate.title,
        htmlUrl: `https://github.example/${repository}/issues/${candidate.number}`,
        action: "review-now",
        status: "ready-for-maintainer",
        score: 100,
        labels: ["ready-for-maintainer"],
        contextSummary: "No repository-context blockers."
      }))
    },
    contributorPreflight: {
      enabled: true,
      summary: {
        total: candidates.length,
        checked: candidates.filter((candidate) => candidate.status !== "unchecked").length,
        candidate: candidates.filter((candidate) => candidate.status === "candidate").length,
        blocked: candidates.filter((candidate) => candidate.status === "blocked").length,
        unchecked: candidates.filter((candidate) => candidate.status === "unchecked").length
      },
      candidates
    }
  };
}

function candidateRow({ number, status, blocker = "" }) {
  return {
    id: `issue-${number}`,
    kind: "issue",
    number,
    title: `Issue ${number}`,
    htmlUrl: `https://github.example/owner/repo/issues/${number}`,
    status,
    checked: status !== "unchecked",
    collectionError: "",
    contributorAction: status === "candidate" ? "Run contribution policy and current-upstream behavior gates before coding." : "Inspect before coding.",
    reason: status === "candidate" ? "No exact open PR overlap." : "Preflight signal.",
    blockers: blocker ? [{ pullRequest: blocker, reason: "Open PR references issue." }] : []
  };
}

function readyIssue(number) {
  return {
    id: `issue-${number}`,
    kind: "issue",
    number,
    title: "Webhook returns 401 when signature header hex is uppercase",
    body: [
      "## Version",
      "commit 7ab12cd on main",
      "",
      "## Steps to reproduce",
      "1. Start the server with PCF_WEBHOOK_SECRET set.",
      "2. Send a payload signed with uppercase SHA-256 hex.",
      "3. Observe the webhook response.",
      "",
      "## Expected",
      "The signature verifies.",
      "",
      "## Actual",
      "The server returns 401.",
      "",
      "## Logs",
      "```text",
      "invalid webhook signature",
      "```",
      "",
      "## Duplicate search",
      "I searched existing issues for uppercase signature and webhook digest.",
      "",
      "## Technical analysis",
      "The likely root cause is strict digest normalization before timing-safe comparison."
    ].join("\n"),
    labels: ["bug"],
    repositoryContext: {
      source: "github-api",
      repository: "owner/repo",
      issues: [],
      pullRequests: [],
      upstream: {
        repository: "",
        issues: [],
        pullRequests: [],
        commits: [],
        releases: []
      }
    }
  };
}
