import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { PCF_LANE_SCHEMA_VERSION } from "./lane-schema.mjs";

export const LANE_STORE_VERSION = PCF_LANE_SCHEMA_VERSION;

const DEFAULT_DATA_DIR = join(homedir(), ".local", "share", "pcf");
const DEFAULT_LANE_LIMIT = 25;

export function laneStoreRoot() {
  return join(process.env.PCF_DATA_DIR || DEFAULT_DATA_DIR, "lanes");
}

export function laneIdFor(input = {}) {
  const explicit = sanitizeSegment(input.laneId || input.id || "");
  if (explicit) return explicit;
  const repository = sanitizeSegment(input.repository || input.lane?.repository || "unknown-repo");
  const issue = sanitizeSegment(input.issue || input.issueNumber || input.lane?.issue || "no-issue");
  const branch = sanitizeSegment(input.branch || input.lane?.branch || "");
  return [repository, issue, branch].filter(Boolean).join("__").slice(0, 180) || "lane";
}

export async function saveLaneRecord(input = {}) {
  const laneId = laneIdFor(input);
  const root = laneStoreRoot();
  await mkdir(root, { recursive: true });
  const now = new Date().toISOString();
  const record = normalizeLaneRecord({
    ...(input.record || input),
    id: laneId,
    updatedAt: now,
    createdAt: input.createdAt || input.record?.createdAt || now
  });
  const filePath = laneFilePath(laneId);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
  return {
    ok: true,
    written: true,
    id: laneId,
    path: filePath,
    record,
    nonClaims: [
      "Lane store writes local PCF evidence only.",
      "Lane store does not contact GitHub, open PRs, post comments, apply labels, or push branches."
    ]
  };
}

export async function readLaneRecord(input = {}) {
  const laneId = laneIdFor(input);
  const filePath = laneFilePath(laneId);
  const text = await readFile(filePath, "utf8");
  return {
    ok: true,
    id: laneId,
    path: filePath,
    record: JSON.parse(text)
  };
}

export async function listLaneRecords(input = {}) {
  const root = laneStoreRoot();
  const limit = clampNumber(input.limit, DEFAULT_LANE_LIMIT, 1, 200);
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return {
      ok: true,
      root,
      lanes: [],
      summary: { total: 0, returned: 0 }
    };
  }

  const lanes = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const laneId = basename(entry.name, ".json");
    try {
      const record = JSON.parse(await readFile(join(root, entry.name), "utf8"));
      if (input.repository && record.lane?.repository !== input.repository && record.repository !== input.repository) continue;
      lanes.push({
        id: laneId,
        repository: record.lane?.repository || record.repository || "",
        issue: record.lane?.issue || record.issue || "",
        status: record.status || "",
        updatedAt: record.updatedAt || "",
        summary: record.summary || ""
      });
    } catch {
      lanes.push({
        id: laneId,
        status: "unreadable",
        updatedAt: "",
        summary: "Lane record could not be parsed."
      });
    }
  }

  lanes.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || left.id.localeCompare(right.id));
  return {
    ok: true,
    root,
    lanes: lanes.slice(0, limit),
    summary: {
      total: lanes.length,
      returned: Math.min(lanes.length, limit)
    }
  };
}

export async function saveEvidenceBundle(input = {}) {
  const laneId = laneIdFor(input);
  const kind = sanitizeSegment(input.kind || "repro");
  const root = join(laneStoreRoot(), laneId, "evidence");
  await mkdir(root, { recursive: true });
  const now = new Date().toISOString();
  const bundle = {
    version: LANE_STORE_VERSION,
    laneId,
    kind,
    verdict: String(input.verdict || input.status || "recorded"),
    before: input.before || null,
    after: input.after || null,
    commands: normalizeCommands(input.commands || []),
    artifacts: normalizeArtifacts(input.artifacts || []),
    notes: String(input.notes || ""),
    createdAt: now,
    nonClaims: [
      "Evidence bundle records caller-supplied proof only.",
      "PCF MCP did not execute these commands unless a separate verified artifact says so."
    ]
  };
  const fileName = `${now.replace(/[:.]/g, "-")}__${kind}.json`;
  const filePath = join(root, fileName);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
  return {
    ok: true,
    written: true,
    laneId,
    path: filePath,
    bundle
  };
}

function normalizeLaneRecord(record = {}) {
  return {
    version: LANE_STORE_VERSION,
    id: String(record.id || ""),
    status: String(record.status || ""),
    summary: String(record.summary || ""),
    lane: {
      repository: String(record.lane?.repository || record.repository || ""),
      issue: String(record.lane?.issue || record.issue || record.issueNumber || ""),
      branch: String(record.lane?.branch || record.branch || ""),
      pr: String(record.lane?.pr || record.pr || record.pullRequest || "")
    },
    gates: record.gates || {},
    artifacts: normalizeArtifacts(record.artifacts || []),
    decisions: normalizeStrings(record.decisions || []),
    nextSteps: normalizeStrings(record.nextSteps || record.next_steps || []),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || "")
  };
}

function normalizeArtifacts(values) {
  return (Array.isArray(values) ? values : [])
    .map((artifact) => ({
      path: String(artifact.path || artifact.uri || artifact.url || "").trim(),
      kind: String(artifact.kind || artifact.type || "evidence"),
      summary: String(artifact.summary || artifact.note || "")
    }))
    .filter((artifact) => artifact.path || artifact.summary);
}

function normalizeCommands(values) {
  return (Array.isArray(values) ? values : [values])
    .map((command) => typeof command === "string"
      ? { command, exitCode: null, outputPath: "" }
      : {
          command: String(command.command || ""),
          exitCode: command.exitCode ?? command.code ?? null,
          outputPath: String(command.outputPath || command.path || "")
        })
    .filter((command) => command.command || command.outputPath);
}

function normalizeStrings(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function laneFilePath(laneId) {
  return join(laneStoreRoot(), `${sanitizeSegment(laneId) || "lane"}.json`);
}

function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}
