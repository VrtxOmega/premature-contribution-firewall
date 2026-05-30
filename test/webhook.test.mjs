import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  handleGitHubWebhook,
  normalizeWebhookPayload,
  verifyGitHubSignature
} from "../src/github/webhook.mjs";

test("signature verification accepts uppercase hex", () => {
  const rawBody = Buffer.from(JSON.stringify({ ok: true }));
  const digest = createHmac("sha256", "secret").update(rawBody).digest("hex").toUpperCase();
  const result = verifyGitHubSignature({
    secret: "secret",
    rawBody,
    signatureHeader: `sha256=${digest}`
  });
  assert.equal(result.ok, true);
});

test("signature verification rejects mismatches", () => {
  const result = verifyGitHubSignature({
    secret: "secret",
    rawBody: Buffer.from("{}"),
    signatureHeader: "sha256=deadbeef"
  });
  assert.equal(result.ok, false);
});

test("pull request webhook payload normalizes to evaluator input", () => {
  const payload = samplePullRequestPayload();
  const normalized = normalizeWebhookPayload("pull_request", payload);
  assert.equal(normalized.kind, "pull_request");
  assert.equal(normalized.title, payload.pull_request.title);
  assert.equal(normalized.changedFiles, 2);
  assert.equal(normalized.repository, "VrtxOmega/premature-contribution-firewall-demo");
});

test("dry-run webhook returns evaluation and would-post details", async () => {
  const payload = samplePullRequestPayload();
  const rawBody = Buffer.from(JSON.stringify(payload));
  const digest = createHmac("sha256", "secret").update(rawBody).digest("hex");
  const result = await handleGitHubWebhook({
    headers: {
      "x-hub-signature-256": `sha256=${digest}`,
      "x-github-event": "pull_request",
      "x-github-delivery": "delivery-1"
    },
    rawBody,
    config: {
      webhookSecret: "secret",
      dryRun: true
    }
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.dryRun, true);
  assert.equal(result.body.evaluation.status, "needs-repair");
  assert.equal(result.body.github.repository, "VrtxOmega/premature-contribution-firewall-demo");
  assert.match(result.body.github.wouldPostComment, /Premature Contribution Firewall Review Readiness/);
});

test("webhook can collect read-only repository context before evaluation", async () => {
  const payload = samplePullRequestPayload();
  const rawBody = Buffer.from(JSON.stringify(payload));
  const digest = createHmac("sha256", "secret").update(rawBody).digest("hex");
  const calls = [];
  const githubClient = {
    async collectRepositoryContext(args) {
      calls.push(args);
      return {
        source: "github-api",
        repository: `${args.owner}/${args.repo}`,
        issues: [
          {
            number: 6,
            title: "Issue webhooks were ignored",
            body: "Fixed by a newer webhook handler.",
            state: "closed",
            labels: ["fixed"]
          }
        ],
        pullRequests: []
      };
    }
  };

  const result = await handleGitHubWebhook({
    headers: {
      "x-hub-signature-256": `sha256=${digest}`,
      "x-github-event": "pull_request",
      "x-github-delivery": "delivery-2"
    },
    rawBody,
    config: {
      webhookSecret: "secret",
      dryRun: true,
      collectRepositoryContext: true,
      upstreamRepository: "upstream/premature-contribution-firewall-demo"
    },
    githubClient
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].owner, "VrtxOmega");
  assert.equal(calls[0].repo, "premature-contribution-firewall-demo");
  assert.equal(calls[0].upstreamRepository, "upstream/premature-contribution-firewall-demo");
  assert.equal(result.body.evaluation.repositoryContext.hasContext, true);
  assert.ok(result.body.evaluation.labels.includes("possibly-solved"));
});

function samplePullRequestPayload() {
  return {
    action: "opened",
    installation: { id: 123 },
    repository: {
      name: "premature-contribution-firewall-demo",
      owner: { login: "VrtxOmega" }
    },
    pull_request: {
      number: 7,
      title: "Fix webhook handling for issue events",
      body: "Fixes #6.\n\nProblem: issue webhooks were ignored.\n\nVerification: npm test.",
      author_association: "CONTRIBUTOR",
      draft: false,
      changed_files: 2,
      additions: 40,
      deletions: 8,
      html_url: "https://github.com/VrtxOmega/premature-contribution-firewall-demo/pull/7"
    }
  };
}
