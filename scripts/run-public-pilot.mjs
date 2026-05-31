#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildPublicPilotProof, renderPublicPilotMarkdown, renderPublicPilotSummary } from "../src/core/pilot-proof.mjs";
import { buildSetupGuide } from "../src/core/setup-guide.mjs";
import { buildMaintainerQueue } from "../src/core/queue.mjs";
import { loadConfig } from "../src/config.mjs";
import { createGitHubClient } from "../src/github/client.mjs";

export const REPLAY_CAPTURE_VERSION = "2026.05.31";

export async function buildPublicPilotReport({
  repository,
  fixturePath = "",
  capturePath = "",
  limit = 10,
  includePullRequests = true,
  includeIssues = true,
  upstreamRepository = "",
  generatedAt = new Date().toISOString(),
  config = loadConfig(new URL("..", import.meta.url).pathname)
} = {}) {
  if (fixturePath) {
    const payload = JSON.parse(await readFile(fixturePath, "utf8"));
    const queuePayload = payload.queuePayload && typeof payload.queuePayload === "object" ? payload.queuePayload : payload;
    const queue = buildMaintainerQueue(queuePayload, {
      now: generatedAt,
      repository: repository || queuePayload.repository || "",
      source: queuePayload.source || "fixture"
    });
    const targetRepository = repository || queue.repository || queuePayload.repository || "owner/repo";
    if (capturePath) {
      await writeReplayCapture(capturePath, buildReplayCapture({
        repository: targetRepository,
        collected: queuePayload,
        target: payload.target || {},
        generatedAt,
        limit: queuePayload.limit || limit,
        includePullRequests: typeof queuePayload.includePullRequests === "boolean" ? queuePayload.includePullRequests : includePullRequests,
        includeIssues: typeof queuePayload.includeIssues === "boolean" ? queuePayload.includeIssues : includeIssues,
        upstreamRepository: queuePayload.upstreamRepository || upstreamRepository
      }));
    }
    return buildPublicPilotProof({
      repository: targetRepository,
      queue,
      collectionErrors: queuePayload.collectionErrors || [],
      setupGuide: buildSetupGuide(config, { repository: targetRepository }),
      config,
      generatedAt,
      limit
    });
  }

  const targetRepository = normalizeRepository(repository);
  if (!targetRepository) {
    throw new Error("--repository owner/repo is required unless --fixture is supplied.");
  }
  const [owner, repo] = targetRepository.split("/");
  const githubClient = createGitHubClient(config);
  const collected = await githubClient.collectRepositoryQueue({
    owner,
    repo,
    limit,
    includePullRequests,
    includeIssues,
    upstreamRepository
  });
  const queue = buildMaintainerQueue(collected, {
    now: generatedAt,
    source: "github-api",
    repository: targetRepository,
    upstreamRepository
  });
  const target = await safeReadRepositoryMetadata(githubClient, owner, repo);
  if (capturePath) {
    await writeReplayCapture(capturePath, buildReplayCapture({
      repository: targetRepository,
      collected,
      target,
      generatedAt,
      limit,
      includePullRequests,
      includeIssues,
      upstreamRepository
    }));
  }

  return buildPublicPilotProof({
    repository: targetRepository,
    queue,
    collectionErrors: collected.collectionErrors,
    setupGuide: buildSetupGuide(config, { repository: targetRepository }),
    config,
    generatedAt,
    limit,
    target
  });
}

export async function runPublicPilotCli(args = process.argv.slice(2)) {
  const repository = readOption(args, "--repository", "");
  const fixturePath = readOption(args, "--fixture", "");
  const capturePath = readOption(args, "--capture", "");
  const limit = clampNumber(readOption(args, "--limit", "10"), 10, 1, 100);
  const format = readOption(args, "--format", "summary");
  const writePath = readOption(args, "--write", "");
  const upstreamRepository = readOption(args, "--upstream", "");
  const includePullRequests = !args.includes("--no-pulls");
  const includeIssues = !args.includes("--no-issues");
  const failOnEmpty = args.includes("--fail-on-empty");

  if (!["summary", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format '${format}'. Use summary, json, or markdown.`);
  }

  const report = await buildPublicPilotReport({
    repository,
    fixturePath,
    capturePath,
    limit,
    includePullRequests,
    includeIssues,
    upstreamRepository
  });
  const output = format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : format === "markdown"
      ? renderPublicPilotMarkdown(report)
      : renderPublicPilotSummary(report);

  if (writePath) {
    await mkdir(dirname(writePath), { recursive: true });
    await writeFile(writePath, output, "utf8");
    process.stdout.write(`Wrote public pilot output to ${writePath}\n`);
  } else {
    process.stdout.write(output);
  }

  if (failOnEmpty && report.breakdown.total === 0) {
    process.exitCode = 1;
  }
  return report;
}

export function buildReplayCapture({
  repository = "",
  collected = {},
  target = {},
  generatedAt = new Date().toISOString(),
  limit = 10,
  includePullRequests = true,
  includeIssues = true,
  upstreamRepository = ""
} = {}) {
  return {
    artifact: "public-repo-pilot-replay-capture",
    captureVersion: REPLAY_CAPTURE_VERSION,
    generatedAt,
    repository: repository || collected.repository || "",
    upstreamRepository: upstreamRepository || collected.upstreamRepository || "",
    source: collected.source || "github-api",
    dryRun: collected.dryRun !== false,
    limit: Number(collected.limit || limit) || 10,
    includePullRequests: typeof collected.includePullRequests === "boolean" ? collected.includePullRequests : Boolean(includePullRequests),
    includeIssues: typeof collected.includeIssues === "boolean" ? collected.includeIssues : Boolean(includeIssues),
    target: {
      repository: repository || collected.repository || "",
      stars: target.stars || target.stargazers_count || 0,
      openIssuesAndPullRequests: target.openIssuesAndPullRequests || target.open_issues_count || 0,
      defaultBranch: target.defaultBranch || target.default_branch || "",
      htmlUrl: target.htmlUrl || target.html_url || ""
    },
    collectionErrors: Array.isArray(collected.collectionErrors) ? collected.collectionErrors : [],
    items: Array.isArray(collected.items) ? collected.items : []
  };
}

async function writeReplayCapture(capturePath, capture) {
  await mkdir(dirname(capturePath), { recursive: true });
  await writeFile(capturePath, `${JSON.stringify(capture, null, 2)}\n`, "utf8");
}

async function safeReadRepositoryMetadata(githubClient, owner, repo) {
  try {
    return await githubClient.request(`/repos/${owner}/${repo}`);
  } catch {
    return {};
  }
}

function readOption(values, flag, fallback = "") {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : fallback;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeRepository(repository) {
  const trimmed = String(repository || "").trim();
  if (!trimmed || !trimmed.includes("/")) return "";
  const [owner, repo] = trimmed.split("/");
  return owner && repo ? `${owner}/${repo}` : "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runPublicPilotCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
