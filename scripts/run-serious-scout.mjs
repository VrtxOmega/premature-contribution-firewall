#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildSeriousCandidateScout,
  defaultSeriousSearchQueries,
  renderSeriousScoutMarkdown,
  renderSeriousScoutSummary
} from "../src/core/serious-scout.mjs";
import { loadConfig } from "../src/config.mjs";
import { createGitHubClient } from "../src/github/client.mjs";

export async function runSeriousScout({
  queries = [],
  preset = "serious",
  fixturePath = "",
  limit = 20,
  perQueryLimit = 20,
  minScore = 70,
  maxReturned = 50,
  checkPrOverlap = false,
  maxOverlapChecks = 25,
  generatedAt = new Date().toISOString(),
  config = loadConfig(new URL("..", import.meta.url).pathname),
  githubClient = null
} = {}) {
  const sourceQueries = queries.length ? queries : defaultSeriousSearchQueries(preset);
  const client = githubClient || createGitHubClient(config);
  const collectionResult = fixturePath
    ? {
        issues: await readFixtureIssues(fixturePath),
        collection: {
          source: "fixture",
          complete: true,
          queries: 0,
          incompleteResults: 0,
          errors: []
        }
      }
    : await collectIssuesFromGithub({ queries: sourceQueries, perQueryLimit, githubClient: client });
  const dedupedIssues = dedupeIssues(collectionResult.issues).slice(0, limit * Math.max(1, sourceQueries.length));
  const overlapResult = checkPrOverlap && !fixturePath
    ? await enrichOpenPullRequestOverlap({
        issues: dedupedIssues,
        githubClient: client,
        maxChecks: maxOverlapChecks,
        preliminaryReport: buildSeriousCandidateScout({
          issues: dedupedIssues,
          sourceQueries,
          minScore,
          maxReturned,
          generatedAt
        })
      })
    : {
        issues: dedupedIssues,
        overlap: {
          required: false,
          complete: true,
          checked: 0,
          found: 0,
          failed: 0,
          unchecked: 0,
          errors: []
        }
      };

  return buildSeriousCandidateScout({
    issues: overlapResult.issues,
    sourceQueries,
    collection: collectionResult.collection,
    overlap: overlapResult.overlap,
    minScore,
    maxReturned,
    generatedAt
  });
}

export async function runSeriousScoutCli(args = process.argv.slice(2)) {
  const queries = readOptions(args, "--query");
  const preset = readOption(args, "--preset", "serious");
  const fixturePath = readOption(args, "--fixture", "");
  const limit = clampNumber(readOption(args, "--limit", "20"), 20, 1, 100);
  const perQueryLimit = clampNumber(readOption(args, "--per-query-limit", String(limit)), limit, 1, 100);
  const minScore = clampNumber(readOption(args, "--min-score", "70"), 70, 0, 100);
  const maxReturned = clampNumber(readOption(args, "--max-returned", "50"), 50, 1, 500);
  const checkPrOverlap = args.includes("--check-pr-overlap");
  const maxOverlapChecks = clampNumber(readOption(args, "--max-overlap-checks", "25"), 25, 0, 100);
  const format = readOption(args, "--format", "summary");
  const writePath = readOption(args, "--write", "");

  if (!["summary", "json", "markdown"].includes(format)) {
    throw new Error(`Unsupported format '${format}'. Use summary, json, or markdown.`);
  }

  const report = await runSeriousScout({
    queries,
    preset,
    fixturePath,
    limit,
    perQueryLimit,
    minScore,
    maxReturned,
    checkPrOverlap,
    maxOverlapChecks
  });
  const output = format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : format === "markdown"
      ? renderSeriousScoutMarkdown(report)
      : renderSeriousScoutSummary(report);

  if (writePath) {
    await mkdir(dirname(writePath), { recursive: true });
    await writeFile(writePath, output, "utf8");
    process.stdout.write(`Wrote serious scout output to ${writePath}\n`);
  } else {
    process.stdout.write(output);
  }
  return report;
}

async function collectIssuesFromGithub({ queries, perQueryLimit, githubClient }) {
  const issues = [];
  const errors = [];
  let incompleteResults = 0;
  for (const query of queries) {
    try {
      const result = await githubClient.searchOpenIssues({ query, limit: perQueryLimit });
      issues.push(...(result.items || []));
      if (result.incompleteResults) {
        incompleteResults += 1;
        errors.push({
          scope: query,
          message: "GitHub search returned incomplete_results=true."
        });
      }
    } catch (error) {
      errors.push({ scope: query, message: error.message });
      if (isRateLimitError(error)) break;
    }
  }
  return {
    issues,
    collection: {
      source: "github-search",
      complete: errors.length === 0 && incompleteResults === 0,
      queries: queries.length,
      incompleteResults,
      errors
    }
  };
}

async function enrichOpenPullRequestOverlap({ issues, githubClient, maxChecks, preliminaryReport = {} }) {
  const rows = [...issues];
  const preliminaryRows = preliminaryReport.candidates || [];
  const candidateRows = preliminaryRows.filter((row) => row.status === "candidate");
  const overlapRows = candidateRows.length
    ? candidateRows
    : preliminaryRows.filter((row) => row.status === "review");
  const requiredKeys = new Set(candidateRows.map((row) => issueKey(row)));
  const checkKeys = new Set(overlapRows.map((row) => issueKey(row)));
  const orderedIssues = [
    ...issues.filter((issue) => requiredKeys.has(issueKey(issue))),
    ...issues.filter((issue) => !requiredKeys.has(issueKey(issue)) && checkKeys.has(issueKey(issue))),
    ...issues.filter((issue) => !checkKeys.has(issueKey(issue)))
  ];
  const enrichedByKey = new Map();
  const errors = [];
  let checks = 0;
  let found = 0;
  let failed = 0;
  let unchecked = 0;
  let rateLimitExhausted = false;
  for (const issue of orderedIssues) {
    const required = requiredKeys.has(issueKey(issue));
    if (!checkKeys.has(issueKey(issue))) continue;
    if (rateLimitExhausted) {
      if (required) unchecked += 1;
      enrichedByKey.set(issueKey(issue), {
        ...issue,
        overlapStatus: "unchecked"
      });
      continue;
    }
    if (checks >= maxChecks) {
      if (required) {
        unchecked += 1;
        enrichedByKey.set(issueKey(issue), {
          ...issue,
          overlapStatus: "unchecked"
        });
      }
      continue;
    }
    const repository = issue.repository || normalizeRepository(issue.repository_url || issue.html_url || issue.url);
    const terms = overlapSearchTerms(issue);
    if (!repository || (!issue.number && terms.length === 0)) {
      if (required) unchecked += 1;
      enrichedByKey.set(issueKey(issue), {
        ...issue,
        overlapStatus: "unchecked"
      });
      continue;
    }
    checks += 1;
    try {
      const pullRequests = [];
      let incomplete = false;
      let hasOverlap = false;
      if (issue.number) {
        const results = await githubClient.searchOpenPullRequests({ repository, query: `#${issue.number}`, limit: 10 });
        pullRequests.push(...results);
        hasOverlap = dedupePullRequests(pullRequests).length > 0;
        incomplete ||= !hasOverlap && (results.incompleteResults === true || searchWasTruncated(results));
      }
      for (const term of terms) {
        if (hasOverlap) break;
        const results = await githubClient.searchOpenPullRequests({ repository, query: term, limit: 10 });
        pullRequests.push(...results);
        hasOverlap = dedupePullRequests(pullRequests).length > 0;
        incomplete ||= !hasOverlap && (results.incompleteResults === true || searchWasTruncated(results));
      }
      if (!hasOverlap && incomplete) throw new Error("GitHub PR search was incomplete or truncated.");
      if (hasOverlap) found += 1;
      enrichedByKey.set(issueKey(issue), {
        ...issue,
        openPullRequestOverlap: hasOverlap,
        overlapStatus: hasOverlap ? "found" : "clear"
      });
    } catch (error) {
      if (required) {
        failed += 1;
        errors.push({ scope: issueKey(issue), message: error.message });
      }
      enrichedByKey.set(issueKey(issue), {
        ...issue,
        overlapStatus: "error",
        overlapCollectionError: error.message
      });
      if (isRateLimitError(error)) rateLimitExhausted = true;
    }
  }
  const checked = checks - failed;
  return {
    issues: rows.map((issue) => enrichedByKey.get(issueKey(issue)) || issue),
    overlap: {
      required: true,
      complete: failed === 0 && unchecked === 0,
      checked,
      found,
      failed,
      unchecked,
      errors
    }
  };
}

function searchWasTruncated(results) {
  return Number.isFinite(Number(results?.totalCount)) && Number(results.totalCount) > results.length;
}

function isRateLimitError(error) {
  return error?.rateLimited === true
    || /GitHub API (?:403|429).*rate limit|secondary rate limit|rate limit exceeded|abuse detection/i.test(String(error?.message || error));
}

async function readFixtureIssues(fixturePath) {
  const payload = JSON.parse(await readFile(fixturePath, "utf8"));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.issues)) return payload.issues;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.queue?.items) return payload.queue.items.filter((item) => item.kind === "issue");
  throw new Error("--fixture must contain an array, issues[], items[], or queue.items.");
}

function dedupeIssues(issues) {
  const seen = new Set();
  const rows = [];
  for (const issue of issues) {
    const key = issue.html_url || issue.htmlUrl || issue.url || `${issue.repository || issue.repo || issue.repository_url || ""}#${issue.number || issue.id || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(issue);
  }
  return rows;
}

function issueKey(issue = {}) {
  return `${issue.repository || normalizeRepository(issue.repository_url || issue.html_url || issue.url)}#${issue.number || issue.id || ""}`;
}

function overlapSearchTerms(issue = {}) {
  const text = `${issue.title || ""}\n${issue.body || ""}`;
  const identifiers = [...text.matchAll(/`([A-Za-z_$][A-Za-z0-9_$:.-]{5,})`/g)]
    .map((match) => match[1])
    .filter((term) => !/[/:]/.test(term));
  const camelCase = [...text.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*\b/g)]
    .map((match) => match[0])
    .filter((term) => term.length >= 8);
  return [...new Set([...identifiers, ...camelCase])].slice(0, 3);
}

function dedupePullRequests(pullRequests) {
  const seen = new Set();
  const rows = [];
  for (const pullRequest of pullRequests) {
    const key = pullRequest.htmlUrl || pullRequest.url || pullRequest.number;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(pullRequest);
  }
  return rows;
}

function normalizeRepository(value = "") {
  const text = String(value || "").trim();
  const direct = text.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  if (direct) return direct[1];
  const githubUrl = text.match(/github\.com\/([^/\s]+\/[^/#?\s]+)/i);
  if (githubUrl) return githubUrl[1].replace(/\.git$/, "");
  const apiUrl = text.match(/\/repos\/([^/\s]+\/[^/#?\s]+)/i);
  if (apiUrl) return apiUrl[1].replace(/\.git$/, "");
  return "";
}

function readOption(values, flag, fallback = "") {
  const index = values.lastIndexOf(flag);
  return index >= 0 ? values[index + 1] : fallback;
}

function readOptions(values, flag) {
  const matches = [];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === flag && values[index + 1]) matches.push(values[index + 1]);
  }
  return matches;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runSeriousScoutCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
