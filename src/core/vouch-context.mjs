import { normalizeRepositoryFiles } from "./policy.mjs";

const VOUCH_FILE = /(?:^|\/)(?:\.github\/)?VOUCHED\.td$/i;

export function analyzeVouchContext(input = {}, login = "") {
  const files = normalizeRepositoryFiles(input.repositoryFiles || input.policyFiles);
  const vouchFile = files.find((file) => VOUCH_FILE.test(file.path));
  if (!vouchFile) {
    return {
      enabled: false,
      configured: false,
      status: "not-configured",
      login: String(login || ""),
      summary: "No VOUCHED.td file supplied; vouch status was not checked."
    };
  }

  const records = parseVouchedFile(vouchFile.content);
  const normalizedLogin = String(login || input.author || input.authorLogin || "").trim().toLowerCase();
  const status = resolveVouchStatus(records, normalizedLogin);
  return {
    enabled: true,
    configured: true,
    status,
    login: normalizedLogin,
    path: vouchFile.path,
    summary: status === "vouched"
      ? `Vouch context: ${normalizedLogin || "author"} is vouched in ${vouchFile.path}.`
      : status === "denounced"
        ? `Vouch context: ${normalizedLogin || "author"} is denounced in ${vouchFile.path}.`
        : `Vouch context: ${normalizedLogin || "author"} is not listed in ${vouchFile.path}.`
  };
}

export function parseVouchedFile(text = "") {
  const records = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const denounced = trimmed.startsWith("-");
    const body = denounced ? trimmed.slice(1).trim() : trimmed;
    const [handle, ...detailParts] = body.split(/\s+/);
    if (!handle) continue;
    const detail = detailParts.join(" ").trim();
    const platformSplit = handle.includes(":") ? handle.split(":") : ["github", handle];
    records.push({
      platform: platformSplit[0].toLowerCase(),
      login: platformSplit[1].toLowerCase(),
      status: denounced ? "denounced" : "vouched",
      detail
    });
  }
  return records;
}

function resolveVouchStatus(records = [], login = "") {
  if (!login) return "unknown";
  const matches = records.filter((record) => record.login === login);
  if (matches.some((record) => record.status === "denounced")) return "denounced";
  if (matches.some((record) => record.status === "vouched")) return "vouched";
  return "unknown";
}