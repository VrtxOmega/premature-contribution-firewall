export function parsePatchSubmission(text, options = {}) {
  const rawText = String(text || "").replace(/\r\n/g, "\n");
  const messages = splitMessages(rawText).map(parseMessage).filter((message) => message.subject || message.body || message.diff);
  const patchMessages = messages.filter((message) => message.files.length > 0 || /\[PATCH[^\]]*(?:\d+\/\d+|[^\]]*)\]/i.test(message.subject));
  const cover = messages.find((message) => isCoverLetter(message)) || null;
  const effectiveMessages = patchMessages.length ? patchMessages : messages;
  const files = mergeFiles(effectiveMessages.flatMap((message) => message.files));
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const subjects = effectiveMessages.map((message) => message.subject).filter(Boolean);
  const body = renderPatchBody({ cover, messages: effectiveMessages, rawText });

  return {
    kind: "pull_request",
    submissionFormat: "patch_series",
    profile: options.profile || "kernel-grade",
    title: cover?.subject || subjects[0] || "Patch series submission",
    body,
    files,
    changedFiles: files.length,
    additions,
    deletions,
    commits: effectiveMessages.map((message) => message.commitText).filter(Boolean),
    checks: [],
    repositoryFiles: options.repositoryFiles || [],
    patchSeries: {
      messageCount: messages.length,
      patchCount: effectiveMessages.filter((message) => message.files.length > 0).length,
      coverLetter: Boolean(cover),
      subjects,
      baseCommit: findHeader(messages, "base-commit"),
      inReplyTo: findHeader(messages, "in-reply-to"),
      from: [...new Set(messages.map((message) => message.headers.from).filter(Boolean))],
      trailers: collectTrailers(effectiveMessages)
    }
  };
}

function splitMessages(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
  const messages = [];
  let current = [];

  for (const line of lines) {
    if (current.length && /^From (?!:)/.test(line) && (/[0-9a-f]{12,40}/i.test(line) || /\d{4}/.test(line))) {
      messages.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) messages.push(current.join("\n"));
  return messages;
}

function parseMessage(text) {
  const headerEnd = findHeaderEnd(text);
  const headerText = headerEnd >= 0 ? text.slice(0, headerEnd) : "";
  const rest = headerEnd >= 0 ? text.slice(headerEnd).replace(/^\n+/, "") : text;
  const headers = parseHeaders(headerText);
  const subject = normalizeSubject(headers.subject || findLooseSubject(rest) || firstNonEmptyLine(rest));
  const diffIndex = findDiffStart(rest);
  const body = diffIndex >= 0 ? rest.slice(0, diffIndex).trim() : rest.trim();
  const diff = diffIndex >= 0 ? rest.slice(diffIndex).trim() : "";
  const files = parseDiffFiles(diff);
  const trailers = parseTrailers(body);

  return {
    headers,
    subject,
    body,
    diff,
    files,
    trailers,
    commitText: [subject, body, diff].filter(Boolean).join("\n\n")
  };
}

function findHeaderEnd(text) {
  const index = text.search(/\n\s*\n/);
  if (index < 0) return -1;
  const possibleHeaders = text.slice(0, index);
  return /^(From|Subject|Date|Message-Id|Message-ID|In-Reply-To|To|Cc|Base-Commit):/mi.test(possibleHeaders) ? index : -1;
}

function parseHeaders(text) {
  const headers = {};
  let current = "";
  for (const line of text.split("\n")) {
    const continuation = /^\s+/.test(line);
    if (continuation && current) {
      headers[current] = `${headers[current]} ${line.trim()}`.trim();
      continue;
    }
    const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    current = match[1].toLowerCase();
    headers[current] = match[2].trim();
  }
  return headers;
}

function findLooseSubject(text) {
  const match = /^Subject:\s*(.+)$/mi.exec(text);
  return match ? match[1] : "";
}

function firstNonEmptyLine(text) {
  return text.split("\n").map((line) => line.trim()).find(Boolean) || "";
}

function normalizeSubject(subject) {
  return String(subject || "").replace(/\s+/g, " ").trim();
}

function findDiffStart(text) {
  const patterns = [
    "\ndiff --git ",
    "\n--- a/",
    "\n+++ b/",
    "\nIndex: "
  ];
  const indexes = patterns
    .map((pattern) => text.indexOf(pattern))
    .filter((index) => index >= 0);
  if (!indexes.length) {
    if (text.startsWith("diff --git ") || text.startsWith("--- a/") || text.startsWith("Index: ")) return 0;
    return -1;
  }
  return Math.min(...indexes) + 1;
}

function parseDiffFiles(diff) {
  if (!diff) return [];
  const files = [];
  let current = null;
  for (const line of diff.split("\n")) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) {
      if (current) files.push(current);
      current = { filename: match[2], additions: 0, deletions: 0, patch: line };
      continue;
    }
    if (!current && /^--- a\/(.+)$/.test(line)) {
      current = { filename: line.replace(/^--- a\//, ""), additions: 0, deletions: 0, patch: line };
      continue;
    }
    if (!current) continue;
    current.patch += `\n${line}`;
    if (/^\+(?!\+\+)/.test(line)) current.additions += 1;
    if (/^-(?!--)/.test(line)) current.deletions += 1;
    const renameMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (renameMatch) current.filename = renameMatch[1];
  }
  if (current) files.push(current);
  return files;
}

function parseTrailers(body) {
  const trailers = [];
  for (const line of body.split("\n")) {
    const match = /^([A-Za-z][A-Za-z-]+):\s+(.+)$/.exec(line.trim());
    if (match) trailers.push({ name: match[1], value: match[2] });
  }
  return trailers;
}

function mergeFiles(files) {
  const byName = new Map();
  for (const file of files) {
    const key = file.filename || "unknown";
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...file });
      continue;
    }
    existing.additions += file.additions;
    existing.deletions += file.deletions;
    existing.patch = `${existing.patch}\n${file.patch}`;
  }
  return [...byName.values()];
}

function isCoverLetter(message) {
  return /\[PATCH[^\]]*\b0\/\d+\]/i.test(message.subject) || (message.files.length === 0 && /\bcover letter\b/i.test(message.body));
}

function renderPatchBody({ cover, messages, rawText }) {
  const parts = [];
  if (cover?.body) parts.push(cover.body);
  for (const message of messages) {
    const lines = [];
    if (message.subject) lines.push(`Patch subject: ${message.subject}`);
    if (message.body) lines.push(message.body);
    parts.push(lines.join("\n\n"));
  }
  const rendered = parts.filter(Boolean).join("\n\n---\n\n").trim();
  return rendered || rawText.slice(0, 20_000);
}

function findHeader(messages, name) {
  const key = name.toLowerCase();
  return messages.map((message) => message.headers[key]).find(Boolean) || "";
}

function collectTrailers(messages) {
  const trailers = {};
  for (const message of messages) {
    for (const trailer of message.trailers) {
      const values = trailers[trailer.name] || [];
      values.push(trailer.value);
      trailers[trailer.name] = values;
    }
  }
  return trailers;
}
