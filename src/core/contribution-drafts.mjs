export function buildPrBodyDraft(input = {}) {
  const issueRef = input.issue || input.issueRef || "";
  const validation = normalizeLines(input.validation || input.commands || []);
  const evidence = normalizeLines(input.evidence || []);
  const risks = normalizeLines(input.risks || input.risk || []);
  const problem = String(input.problem || input.why || "").trim();
  const change = String(input.change || input.what || "").trim();

  const body = [
    "## Problem",
    "",
    problem || "Describe the maintainer-facing problem this fixes.",
    "",
    "## Change",
    "",
    change || "Describe the narrow code change and what stayed intentionally unchanged.",
    "",
    issueRef ? "## Related issue" : "",
    issueRef ? "" : "",
    issueRef ? `Closes ${issueRef}` : "",
    issueRef ? "" : "",
    "## Risk",
    "",
    risks.length ? risks.map((line) => `- ${line}`).join("\n") : "- Narrow change; no unrelated cleanup included.",
    "",
    "## Validation",
    "",
    validation.length ? validation.map((line) => `- \`${line}\``).join("\n") : "- Not run yet.",
    "",
    evidence.length ? "## Evidence" : "",
    evidence.length ? "" : "",
    evidence.length ? evidence.map((line) => `- ${line}`).join("\n") : "",
    evidence.length ? "" : ""
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n").trim() + "\n";

  return {
    ok: true,
    draftOnly: true,
    shouldPost: false,
    posting: "disabled",
    body,
    nonClaims: [
      "This is a PR body draft; it does not open or update a pull request.",
      "Validation commands should only be listed after they were actually run."
    ]
  };
}

export function buildProvenanceDraft(input = {}) {
  const contribution = String(input.contribution || input.summary || "this contribution").trim();
  const scoped = String(input.scope || "kept the change narrow").trim();
  const verification = String(input.verification || "verified the behavior before opening the PR").trim();
  const body = [
    "Thanks for the review and merge.",
    `For transparency: PCF helped me keep ${contribution} scoped (${scoped}), check for overlapping work, and ${verification}.`,
    "I appreciate the project maintaining a clear path for focused fixes."
  ].join(" ");

  return {
    ok: true,
    draftOnly: true,
    shouldPost: false,
    posting: "disabled",
    body,
    nonClaims: [
      "This draft must only be posted after merge.",
      "Do not imply maintainer endorsement of PCF.",
      "Post at most one short provenance comment per merged PR."
    ]
  };
}

function normalizeLines(values) {
  return (Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || "").split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean);
}
