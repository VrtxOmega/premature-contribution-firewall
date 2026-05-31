#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { buildPublicPilotProof, renderPublicPilotMarkdown, renderPublicPilotSummary } from "../src/core/pilot-proof.mjs";
import { buildMaintainerExportBundle, renderMaintainerExportMarkdown } from "../src/core/pilot-proof.mjs";
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
  const bundlePath = readOption(args, "--bundle", "");
  const baselinePath = readOption(args, "--baseline", "");
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

  if (bundlePath) {
    const replayPayload = await readReplayPayloadForHash({ fixturePath, capturePath });
    const baselineProof = baselinePath ? await readBaselineProof(baselinePath) : null;
    const bundle = buildMaintainerExportBundle({
      proof: report,
      baselineProof,
      replayPayload: replayPayload?.payload || null,
      replayPayloadLabel: replayPayload?.label || "",
      commands: buildBundleCommandSet({
        repository: report.repository || repository,
        fixturePath,
        capturePath,
        bundlePath,
        baselinePath,
        limit,
        upstreamRepository,
        includePullRequests,
        includeIssues
      })
    });
    await mkdir(dirname(bundlePath), { recursive: true });
    await writeFile(bundlePath, renderMaintainerExportMarkdown(bundle), "utf8");
    process.stderr.write(`Wrote maintainer export bundle to ${bundlePath}\n`);
  }

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

async function readReplayPayloadForHash({ fixturePath = "", capturePath = "" } = {}) {
  const path = capturePath || fixturePath;
  if (!path) return null;
  try {
    const payload = JSON.parse(await readFile(path, "utf8"));
    return {
      payload,
      label: safeDisplayPath(path)
    };
  } catch {
    return null;
  }
}

async function readBaselineProof(baselinePath) {
  const payload = JSON.parse(await readFile(baselinePath, "utf8"));
  if (payload.artifact === "public-repo-pilot-proof") return payload;
  if (payload.artifact === "public-repo-pilot-replay-capture" || payload.queuePayload || Array.isArray(payload.items)) {
    return buildPublicPilotReport({
      fixturePath: baselinePath,
      generatedAt: payload.generatedAt || new Date().toISOString()
    });
  }
  throw new Error("--baseline must point to a public pilot JSON proof or replay capture.");
}

function buildBundleCommandSet({
  repository = "",
  fixturePath = "",
  capturePath = "",
  bundlePath = "",
  baselinePath = "",
  limit = 10,
  upstreamRepository = "",
  includePullRequests = true,
  includeIssues = true
} = {}) {
  const targetRepository = normalizeRepository(repository) || "owner/repo";
  const base = fixturePath
    ? ["npm", "run", "pilot:public", "--", "--fixture", safeDisplayPath(fixturePath)]
    : ["npm", "run", "pilot:public", "--", "--repository", targetRepository, "--limit", String(limit)];
  if (!fixturePath && upstreamRepository) base.push("--upstream", upstreamRepository);
  if (!includePullRequests) base.push("--no-pulls");
  if (!includeIssues) base.push("--no-issues");

  const captureTarget = capturePath || `/tmp/pcf-${targetRepository.replaceAll("/", "-")}-capture.json`;
  const bundleTarget = bundlePath || `/tmp/pcf-${targetRepository.replaceAll("/", "-")}-bundle.md`;
  const baselineTarget = baselinePath || `/tmp/pcf-${targetRepository.replaceAll("/", "-")}-baseline.json`;
  const capture = fixturePath
    ? ""
    : [...base, "--capture", safeDisplayPath(captureTarget)].map(shellArg).join(" ");
  const replayFixture = capturePath || fixturePath || captureTarget;

  return {
    rerun: [...base, "--format", "json"].map(shellArg).join(" "),
    capture,
    replay: ["npm", "run", "pilot:public:markdown", "--", "--fixture", safeDisplayPath(replayFixture), "--bundle", safeDisplayPath(bundleTarget)].map(shellArg).join(" "),
    baseline: ["npm", "run", "pilot:public", "--", "--fixture", safeDisplayPath(replayFixture), "--format", "json", "--write", safeDisplayPath(baselineTarget)].map(shellArg).join(" "),
    capturePath: safeDisplayPath(captureTarget)
  };
}

function safeDisplayPath(path) {
  const text = String(path || "");
  if (!text) return "";
  if (isAbsolute(text)) {
    const rel = relative(process.cwd(), text);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
  }
  return text;
}

function shellArg(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
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
