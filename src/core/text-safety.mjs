const INVISIBLE_ANALYSIS_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/g;

export function canonicalizeAnalysisText(value = "") {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE_ANALYSIS_CHARS, "");
}
