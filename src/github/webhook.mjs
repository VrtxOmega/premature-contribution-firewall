import { createHmac, timingSafeEqual } from "node:crypto";
import { evaluateContribution } from "../core/evaluator.mjs";
import { formatWebhookDryRun } from "./templates.mjs";

const PR_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review", "edited"]);
const ISSUE_ACTIONS = new Set(["opened", "reopened", "edited"]);

export function verifyGitHubSignature({ secret, rawBody, signatureHeader }) {
  if (!secret) return { ok: true, skipped: true };
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "missing sha256 signature" };
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = signatureHeader.slice("sha256=".length).toLowerCase();
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  if (expectedBuffer.length !== suppliedBuffer.length) {
    return { ok: false, reason: "signature length mismatch" };
  }
  const ok = timingSafeEqual(expectedBuffer, suppliedBuffer);
  return ok ? { ok: true, skipped: false } : { ok: false, reason: "signature mismatch" };
}

export async function handleGitHubWebhook({ headers, rawBody, config = {}, githubClient = null }) {
  const signature = verifyGitHubSignature({
    secret: config.webhookSecret,
    rawBody,
    signatureHeader: headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"]
  });
  if (!signature.ok) {
    return { statusCode: 401, body: { ok: false, error: signature.reason } };
  }

  const event = headers["x-github-event"] || headers["X-GitHub-Event"] || "unknown";
  const delivery = headers["x-github-delivery"] || headers["X-GitHub-Delivery"] || "";
  const payload = JSON.parse(rawBody.toString("utf8"));
  const action = payload.action || "";

  if (event === "pull_request" && !PR_ACTIONS.has(action)) {
    return { statusCode: 202, body: { ok: true, ignored: true, event, action, delivery } };
  }
  if (event === "issues" && !ISSUE_ACTIONS.has(action)) {
    return { statusCode: 202, body: { ok: true, ignored: true, event, action, delivery } };
  }
  if (!["pull_request", "issues"].includes(event)) {
    return { statusCode: 202, body: { ok: true, ignored: true, event, action, delivery } };
  }

  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const installationId = payload.installation?.id;
  const normalized = normalizeWebhookPayload(event, payload);
  if (config.collectRepositoryContext !== false && githubClient?.collectRepositoryContext && owner && repo) {
    try {
      normalized.repositoryContext = await githubClient.collectRepositoryContext({
        owner,
        repo,
        number: normalized.number,
        kind: normalized.kind,
        title: normalized.title,
        body: normalized.body,
        files: normalized.files || [],
        installationId,
        upstreamRepository: config.upstreamRepository || ""
      });
    } catch (error) {
      normalized.repositoryContext = {
        source: "github-api",
        repository: `${owner}/${repo}`,
        upstreamRepository: config.upstreamRepository || "",
        error: error.message
      };
    }
  }

  const evaluation = evaluateContribution(normalized);
  const dryRun = config.dryRun !== false;
  const number = normalized.number;
  const effects = [];

  if (dryRun || !githubClient || !installationId) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        dryRun: true,
        signature,
        delivery,
        evaluation,
        github: formatWebhookDryRun({ owner, repo, number, event, action, evaluation })
      }
    };
  }

  if (config.postComments) {
    const comment = await githubClient.postIssueComment({
      owner,
      repo,
      issueNumber: number,
      body: evaluation.comment,
      installationId
    });
    effects.push({ type: "comment", id: comment?.id || null });
  }

  if (config.applyLabels) {
    const labels = await githubClient.applyLabels({
      owner,
      repo,
      issueNumber: number,
      labels: evaluation.labels,
      installationId
    });
    effects.push({ type: "labels", count: Array.isArray(labels) ? labels.length : evaluation.labels.length });
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      dryRun: false,
      signature,
      delivery,
      evaluation,
      effects
    }
  };
}

export function normalizeWebhookPayload(event, payload) {
  if (event === "issues") {
    const issue = payload.issue || {};
    return {
      kind: "issue",
      title: issue.title || "",
      body: issue.body || "",
      labels: issue.labels || [],
      authorAssociation: issue.author_association || "",
      htmlUrl: issue.html_url || "",
      number: issue.number,
      repository: repositoryName(payload.repository)
    };
  }

  const pr = payload.pull_request || {};
  return {
    kind: "pull_request",
    title: pr.title || "",
    body: pr.body || "",
    authorAssociation: pr.author_association || "",
    draft: Boolean(pr.draft),
    labels: pr.labels || [],
    changedFiles: pr.changed_files || 0,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    htmlUrl: pr.html_url || "",
    number: pr.number,
    repository: repositoryName(payload.repository),
    checks: payload.checks || [],
    contributingText: payload.contributingText || ""
  };
}

function repositoryName(repository) {
  if (!repository) return "";
  const owner = repository.owner?.login || repository.owner?.name || "";
  return owner && repository.name ? `${owner}/${repository.name}` : repository.full_name || "";
}
