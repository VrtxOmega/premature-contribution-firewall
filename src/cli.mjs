#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { evaluateContribution, renderMarkdownReport } from "./core/evaluator.mjs";
import { parsePatchSubmission } from "./core/patch.mjs";
import { normalizeRepositoryFiles } from "./core/policy.mjs";
import { buildMaintainerQueue } from "./core/queue.mjs";
import { buildSetupGuide, renderSetupGuideMarkdown, renderSetupGuideText } from "./core/setup-guide.mjs";
import {
  CorpusValidationError,
  renderCorpusValidationMarkdown,
  renderCorpusValidationSummary,
  validateCorpusText
} from "./core/corpus-validation.mjs";
import {
  ProspectiveStudyError,
  analyzeProspectiveStudy,
  freezeStudyCase,
  initializeProspectiveStudy,
  readProspectiveStudyStatus,
  recordStudyObservation,
  recordStudyConsent,
  renderProspectiveStudyMarkdown,
  renderProspectiveStudySummary,
  submitStudyRating,
  withdrawStudyParticipant
} from "./core/prospective-study.mjs";
import { loadConfig } from "./config.mjs";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const command = args[0];
if (!["evaluate", "evaluate-patch", "queue", "setup", "setup-pilot", "preflight", "validate-corpus", "study"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

if (command === "study") {
  await runProspectiveStudy(args.slice(1));
}

if (command === "setup" || command === "setup-pilot") {
  const format = readFlag(args, "--format") || "text";
  const config = loadConfig(process.cwd());
  const guide = buildSetupGuide(config, {
    repository: readFlag(args, "--repository") || readFlag(args, "--repo"),
    baseUrl: readFlag(args, "--base-url"),
    publicBaseUrl: readFlag(args, "--public-base-url") || readFlag(args, "--webhook-base-url")
  });

  if (format === "json") {
    console.log(JSON.stringify(guide, null, 2));
  } else if (format === "markdown") {
    console.log(renderSetupGuideMarkdown(guide));
  } else {
    console.log(renderSetupGuideText(guide));
  }
  process.exit(0);
}

if (command === "validate-corpus") {
  const file = args[1];
  if (!file) {
    console.error("Missing corpus file.");
    printHelp();
    process.exit(2);
  }
  const format = readFlag(args, "--format") || "pretty";
  if (!["pretty", "json", "markdown"].includes(format)) {
    console.error(`Unsupported format: ${format}. Use pretty, json, or markdown.`);
    process.exit(2);
  }
  const inputFormat = readFlag(args, "--input-format");
  try {
    const text = file === "-" ? await readStdin() : await readFile(file, "utf8");
    const result = validateCorpusText(text, {
      inputFormat,
      sourceName: file === "-" ? "stdin" : basename(file)
    });
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === "markdown") {
      process.stdout.write(renderCorpusValidationMarkdown(result));
    } else {
      process.stdout.write(renderCorpusValidationSummary(result));
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof CorpusValidationError
      ? error.message
      : error?.code === "ENOENT"
        ? `Cannot read corpus file '${basename(file)}'.`
        : "Unexpected corpus validation error.";
    console.error(`PCF corpus validation failed: ${message}`);
    process.exit(1);
  }
}

const file = args[1];
if (!file) {
  console.error("Missing input file.");
  printHelp();
  process.exit(2);
}

const format = readFlag(args, "--format") || "pretty";
const profile = readFlag(args, "--profile") || "";
const policyFiles = await readPolicyFiles(readFlag(args, "--policy"));
const text = file === "-" ? await readStdin() : await readFile(file, "utf8");
if (command === "queue") {
  const payload = JSON.parse(text);
  const queue = buildMaintainerQueue(payload, {
    profile: profile || payload.profile,
    now: readFlag(args, "--now") || ""
  });
  if (format === "json") {
    console.log(JSON.stringify(queue, null, 2));
  } else if (format === "markdown") {
    console.log(queue.markdown);
  } else {
    printQueuePretty(queue);
  }
  process.exit(0);
}

if (command === "preflight") {
  const input = parsePreflightInput(text, file, { profile, policyFiles });
  const evaluation = evaluateContribution(input, { profile: profile || input.profile });
  const allowRepair = args.includes("--allow-repair");
  const ready = evaluation.status === "ready-for-maintainer"
    || (allowRepair && evaluation.status === "needs-repair");

  if (format === "json") {
    console.log(JSON.stringify({ ready, gate: allowRepair ? "allow-repair" : "ready-only", evaluation }, null, 2));
  } else if (format === "markdown") {
    console.log(renderMarkdownReport(evaluation));
  } else {
    printPreflightPretty(evaluation, { ready, allowRepair });
  }
  process.exit(ready ? 0 : 1);
}

const jsonInput = command === "evaluate" ? JSON.parse(text) : null;
const input = command === "evaluate-patch"
  ? parsePatchSubmission(text, { profile: profile || "kernel-grade", repositoryFiles: policyFiles })
  : { ...jsonInput, repositoryFiles: policyFiles.length ? policyFiles : jsonInput.repositoryFiles };
const evaluation = evaluateContribution(input, { profile: profile || input.profile });

if (format === "json") {
  console.log(JSON.stringify(evaluation, null, 2));
} else if (format === "markdown") {
  console.log(renderMarkdownReport(evaluation));
} else {
  printPretty(evaluation);
}

function parsePreflightInput(rawText, fileName, { profile: requestedProfile, policyFiles: files }) {
  const looksLikePatchFile = /\.(patch|mbox|eml|diff)$/i.test(String(fileName || ""));
  if (!looksLikePatchFile) {
    try {
      const parsed = JSON.parse(rawText);
      return { ...parsed, repositoryFiles: files.length ? files : parsed.repositoryFiles };
    } catch {
      // fall through to patch parsing
    }
  }
  return parsePatchSubmission(rawText, {
    profile: requestedProfile || "kernel-grade",
    repositoryFiles: files
  });
}

function printPreflightPretty(evaluation, { ready, allowRepair }) {
  const verdict = ready ? "READY TO SUBMIT" : "NOT READY YET";
  console.log(`PCF contributor preflight: ${verdict}`);
  console.log(`Status: ${evaluation.status} (${evaluation.score}/100)`);
  console.log(`Profile: ${evaluation.profile.name}`);
  console.log(`Gate: ${allowRepair ? "ready-for-maintainer or needs-repair passes" : "only ready-for-maintainer passes"}`);
  console.log("");
  console.log(evaluation.summary);
  if (!ready && evaluation.repairSteps.length) {
    console.log("");
    console.log("Fix before submitting:");
    for (const step of evaluation.repairSteps) console.log(`- ${step}`);
  }
  const failing = evaluation.checks.filter((check) => check.status !== "pass");
  if (!ready && failing.length) {
    console.log("");
    console.log("Failing checks:");
    for (const check of failing) {
      console.log(`- ${check.status.toUpperCase()} ${check.title}: ${check.reason}`);
    }
  }
  console.log("");
  console.log("This preflight is advisory. It does not guarantee acceptance and makes no GitHub writes.");
}

function printPretty(evaluation) {
  console.log(`Premature Contribution Firewall ${evaluation.kind}: ${evaluation.status} (${evaluation.score}/100)`);
  console.log(`Profile: ${evaluation.profile.name}`);
  console.log(`Review budget: ${evaluation.reviewBudget.level} (${evaluation.reviewBudget.minutes} min est.)`);
  console.log(`Labels: ${evaluation.labels.join(", ") || "none"}`);
  console.log("");
  console.log(evaluation.summary);
  console.log("");
  console.log("Repair checklist:");
  for (const step of evaluation.repairSteps) console.log(`- ${step}`);
  console.log("");
  console.log("Checks:");
  for (const check of evaluation.checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.title}: ${check.reason}`);
  }
}

function printQueuePretty(queue) {
  const summary = queue.summary || {};
  console.log(`Premature Contribution Firewall queue: ${summary.total || 0} item(s)`);
  if (queue.repository) console.log(`Repository: ${queue.repository}`);
  console.log(`Ready: ${summary.statuses?.["ready-for-maintainer"] || 0}`);
  console.log(`Repair: ${summary.statuses?.["needs-repair"] || 0}`);
  console.log(`Low value: ${summary.statuses?.["low-review-value"] || 0}`);
  console.log(`Review budget: ${summary.reviewBudgetMinutes || 0} min`);
  console.log("");
  console.log("Next action lanes:");
  for (const group of queue.nextActionGroups || []) {
    if (!group.count) continue;
    console.log(`- ${group.title || group.id}: ${group.count} item(s), owner ${group.owner}, next ${group.maintainerAction}`);
  }
  console.log("");
  console.log("Queue:");
  for (const item of queue.items || []) {
    const number = item.number ? `#${item.number}` : item.id;
    console.log(`- ${item.nextAction?.id || "unknown"} ${number}: ${item.title}`);
    console.log(`  owner: ${item.nextAction?.owner || item.nextAction?.target || "unknown"}`);
    console.log(`  next: ${item.nextAction?.maintainerAction || item.nextAction?.summary || ""}`);
    console.log(`  reason: ${item.nextAction?.reason || "none"}`);
    if (item.responseTemplate?.body) {
      console.log(`  response draft: ${item.responseTemplate.title} (${item.responseTemplate.audience}, dry-run)`);
      for (const line of item.responseTemplate.body.split("\n")) {
        console.log(`    ${line}`);
      }
    }
  }
}

function readFlag(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : "";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function readPolicyFiles(path) {
  if (!path) return [];
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text);
  return normalizeRepositoryFiles(Array.isArray(data) ? data : data.repositoryFiles || data.policyFiles || []);
}

async function runProspectiveStudy(studyArgs) {
  const action = studyArgs[0];
  if (!action || !["init", "consent", "observe", "freeze", "rate", "withdraw", "analyze", "status"].includes(action)) {
    console.error("PCF prospective study failed: action must be init, consent, observe, freeze, rate, withdraw, analyze, or status.");
    process.exit(2);
  }
  const root = readFlag(studyArgs, "--root");
  if (!root) {
    console.error("PCF prospective study failed: --root is required.");
    process.exit(2);
  }
  const format = readFlag(studyArgs, "--format") || "pretty";
  if (!["pretty", "json", "markdown"].includes(format)) {
    console.error(`PCF prospective study failed: unsupported format '${format}'.`);
    process.exit(2);
  }
  const now = readFlag(studyArgs, "--now");
  try {
    let result;
    if (action === "init") {
      const protocolPath = requiredStudyFlag(studyArgs, "--protocol");
      const framePath = requiredStudyFlag(studyArgs, "--sampling-frame");
      result = await initializeProspectiveStudy({
        root,
        protocol: await readJsonFile(protocolPath),
        samplingFrame: await readJsonFile(framePath),
        mode: readFlag(studyArgs, "--mode") || "production",
        now
      });
    } else if (action === "consent") {
      result = await recordStudyConsent({
        root,
        consent: await readJsonFile(requiredStudyFlag(studyArgs, "--input")),
        now
      });
    } else if (action === "observe") {
      result = await recordStudyObservation({
        root,
        observation: await readJsonFile(requiredStudyFlag(studyArgs, "--input")),
        now
      });
    } else if (action === "freeze") {
      result = await freezeStudyCase({
        root,
        input: await readJsonFile(requiredStudyFlag(studyArgs, "--input")),
        now
      });
    } else if (action === "rate") {
      result = await submitStudyRating({
        root,
        rating: await readJsonFile(requiredStudyFlag(studyArgs, "--input")),
        now
      });
    } else if (action === "withdraw") {
      result = await withdrawStudyParticipant({
        root,
        participantId: requiredStudyFlag(studyArgs, "--participant"),
        now
      });
    } else if (action === "analyze") {
      result = await analyzeProspectiveStudy({
        root,
        write: studyArgs.includes("--write"),
        lock: studyArgs.includes("--lock"),
        now
      });
    } else {
      result = await readProspectiveStudyStatus({ root });
    }
    printStudyResult(result, format);
    process.exit(0);
  } catch (error) {
    const message = error instanceof ProspectiveStudyError
      ? error.message
      : error?.code === "ENOENT"
        ? "Required local study file is missing."
        : error instanceof SyntaxError
          ? "Input file contains invalid JSON."
          : "Unexpected local study-runner error.";
    console.error(`PCF prospective study failed: ${message}`);
    process.exit(1);
  }
}

function requiredStudyFlag(values, flag) {
  const value = readFlag(values, flag);
  if (!value) throw new ProspectiveStudyError(`${flag} is required.`);
  return value;
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function printStudyResult(result, format) {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (format === "markdown") {
    process.stdout.write(renderProspectiveStudyMarkdown(result));
  } else if (result.artifact === "pcf-prospective-study-status" || result.artifact === "pcf-prospective-study-analysis") {
    process.stdout.write(renderProspectiveStudySummary(result));
  } else {
    console.log(`PCF prospective study: ${result.status || "PASS"}`);
    if (result.studyId) console.log(`Study: ${result.studyId}`);
    if (result.caseId) console.log(`Case: ${result.caseId}`);
    if (result.snapshotSha256) console.log(`Snapshot SHA-256: ${result.snapshotSha256}`);
    console.log("Decision boundary: INCONCLUSIVE");
  }
}

function printHelp() {
  console.log(`Usage:
  node src/cli.mjs setup [--repository owner/repo] [--base-url http://127.0.0.1:3791] [--public-base-url https://example.tunnel] [--format text|json|markdown]
  node src/cli.mjs queue <queue-payload.json> [--format pretty|json|markdown]
  node src/cli.mjs evaluate <payload.json> [--format pretty|json|markdown] [--profile standard|kernel-grade]
  node src/cli.mjs evaluate-patch <patch-or-mbox> [--format pretty|json|markdown] [--profile kernel-grade] [--policy policy-files.json]
  node src/cli.mjs preflight <payload.json|patch-or-mbox> [--allow-repair] [--format pretty|json|markdown] [--profile standard|kernel-grade] [--policy policy-files.json]
  node src/cli.mjs validate-corpus <consented.jsonl|consented.csv|-> [--input-format jsonl|csv] [--format pretty|json|markdown]
  node src/cli.mjs study init --root <absolute-path> --protocol <protocol.json> --sampling-frame <frame.json> [--mode production|synthetic] [--format pretty|json|markdown]
  node src/cli.mjs study consent|observe|freeze|rate --root <absolute-path> --input <record.json> [--format pretty|json|markdown]
  node src/cli.mjs study withdraw --root <absolute-path> --participant <opaque-id> [--format pretty|json|markdown]
  node src/cli.mjs study analyze --root <absolute-path> [--write] [--lock] [--format pretty|json|markdown]
  node src/cli.mjs study status --root <absolute-path> [--format pretty|json|markdown]
  cat queue-payload.json | node src/cli.mjs queue - --format json

Preflight exit codes: 0 = ready to submit, 1 = not ready, 2 = usage error.
Corpus validation exit codes: 0 = corpus measured, 1 = validation failed closed, 2 = usage error.`);
}
