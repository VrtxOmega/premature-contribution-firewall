import { templateSectionSatisfied } from "./policy.mjs";

const ISSUE_LINK = /\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#\d+\b|github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i;
const TEST_MENTION = /\b(npm test|node --test|pytest|cargo test|go test|unit tests?|integration tests?|manual(?:ly)? test(?:ed)?|verified|verification)\b/i;

export function validateIssueFormCompliance(input = {}, policyProfile = null) {
  if (input.kind !== "issue" || !policyProfile?.hasPolicy) {
    return {
      enabled: false,
      checkStatus: "pass",
      labels: [],
      missingSections: [],
      summary: "No issue-form policy profile supplied."
    };
  }

  const body = String(input.body || "");
  const signals = {
    hasTestEvidence: TEST_MENTION.test(body),
    hasIssueLink: ISSUE_LINK.test(body)
  };
  const missingSections = [];
  for (const section of policyProfile.requiredSections || []) {
    if (templateSectionSatisfied(section, body, signals)) continue;
    missingSections.push(section);
  }

  const labels = missingSections.length ? ["issue-form-incomplete"] : [];
  return {
    enabled: true,
    checkStatus: missingSections.length >= 2 ? "fail" : missingSections.length ? "warn" : "pass",
    labels,
    missingSections,
    summary: missingSections.length
      ? `Issue form missing required section(s): ${missingSections.join(", ")}.`
      : "Issue form satisfies required template sections."
  };
}