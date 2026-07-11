import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildSeriousCandidateScout,
  defaultSeriousSearchQueries,
  renderSeriousScoutMarkdown
} from "../src/core/serious-scout.mjs";
import { runSeriousScout } from "../scripts/run-serious-scout.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/run-serious-scout.mjs", import.meta.url));

test("serious scout ranks reproducible high-impact bugs above cosmetic noise", () => {
  const report = buildSeriousCandidateScout({
    generatedAt: "2026-06-20T12:00:00Z",
    collection: verifiedCollection(),
    issues: [
      seriousIssue(),
      cosmeticIssue(),
      thinCrashIssue()
    ],
    minScore: 0
  });

  assert.equal(report.artifact, "pcf-serious-candidate-scout");
  assert.equal(report.summary.total, 3);
  assert.equal(report.candidates[0].repository, "runtime/core");
  assert.equal(report.candidates[0].status, "candidate");
  assert.equal(report.candidates[0].seriousness, "high");
  assert.equal(report.automation.status, "PROMOTE");
  assert.equal(report.candidates.find((row) => row.repository === "docs/site").status, "blocked");
  assert.equal(report.candidates.find((row) => row.repository === "runtime/thin").status, "review");
});

test("serious scout blocks feature requests without concrete bug impact", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    issues: [
      {
        repository: "owner/product",
        number: 55,
        title: "Feature request: add support for custom dashboard colors",
        body: "It would be nice to support custom colors and theme presets.",
        labels: ["enhancement", "good first issue"],
        html_url: "https://github.example/owner/product/issues/55"
      }
    ],
    minScore: 0
  });

  assert.equal(report.candidates[0].status, "blocked");
  assert.equal(report.automation.status, "NO_ACTION");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "feature-or-process-request"));
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "not-serious-enough"));
});

test("serious scout blocks generated tracker noise even when it has scary words", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "agent-lab/AutoTrader_Codex",
        number: 58,
        title: "[autoworker] Tracker: crash memory with auto-suggested fix injection",
        body: "Design plan-review tracker with suggested fix injection and QA full playthrough notes. Expected generated worker to continue.",
        labels: ["bug"],
        html_url: "https://github.example/agent-lab/AutoTrader_Codex/issues/58"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "generated-issue-noise"));
});

test("serious scout blocks bot-created CI/E2E issue reports", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "Christ-Roy/veridian-analytics-engine",
        number: 22,
        title: "E2E regression: BUG-01 setup.initialize locked [staging] @critical @bug-01 POST /api/setup.initialize -> 4xx",
        body: [
          "_Issue créée automatiquement par `scripts/ci/e2e-report-to-issues.mjs`. Ne pas modifier manuellement._",
          "",
          "Test échoué encore.",
          "Run: https://github.com/Christ-Roy/veridian-analytics-engine/actions/runs/123",
          "Expected: 200.",
          "Actual: 4xx.",
          "Logs show the staging precondition failed."
        ].join("\n"),
        author: { login: "app/github-actions", type: "Bot" },
        labels: ["bug"],
        html_url: "https://github.example/Christ-Roy/veridian-analytics-engine/issues/22"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "automated-ci-issue"));
});

test("serious scout blocks maintainer-owned issue streams without invitation labels", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "SauersML/gam",
        number: 979,
        title: "marginal-slope severe slowdown and survival hang in gamfit",
        body: [
          "Steps to reproduce are included with a minimal repro.",
          "Expected: fit completes within the budget.",
          "Actual: survival marginal-slope hangs until timeout.",
          "Version: gamfit 0.1.189.",
          "Stack trace and logs show the inner joint-Newton solve grinding."
        ].join("\n"),
        author: { login: "SauersML", type: "User" },
        author_association: "OWNER",
        labels: ["bug"],
        html_url: "https://github.example/SauersML/gam/issues/979"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "maintainer-owned-without-invitation"));
});

test("serious scout allows maintainer-authored issues with explicit invitation labels", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    issues: [
      {
        repository: "owner/project",
        number: 42,
        title: "Crash in parser on escaped import regression",
        body: [
          "Steps to reproduce: run parser on fixtures/escaped-import.case.",
          "Expected: import graph resolves.",
          "Actual: panic with stack trace in src/parser/imports.rs.",
          "Version: main commit abc123.",
          "Maintainers marked this as help wanted."
        ].join("\n"),
        author_association: "OWNER",
        labels: ["bug", "help wanted"],
        html_url: "https://github.example/owner/project/issues/42"
      }
    ],
    minScore: 0
  });

  assert.equal(report.candidates[0].status, "candidate");
  assert.equal(report.automation.status, "PROMOTE");
});

test("serious scout blocks contest mentorship issues that require assignment first", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "Ayushh-Sharmaa/NexaSphere",
        number: 2497,
        title: "Bug: Homepage Crash Caused by Undefined SkillExchangePage and navigate References",
        body: [
          "Description: The homepage fails to render due to undefined references.",
          "Steps to Reproduce: start the application and open the homepage.",
          "Expected Behavior: homepage renders successfully.",
          "Actual Behavior: homepage crashes due to undefined references.",
          "Before you start working: wait for triage and get officially assigned.",
          "PRs submitted without being assigned will be automatically closed."
        ].join("\n"),
        labels: ["bug", "good first issue", "GSSoC'26", "level:beginner", "mentor:Ayushh-Sharmaa", "needs-labels"],
        html_url: "https://github.example/Ayushh-Sharmaa/NexaSphere/issues/2497"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "program-assignment-workflow"));
});

test("serious scout blocks platform compatibility lanes without code scope", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "ValveSoftware/Proton",
        number: 3931,
        title: "Sea Of Thieves (1172620)",
        body: "Regression after update. The game crashes on startup with GPU driver logs, but the report only describes local runtime behavior and no code area is identified.",
        labels: ["bug"],
        html_url: "https://github.example/ValveSoftware/Proton/issues/3931"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "platform-compatibility-risk"));
});

test("serious scout does not treat library source-path bugs as platform compatibility", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "kornia/kornia",
        number: 3580,
        title: "[Bug]: median_blur crashes on empty batch while sibling filters handle it correctly",
        body: [
          "`kornia.filters.median_blur` crashes with RuntimeError when given `torch.empty(0, 1, 64, 64)`.",
          "Root cause: in `kornia/filters/median.py`, line 68, `features.view(b, c, -1, h, w)` cannot infer -1 when the batch has 0 elements.",
          "Steps to Reproduce: call `kornia.filters.median_blur(empty, (3, 3))`.",
          "Expected: returns an empty tensor with shape `(0, 1, 64, 64)`.",
          "Actual: RuntimeError: cannot reshape tensor of 0 elements.",
          "Environment: PyTorch 2.10.0+cpu, GPU model: N/A."
        ].join("\n"),
        labels: ["bug", "help wanted"],
        html_url: "https://github.example/kornia/kornia/issues/3580"
      }
    ],
    minScore: 0
  });

  assert.equal(report.candidates[0].status, "candidate");
  assert.ok(!report.candidates[0].blockers.some((blocker) => blocker.id === "platform-compatibility-risk"));
});

test("serious scout blocks library bugs already claimed by the reporter", () => {
  const report = buildSeriousCandidateScout({
    issues: [
      {
        repository: "kornia/kornia",
        number: 3580,
        title: "[Bug]: median_blur crashes on empty batch while sibling filters handle it correctly",
        body: [
          "`kornia.filters.median_blur` crashes with RuntimeError when given `torch.empty(0, 1, 64, 64)`.",
          "Root cause: in `kornia/filters/median.py`, line 68, `features.view(b, c, -1, h, w)` cannot infer -1 when the batch has 0 elements.",
          "Steps to Reproduce: call `kornia.filters.median_blur(empty, (3, 3))`.",
          "Expected: returns an empty tensor with shape `(0, 1, 64, 64)`.",
          "Actual: RuntimeError: cannot reshape tensor of 0 elements.",
          "Environment: PyTorch 2.10.0+cpu, GPU model: N/A.",
          "Contribution Intent:",
          "- [x] I plan to submit a PR to fix this bug"
        ].join("\n"),
        labels: ["bug", "help wanted"],
        html_url: "https://github.example/kornia/kornia/issues/3580"
      }
    ],
    minScore: 0
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "claimed-work"));
  assert.ok(!report.candidates[0].blockers.some((blocker) => blocker.id === "platform-compatibility-risk"));
});

test("serious scout keeps legitimate agent-runtime bugs and negated ownership", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    issues: [{
      ...seriousIssue(),
      repository: "owner/agent-runtime",
      number: 303,
      title: "Agent runtime crashes in parser loop",
      body: `${seriousIssue().body}\nNobody is working on this and I do not plan to submit a PR.`,
      labels: ["bug", "help wanted"]
    }]
  });

  assert.equal(report.automation.status, "PROMOTE");
  assert.equal(report.candidates[0].status, "candidate");
  assert.ok(!report.candidates[0].blockers.some((blocker) => blocker.id === "generated-issue-noise"));
  assert.ok(!report.candidates[0].blockers.some((blocker) => blocker.id === "claimed-work"));
});

test("serious scout detects claimed work split by zero-width controls", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    issues: [{
      ...seriousIssue(),
      body: `${seriousIssue().body}\nI plan to sub\u200Bmit a PR.`
    }]
  });

  assert.equal(report.automation.status, "NO_ACTION");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "claimed-work"));
});

test("serious scout fails closed when GitHub issue search is incomplete", async () => {
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    githubClient: {
      async searchOpenIssues() {
        return { items: [seriousIssue()], incompleteResults: true, totalCount: 500 };
      }
    }
  });

  assert.equal(report.summary.candidate, 1);
  assert.equal(report.collection.complete, false);
  assert.equal(report.collection.incompleteResults, 1);
  assert.equal(report.automation.status, "NO_ACTION");
  assert.match(report.automation.reason, /partial search results/i);
});

test("serious scout stops remaining issue queries after an exhausted rate limit", async () => {
  const calls = [];
  const report = await runSeriousScout({
    queries: ["first-query", "rate-limited-query", "must-not-run-query"],
    githubClient: {
      async searchOpenIssues({ query }) {
        calls.push(query);
        if (query === "rate-limited-query") {
          throw new Error("GitHub API 403 Forbidden: You have exceeded a secondary rate limit.");
        }
        return { items: [seriousIssue()], incompleteResults: false };
      }
    }
  });

  assert.deepEqual(calls, ["first-query", "rate-limited-query"]);
  assert.equal(report.collection.complete, false);
  assert.equal(report.collection.errors.length, 1);
  assert.match(report.collection.errors[0].message, /secondary rate limit/i);
  assert.equal(report.automation.status, "NO_ACTION");
});

test("serious scout fails closed when open-PR overlap collection fails", async () => {
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    githubClient: {
      async searchOpenIssues() {
        return { items: [seriousIssue()], incompleteResults: false };
      },
      async searchOpenPullRequests() {
        throw new Error("GitHub API 403 secondary rate limit");
      }
    }
  });

  assert.equal(report.overlap.complete, false);
  assert.equal(report.overlap.failed, 1);
  assert.equal(report.candidates[0].status, "review");
  assert.ok(report.candidates[0].warnings.some((warning) => warning.id === "overlap-unverified"));
  assert.equal(report.automation.status, "NO_ACTION");
});

test("serious scout stops later candidate overlap searches after an exhausted rate limit", async () => {
  const calls = [];
  const secondIssue = {
    ...seriousIssue(),
    repository: "runtime/other",
    number: 102,
    html_url: "https://github.example/runtime/other/issues/102"
  };
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    maxOverlapChecks: 25,
    githubClient: {
      async searchOpenIssues() {
        return { items: [seriousIssue(), secondIssue], incompleteResults: false };
      },
      async searchOpenPullRequests(args) {
        calls.push(args);
        throw new Error("GitHub API 403 Forbidden: You have exceeded a secondary rate limit.");
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(report.overlap.failed, 1);
  assert.equal(report.overlap.unchecked, 1);
  assert.equal(report.automation.status, "NO_ACTION");
});

test("serious scout fails closed when open-PR overlap search is truncated", async () => {
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    githubClient: {
      async searchOpenIssues() {
        return { items: [seriousIssue()], incompleteResults: false };
      },
      async searchOpenPullRequests() {
        const results = [];
        Object.defineProperty(results, "totalCount", { value: 42 });
        return results;
      }
    }
  });

  assert.equal(report.overlap.complete, false);
  assert.equal(report.overlap.failed, 1);
  assert.equal(report.candidates[0].status, "review");
  assert.equal(report.automation.status, "NO_ACTION");
  assert.match(report.overlap.errors[0].message, /truncated/);
});

test("serious scout infers required overlap from per-issue error state", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    issues: [{
      ...seriousIssue(),
      overlapStatus: "error",
      overlapCollectionError: "GitHub API 403"
    }]
  });

  assert.equal(report.overlap.required, true);
  assert.equal(report.overlap.complete, false);
  assert.equal(report.automation.status, "NO_ACTION");
});

test("serious scout markdown documents gates and non-claims", () => {
  const report = buildSeriousCandidateScout({
    collection: verifiedCollection(),
    sourceQueries: defaultSeriousSearchQueries().slice(0, 2),
    issues: [seriousIssue()]
  });
  const markdown = renderSeriousScoutMarkdown(report);

  assert.match(markdown, /PCF Serious Candidate Scout/);
  assert.match(markdown, /Search Queries/);
  assert.match(markdown, /Automation verdict: PROMOTE/);
  assert.match(markdown, /current-upstream repro/);
  assert.match(markdown, /No repositories were cloned/);
});

test("serious scout exposes a maintainer-grade evidence-heavy preset", () => {
  const queries = defaultSeriousSearchQueries("maintainer-grade");

  assert.ok(queries.length >= 5);
  assert.ok(queries.every((query) => query.includes("comments:>2")));
  assert.ok(queries.some((query) => query.includes('"steps to reproduce"')));
  assert.ok(queries.some((query) => query.includes('"expected" "actual"')));
  assert.ok(queries.every((query) => query.includes("-author:app/github-actions")));
});

test("serious scout CLI runs fixture-backed broad-search artifact without network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pcf-serious-scout-"));
  const fixturePath = join(dir, "issues.json");
  const outputPath = join(dir, "serious-scout.json");
  try {
    await writeFile(fixturePath, JSON.stringify({ issues: [cosmeticIssue(), seriousIssue()] }), "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--fixture",
      fixturePath,
      "--format",
      "json",
      "--write",
      outputPath
    ], { cwd: repoRoot });

    assert.match(stdout, /Wrote serious scout output/);
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.candidate, 1);
    assert.equal(report.summary.cosmeticBlocked, 1);
    assert.equal(report.automation.status, "PROMOTE");
    assert.equal(report.candidates[0].repository, "runtime/core");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("serious scout live collector can enrich open PR overlap by code identifier", async () => {
  const calls = [];
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    limit: 1,
    perQueryLimit: 1,
    checkPrOverlap: true,
    githubClient: {
      async searchOpenIssues() {
        return {
          items: [
            {
              repository: "nuxt/nuxt",
              number: 35312,
              title: "refreshNuxtData(key) can be delayed inside modal because it waits for requestIdleCallback",
              body: [
                "Regression in Nuxt 4.4.7 with steps to reproduce.",
                "The public utility hangs until timeout inside modal and portal UI work.",
                "The affected path is packages/nuxt/src/app/composables/asyncData.ts.",
                "Expected: `refreshNuxtData` starts promptly.",
                "Actual: `refreshNuxtData` waits for `requestIdleCallback`.",
                "The slow part is the `onNuxtReady` gate."
              ].join("\n"),
              labels: ["good first issue"],
              html_url: "https://github.example/nuxt/nuxt/issues/35312"
            }
          ]
        };
      },
      async searchOpenPullRequests({ query }) {
        calls.push(query);
        if (query === "refreshNuxtData") {
          return [{ number: 35358, title: "fix(nuxt): avoid idle wait when refreshing data after hydration", htmlUrl: "https://github.example/nuxt/nuxt/pull/35358" }];
        }
        return [];
      }
    }
  });

  assert.ok(calls.includes("#35312"));
  assert.ok(calls.includes("refreshNuxtData"));
  assert.equal(report.automation.status, "NO_ACTION");
  assert.equal(report.candidates[0].status, "blocked");
  assert.ok(report.candidates[0].blockers.some((blocker) => blocker.id === "open-pr-overlap"));
});

test("serious scout overlap checks prioritize preliminary candidates over raw search order", async () => {
  const calls = [];
  const filler = Array.from({ length: 8 }, (_, index) => ({
    repository: "owner/noise",
    number: index + 1,
    title: `Typo in docs ${index + 1}`,
    body: "Fix README spelling and documentation wording.",
    labels: ["docs"],
    html_url: `https://github.example/owner/noise/issues/${index + 1}`
  }));
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    limit: 20,
    perQueryLimit: 20,
    checkPrOverlap: true,
    maxOverlapChecks: 1,
    githubClient: {
      async searchOpenIssues() {
        return {
          items: [
            ...filler,
            {
              repository: "nuxt/nuxt",
              number: 35312,
              title: "refreshNuxtData(key) can be delayed inside modal because it waits for requestIdleCallback",
              body: [
                "Regression in Nuxt 4.4.7 with steps to reproduce.",
                "The public utility hangs for many seconds inside modal/portal UI work.",
                "The likely code path is packages/nuxt/src/app/composables/asyncData.ts.",
                "Expected: `refreshNuxtData` starts promptly.",
                "Actual: `refreshNuxtData` waits for `requestIdleCallback`.",
                "Direct app:data:refresh completes quickly, so this is a timeout/hang in the readiness gate."
              ].join("\n"),
              labels: ["good first issue"],
              html_url: "https://github.example/nuxt/nuxt/issues/35312"
            }
          ]
        };
      },
      async searchOpenPullRequests({ repository, query }) {
        calls.push({ repository, query });
        return query === "refreshNuxtData"
          ? [{ number: 35358, title: "fix(nuxt): avoid idle wait when refreshing data after hydration", htmlUrl: "https://github.example/nuxt/nuxt/pull/35358" }]
          : [];
      }
    }
  });

  assert.equal(calls[0].repository, "nuxt/nuxt");
  assert.equal(report.automation.status, "NO_ACTION");
  assert.ok(report.candidates.find((row) => row.repository === "nuxt/nuxt").blockers.some((blocker) => blocker.id === "open-pr-overlap"));
});

test("serious scout overlap budget ignores blocked filler after candidate coverage", async () => {
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    maxOverlapChecks: 1,
    githubClient: {
      async searchOpenIssues() {
        return {
          items: [seriousIssue(), cosmeticIssue()],
          incompleteResults: false
        };
      },
      async searchOpenPullRequests() {
        return [];
      }
    }
  });

  assert.equal(report.overlap.complete, true);
  assert.equal(report.overlap.checked, 1);
  assert.equal(report.overlap.unchecked, 0);
  assert.equal(report.automation.status, "PROMOTE");
});

test("serious scout never spends overlap searches on already-blocked rows", async () => {
  const calls = [];
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    maxOverlapChecks: 25,
    githubClient: {
      async searchOpenIssues() {
        return {
          items: [seriousIssue(), cosmeticIssue()],
          incompleteResults: false
        };
      },
      async searchOpenPullRequests({ repository, query }) {
        calls.push({ repository, query });
        return [];
      }
    }
  });

  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.repository === "runtime/core"));
  assert.equal(report.overlap.checked, 1);
  assert.equal(report.automation.status, "PROMOTE");
});

test("serious scout checks review rows only when no candidate exists", async () => {
  const calls = [];
  const reviewIssue = {
    ...seriousIssue(),
    repository: "runtime/review",
    number: 103,
    body: `${seriousIssue().body}\nThis was initially reported as a feature request.`,
    html_url: "https://github.example/runtime/review/issues/103"
  };
  const report = await runSeriousScout({
    queries: ["fixture-query"],
    checkPrOverlap: true,
    githubClient: {
      async searchOpenIssues() {
        return { items: [reviewIssue, cosmeticIssue()], incompleteResults: false };
      },
      async searchOpenPullRequests({ repository, query }) {
        calls.push({ repository, query });
        return [];
      }
    }
  });

  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => call.repository === "runtime/review"));
  assert.equal(report.overlap.checked, 1);
  assert.equal(report.summary.candidate, 0);
  assert.equal(report.automation.status, "NO_ACTION");
});

function seriousIssue() {
  return {
    repository: "runtime/core",
    number: 101,
    title: "Crash when parser handles nested imports after 2.4.0 regression",
    body: [
      "Version: 2.4.1 on main commit abcd1234.",
      "Steps to reproduce:",
      "1. Run `runtime parse fixtures/nested-imports.case`.",
      "2. Observe the process aborts with panic: assertion failed in src/parser/imports.rs.",
      "Expected: parser returns the same module graph as 2.3.9.",
      "Actual: crash with stack trace and failing test case attached.",
      "Logs:",
      "thread main panicked at src/parser/imports.rs:144"
    ].join("\n"),
    labels: ["bug", "regression", "confirmed"],
    html_url: "https://github.example/runtime/core/issues/101"
  };
}

function cosmeticIssue() {
  return {
    repository: "docs/site",
    number: 7,
    title: "Fix typo and README bullet indentation",
    body: "There is a typo in the documentation and one bullet indentation has extra whitespace.",
    labels: ["good first issue", "docs"],
    html_url: "https://github.example/docs/site/issues/7"
  };
}

function thinCrashIssue() {
  return {
    repository: "runtime/thin",
    number: 12,
    title: "Crash in startup",
    body: "It crashes sometimes.",
    labels: ["bug"],
    html_url: "https://github.example/runtime/thin/issues/12"
  };
}

function verifiedCollection() {
  return {
    source: "fixture",
    complete: true,
    queries: 0,
    incompleteResults: 0,
    errors: []
  };
}
