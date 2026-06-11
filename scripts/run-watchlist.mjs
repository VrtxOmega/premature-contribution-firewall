#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { buildPublicPilotReport } from "./run-public-pilot.mjs";
import {
  buildWatchlistReport,
  normalizeWatchlistConfig,
  renderWatchlistMarkdown,
  renderWatchlistSummary
} from "../src/core/watchlist.mjs";

export async function runWatchlist({
  configPath = "config/watchlist.json",
  limitOverride = "",
  generatedAt = new Date().toISOString(),
  entryTimeoutMs = watchlistEntryTimeoutMs(),
  reportBuilder = buildPublicPilotReport
} = {}) {
  const rawConfig = JSON.parse(await readFile(configPath, "utf8"));
  const config = normalizeWatchlistConfig(rawConfig);
  const baseDir = dirname(resolve(configPath));
  const runs = [];

  for (const entry of config.repositories) {
    if (!entry.enabled) {
      runs.push({ entry, disabled: true });
      continue;
    }
    try {
      const controller = new AbortController();
      const proof = await withEntryTimeout(reportBuilder({
        repository: entry.repository,
        fixturePath: resolveMaybe(baseDir, entry.fixturePath),
        limit: limitOverride ? Number(limitOverride) : entry.limit,
        includePullRequests: Boolean(entry.includePullRequests),
        includeIssues: entry.includeIssues !== false,
        upstreamRepository: entry.upstreamRepository,
        contributorPreflight: entry.contributorPreflight !== false,
        preflightChecks: entry.preflightChecks,
        generatedAt,
        signal: controller.signal
      }), { entry, timeoutMs: entryTimeoutMs, controller });
      runs.push({ entry, proof });
    } catch (error) {
      runs.push({ entry, error: error.message });
    }
  }

  return buildWatchlistReport({ config, runs, generatedAt });
}

export async function runWatchlistCli(args = process.argv.slice(2)) {
  const configPath = readOption(args, "--config", "config/watchlist.json");
  const format = readOption(args, "--format", "summary");
  const writePath = readOption(args, "--write", "");
  const limitOverride = readOption(args, "--limit", "");
  const entryTimeoutMs = clampNumber(readOption(args, "--entry-timeout-ms", process.env.PCF_WATCHLIST_ENTRY_TIMEOUT_MS || ""), watchlistEntryTimeoutMs(), 0, 10 * 60_000);

  if (!["summary", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format '${format}'. Use summary, json, or markdown.`);
  }

  const report = await runWatchlist({ configPath, limitOverride, entryTimeoutMs });
  const output = format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : format === "markdown"
      ? renderWatchlistMarkdown(report)
      : renderWatchlistSummary(report);

  if (writePath) {
    await mkdir(dirname(writePath), { recursive: true });
    await writeFile(writePath, output, "utf8");
    process.stdout.write(`Wrote watchlist output to ${writePath}\n`);
  } else {
    process.stdout.write(output);
  }
  return report;
}

function resolveMaybe(baseDir, path = "") {
  const text = String(path || "").trim();
  if (!text) return "";
  return isAbsolute(text) ? text : resolve(baseDir, text);
}

function readOption(values, flag, fallback = "") {
  const index = values.lastIndexOf(flag);
  return index >= 0 ? values[index + 1] : fallback;
}

async function withEntryTimeout(promise, { entry, timeoutMs, controller } = {}) {
  if (!timeoutMs) return promise;
  let timeout = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`watchlist entry ${entry.repository} timed out after ${timeoutMs}ms`);
          controller?.abort(error);
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function watchlistEntryTimeoutMs() {
  return clampNumber(process.env.PCF_WATCHLIST_ENTRY_TIMEOUT_MS, 45_000, 0, 10 * 60_000);
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runWatchlistCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
