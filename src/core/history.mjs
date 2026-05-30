import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const HISTORY_VERSION = "2026.05.30";
export const DEFAULT_HISTORY_LIMIT = 50;

const STATUS_RANK = {
  "low-review-value": 0,
  "needs-repair": 1,
  "ready-for-maintainer": 2
};

export async function readQueueHistory(filePath, options = {}) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return normalizeHistory(parsed, options);
  } catch (error) {
    if (error.code === "ENOENT") return emptyHistory();
    return {
      ...emptyHistory(),
      readError: error.message
    };
  }
}

export async function appendQueueHistory({ filePath, queue, collectionErrors = [], request = {}, maxEntries = DEFAULT_HISTORY_LIMIT, now = new Date().toISOString() }) {
  const history = await readQueueHistory(filePath);
  const previous = findPreviousRun(history.entries, queue.repository);
  const entry = buildQueueHistoryEntry({
    queue,
    collectionErrors,
    request,
    previous,
    now
  });
  const entryLimit = Math.max(1, Number(maxEntries) || DEFAULT_HISTORY_LIMIT);
  const entries = [entry, ...history.entries].slice(0, entryLimit);
  const nextHistory = {
    version: HISTORY_VERSION,
    updatedAt: now,
    summary: summarizeQueueHistory(entries),
    entries
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");
  return nextHistory;
}

export function buildQueueHistoryEntry({ queue = {}, collectionErrors = [], request = {}, previous = null, now = new Date().toISOString() }) {
  const compactItems = (queue.items || []).map(compactQueueItem);
  const transitions = compareQueueRuns(compactItems, previous?.items || []);
  const id = historyId({
    repository: queue.repository || "",
    generatedAt: queue.generatedAt || now,
    total: queue.summary?.total || compactItems.length,
    statuses: queue.summary?.statuses || {}
  });

  return {
    id,
    recordedAt: now,
    generatedAt: queue.generatedAt || now,
    source: queue.source || "unknown",
    repository: queue.repository || "",
    upstreamRepository: queue.upstreamRepository || "",
    dryRun: queue.dryRun !== false,
    summary: queue.summary || {},
    collectionErrors,
    request: sanitizeHistoryRequest(request),
    transitions,
    items: compactItems
  };
}

export function summarizeQueueHistory(entries = []) {
  const latest = entries[0] || null;
  const repositories = [...new Set(entries.map((entry) => entry.repository).filter(Boolean))];
  return {
    totalRuns: entries.length,
    repositories,
    latestRunAt: latest?.recordedAt || "",
    latestRepository: latest?.repository || "",
    latestTotal: latest?.summary?.total || 0,
    latestReady: latest?.summary?.statuses?.["ready-for-maintainer"] || 0,
    latestNeedsRepair: latest?.summary?.statuses?.["needs-repair"] || 0,
    latestLowReviewValue: latest?.summary?.statuses?.["low-review-value"] || 0,
    improved: latest?.transitions?.improved || 0,
    regressed: latest?.transitions?.regressed || 0,
    unchanged: latest?.transitions?.unchanged || 0,
    newItems: latest?.transitions?.newItems || 0
  };
}

export function compareQueueRuns(currentItems = [], previousItems = []) {
  const previousByKey = new Map(previousItems.map((item) => [historyItemKey(item), item]));
  const currentKeys = new Set();
  const itemTransitions = [];
  const counts = {
    improved: 0,
    regressed: 0,
    unchanged: 0,
    newItems: 0,
    goneItems: 0
  };

  for (const item of currentItems) {
    const key = historyItemKey(item);
    currentKeys.add(key);
    const previous = previousByKey.get(key);
    if (!previous) {
      counts.newItems += 1;
      itemTransitions.push(transitionFor(item, previous, "new"));
      continue;
    }
    const delta = (STATUS_RANK[item.status] ?? 0) - (STATUS_RANK[previous.status] ?? 0);
    const direction = delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged";
    counts[direction] += 1;
    itemTransitions.push(transitionFor(item, previous, direction));
  }

  for (const previous of previousItems) {
    if (!currentKeys.has(historyItemKey(previous))) counts.goneItems += 1;
  }

  return {
    ...counts,
    items: itemTransitions
  };
}

function normalizeHistory(parsed, options = {}) {
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const filtered = options.repository
    ? entries.filter((entry) => entry.repository === options.repository)
    : entries;
  const limit = Number(options.limit);
  const limited = Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
  return {
    version: parsed.version || HISTORY_VERSION,
    updatedAt: parsed.updatedAt || "",
    summary: summarizeQueueHistory(limited),
    entries: limited
  };
}

function emptyHistory() {
  return {
    version: HISTORY_VERSION,
    updatedAt: "",
    summary: summarizeQueueHistory([]),
    entries: []
  };
}

function findPreviousRun(entries, repository) {
  return entries.find((entry) => entry.repository === repository) || null;
}

function compactQueueItem(item) {
  return {
    key: historyItemKey(item),
    id: item.id || "",
    kind: item.kind || "",
    number: item.number || "",
    title: item.title || "",
    repository: item.repository || "",
    htmlUrl: item.htmlUrl || "",
    status: item.status || "",
    action: item.action || "",
    score: item.score || 0,
    labels: (item.labels || []).slice(0, 20),
    contextFindings: item.contextFindings || 0,
    reviewBudgetMinutes: item.reviewBudget?.minutes || 0,
    failureCount: item.failureCount || 0,
    warningCount: item.warningCount || 0,
    updatedAt: item.updatedAt || ""
  };
}

function transitionFor(item, previous, direction) {
  return {
    key: historyItemKey(item),
    direction,
    previousStatus: previous?.status || "",
    currentStatus: item.status || "",
    title: item.title || "",
    number: item.number || "",
    kind: item.kind || ""
  };
}

function sanitizeHistoryRequest(request = {}) {
  return {
    repository: request.repository || (request.owner && request.repo ? `${request.owner}/${request.repo}` : ""),
    source: request.source || "",
    limit: Number(request.limit) || undefined,
    includePullRequests: request.includePullRequests !== false,
    includeIssues: request.includeIssues !== false,
    upstreamRepository: request.upstreamRepository || ""
  };
}

function historyItemKey(item = {}) {
  const number = item.number || "";
  if (item.repository && item.kind && number) return `${item.repository}:${item.kind}:${number}`;
  if (item.kind && number) return `${item.kind}:${number}`;
  return String(item.key || item.id || item.title || "unknown");
}

function historyId(seed) {
  return createHash("sha256")
    .update(JSON.stringify(seed))
    .digest("hex")
    .slice(0, 16);
}
