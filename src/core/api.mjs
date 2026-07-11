import { availableProfiles, evaluateContribution } from "./evaluator.mjs";
import { FEEDBACK_VERDICTS } from "./feedback.mjs";
import { parsePatchSubmission } from "./patch.mjs";
import { DEFAULT_QUEUE_LIMIT, MAX_QUEUE_LIMIT, NEXT_ACTIONS, buildMaintainerQueue } from "./queue.mjs";
import { buildSetupGuide } from "./setup-guide.mjs";
import { buildSetupStatus } from "./setup.mjs";

export const API_VERSION = "2026-05-31";
export const DEFAULT_BATCH_LIMIT = 100;

export function createApiSpec({ dryRun = true, postComments = false, applyLabels = false, collectRepositoryContext = true } = {}) {
  return {
    ok: true,
    app: "premature-contribution-firewall",
    apiVersion: API_VERSION,
    dryRun,
    postComments,
    applyLabels,
    collectRepositoryContext,
    profiles: availableProfiles(),
    limits: {
      requestBodyBytes: 2_000_000,
      batchItems: DEFAULT_BATCH_LIMIT,
      queueItems: MAX_QUEUE_LIMIT,
      defaultQueueItems: DEFAULT_QUEUE_LIMIT
    },
    endpoints: [
      {
        method: "GET",
        path: "/api/health",
        description: "Read service health and dry-run posture."
      },
      {
        method: "GET",
        path: "/api/profiles",
        description: "List available review profiles."
      },
      {
        method: "POST",
        path: "/api/evaluate",
        description: "Evaluate one normalized GitHub issue or pull request payload."
      },
      {
        method: "POST",
        path: "/api/evaluate-patch",
        description: "Evaluate one plain-text patch or mbox submission. Defaults to kernel-grade."
      },
      {
        method: "POST",
        path: "/api/evaluate-batch",
        description: "Evaluate up to 100 pull requests, issues, or patch texts in one request."
      },
      {
        method: "GET",
        path: "/api/benchmark",
        description: "Run the deterministic maintainer benchmark corpus and return machine-readable results."
      },
      {
        method: "POST",
        path: "/api/github/queue",
        description: "Evaluate supplied queue items or collect a read-only dry-run queue with coarse actions, nextAction actor ownership, evidence, and action-lane groups for a GitHub repository."
      },
      {
        method: "GET",
        path: "/api/github/setup",
        description: "Read sanitized GitHub App, webhook, write-safety, and queue-history setup status."
      },
      {
        method: "GET",
        path: "/api/github/setup/guide",
        description: "Read a zero-to-first-dry-run GitHub App pilot guide with sanitized env values and exact commands."
      },
      {
        method: "POST",
        path: "/api/github/test-connection",
        description: "Test read-only access to a GitHub repository without posting comments or labels."
      },
      {
        method: "GET",
        path: "/api/queue/history",
        description: "Read recent local queue-history runs and status transitions."
      },
      {
        method: "POST",
        path: "/api/feedback",
        description: "Record a maintainer correction or agreement as a local evidence case file."
      },
      {
        method: "GET",
        path: "/api/feedback",
        description: "List recent local maintainer feedback entries."
      },
      {
        method: "GET",
        path: "/api/feedback/summary",
        description: "Summarize maintainer agreement, correction pressure, and regression candidates."
      },
      {
        method: "GET",
        path: "/api/feedback/calibration",
        description: "Build an auditable local calibration profile from maintainer feedback and promoted candidate fixtures."
      },
      {
        method: "GET",
        path: "/api/feedback/export",
        description: "Export maintainer corrections as regression-fixture candidates; manual fixture input is still required."
      },
      {
        method: "GET",
        path: "/api/feedback/candidates",
        description: "List locally promoted feedback fixture candidates and their replay health."
      },
      {
        method: "POST",
        path: "/api/feedback/candidates/apply",
        description: "Promote selected runnable feedback fixture drafts into the local candidate corpus."
      },
      {
        method: "GET",
        path: "/api/feedback/candidates/replay",
        description: "Replay the local feedback candidate corpus against the current evaluator."
      },
      {
        method: "GET",
        path: "/api/feedback/candidates/export",
        description: "Export a shareable markdown evidence artifact and JSON fixture bundle for promoted candidates."
      },
      {
        method: "POST",
        path: "/api/feedback/candidates/compare",
        description: "Compare a caller-supplied replay baseline against the current feedback candidate replay."
      },
      {
        method: "GET",
        path: "/api/repositories/:owner/:repo/queue",
        description: "Collect and evaluate a read-only dry-run maintainer queue for one GitHub repository, including nextAction owner/action/evidence groups."
      },
      {
        method: "POST",
        path: "/webhook/github",
        description: "GitHub webhook endpoint. Dry-run by default unless explicitly configured."
      }
    ],
    schemas: {
      evaluate: {
        kind: "pull_request | issue",
        title: "string",
        body: "string",
        profile: "standard | kernel-grade",
        files: [{ filename: "string", additions: "number", deletions: "number", patch: "string optional" }],
        checks: [{ name: "string", conclusion: "success | failure | skipped | neutral" }],
        repositoryFiles: [{ path: "string", content: "string" }],
        repositoryContext: {
          issues: [{ number: "number", title: "string", body: "string", state: "open | closed", labels: ["string"], htmlUrl: "string" }],
          pullRequests: [{ number: "number", title: "string", body: "string", state: "open | closed | merged", files: ["string"] }],
          upstream: {
            repository: "owner/repo",
            issues: "same shape as issues",
            pullRequests: "same shape as pullRequests",
            commits: [{ sha: "string", title: "string", body: "string", htmlUrl: "string" }],
            releases: [{ tagName: "string", title: "string", body: "string", htmlUrl: "string" }]
          }
        }
      },
      evaluatePatch: {
        text: "git format-patch or mbox text",
        profile: "kernel-grade",
        repositoryFiles: [{ path: "string", content: "string" }],
        repositoryContext: "same shape as /api/evaluate repositoryContext"
      },
      evaluateBatch: {
        items: [
          {
            id: "caller-owned id",
            input: "same as /api/evaluate, or omit and provide text/patchText",
            text: "optional patch/mbox text",
            profile: "optional profile override"
          }
        ]
      },
      githubQueue: {
        repository: "owner/repo",
        owner: "owner optional when repository is supplied",
        repo: "repo optional when repository is supplied",
        upstreamRepository: "optional upstream owner/repo",
        limit: `1-${MAX_QUEUE_LIMIT}`,
        includePullRequests: "boolean, default true",
        includeIssues: "boolean, default true",
        items: "optional supplied queue items; when present no GitHub network collection is required"
      },
      queueItem: {
        action: "review-now | send-repair-request | do-not-review-yet",
        nextAction: {
          ids: Object.keys(NEXT_ACTIONS),
          owner: "reporter | maintainer | process | external-state",
          target: "backward-compatible target actor string",
          maintainerAction: "concrete maintainer-facing next move",
          reason: "why this actor owns the next move",
          evidence: {
            labels: "labels/check labels that caused the route",
            checks: "failed or warning checks tied to those labels",
            reasons: "short explanation strings used in API, CLI, and UI"
          }
        },
        responseTemplate: {
          behavior: "dry-run maintainer response draft generated from nextAction evidence; never posted automatically",
          fields: "id, title, audience, channel, dryRun, posting, shouldPost, summary, body, checklist, evidence",
          safety: "dryRun is true, shouldPost is false, posting is disabled unless a deployment owner separately enables write flows outside the queue contract"
        },
        nextActionGroups: "queue-level lane summaries with counts, owner, maintainerAction, reviewBudgetMinutes, and itemIds"
      },
      githubSetup: {
        mode: "dry-run | read-only | write-armed",
        safety: "write posture without secret values",
        github: "sanitized GitHub App and webhook setup status",
        history: "queue history setup status",
        pilot: "ten-minute dry-run pilot steps, safe defaults, and blockers without secret values"
      },
      githubSetupGuide: {
        source: "config plus optional repository/baseUrl query",
        registration: "GitHub App fields, read-only permissions, webhook events, and install scope",
        env: "safe .env values with secret values redacted or generated client-side by command",
        commands: "local start, setup check, read-only connection test, fixture queue, and repository dry-run queue commands",
        endpoint: "GET /api/github/setup/guide"
      },
      queueHistory: {
        summary: "latest run counts and transition totals",
        entries: "compact queue run records with improved/regressed/new/unchanged item transitions"
      },
      feedback: {
        verdicts: FEEDBACK_VERDICTS,
        expectedStatus: "ready-for-maintainer | needs-repair | low-review-value",
        item: "queue item being corrected",
        originalPayload: "optional original PR, issue, or patch payload for runnable fixture draft export",
        note: "maintainer note, stored locally",
        shouldBecomeFixture: "boolean, defaults true for non-correct verdicts"
      },
      feedbackExport: {
        cases: "regression-fixture candidates derived from maintainer corrections",
        runnableFixture: "true when sanitized original payload is available and a benchmark-compatible fixture draft was created",
        needsManualFixtureInput: "true when the export does not contain enough original payload to become a runnable fixture draft",
        replay: "current evaluator result against the exported expectation"
      },
      feedbackCalibration: {
        source: "local maintainer feedback plus promoted feedback candidate fixtures",
        behavior: "advisory and auditable; it can add calibration labels and repair steps but does not hide the base heuristic score or status",
        matches: "candidate or feedback evidence matched by repository, item, kind, title tokens, labels, files, and profile",
        endpoint: "GET /api/feedback/calibration"
      },
      feedbackCandidates: {
        source: "local candidate corpus, separate from the permanent benchmark corpus",
        apply: "requires selected caseIds unless applyAllRunnable is true",
        replay: "benchmark-style replay results for promoted candidate fixtures",
        duplicateProtection: "candidate fixture ids are not appended twice",
        evidenceExport: "read-only markdown plus JSON fixture bundle for README, PR, or release-note evidence",
        replayCompare: "caller-supplied baseline replay compared with current replay; no server-side baseline storage"
      }
    }
  };
}

export function evaluateSubmission(payload = {}, options = {}) {
  payload = plainObject(payload);
  options = plainObject(options);
  const feedbackCalibration = payload.feedbackCalibration || options.feedbackCalibration || null;
  if (payload.text || payload.patchText || payload.kind === "patch") {
    const parsed = parsePatchSubmission(payload.text || payload.patchText || "", {
      profile: payload.profile || options.profile || "kernel-grade",
      repositoryFiles: payload.repositoryFiles || payload.policyFiles || []
    });
    parsed.repository = payload.repository || payload.input?.repository || "";
    parsed.repositoryContext = payload.repositoryContext || payload.repoContext || null;
    return evaluateContribution(parsed, {
      profile: payload.profile || options.profile || parsed.profile,
      feedbackCalibration
    });
  }

  return evaluateContribution(payload.input || payload, {
    profile: payload.profile || options.profile || payload.input?.profile || payload.reviewProfile,
    feedbackCalibration
  });
}

export function evaluateBatch(payload = {}, options = {}) {
  payload = plainObject(payload);
  options = plainObject(options);
  if (!Array.isArray(payload.items)) {
    return {
      ok: false,
      error: "items must be an array",
      limit: Number.isFinite(Number(options.limit)) ? Number(options.limit) : DEFAULT_BATCH_LIMIT,
      results: []
    };
  }

  const items = payload.items;
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : DEFAULT_BATCH_LIMIT;
  if (items.length > limit) {
    return {
      ok: false,
      error: `batch limit exceeded: ${items.length} item(s), limit ${limit}`,
      limit,
      results: []
    };
  }

  const results = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        id: String(index + 1),
        index,
        error: "batch item must be an object"
      };
    }
    try {
      const evaluation = evaluateSubmission(item.input ? { ...item.input, profile: item.profile || item.input.profile } : item, {
        profile: item.profile || payload.profile,
        feedbackCalibration: item.feedbackCalibration || payload.feedbackCalibration || options.feedbackCalibration
      });
      return {
        ok: true,
        id: item.id || String(index + 1),
        index,
        status: evaluation.status,
        score: evaluation.score,
        labels: evaluation.labels,
        profile: evaluation.profile.id,
        evaluation
      };
    } catch (error) {
      return {
        ok: false,
        id: item.id || String(index + 1),
        index,
        error: error.message
      };
    }
  });

  const failures = results.filter((item) => !item.ok).length;
  return {
    ok: failures === 0,
    summary: {
      requested: items.length,
      evaluated: results.length - failures,
      errors: failures,
      statuses: results.filter((item) => item.ok).reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {})
    },
    results
  };
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function evaluateMaintainerQueue(payload = {}, options = {}) {
  return buildMaintainerQueue(payload, options);
}

export function createSetupStatus(config = {}) {
  return buildSetupStatus(config);
}

export function createSetupGuide(config = {}, options = {}) {
  return buildSetupGuide(config, options);
}
