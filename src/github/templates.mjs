export const DEFAULT_LABEL_DEFINITIONS = {
  "ready-for-maintainer": {
    color: "1f883d",
    description: "Premature Contribution Firewall: ready for maintainer review"
  },
  "needs-repair": {
    color: "bf8700",
    description: "Premature Contribution Firewall: contribution needs repair before review"
  },
  "low-review-value": {
    color: "cf222e",
    description: "Premature Contribution Firewall: not worth maintainer review yet"
  },
  "needs-tests": {
    color: "bf8700",
    description: "Premature Contribution Firewall: tests or a no-test rationale are needed"
  },
  "needs-reproducer": {
    color: "bf8700",
    description: "Premature Contribution Firewall: reproducible steps are needed"
  },
  "too-broad": {
    color: "cf222e",
    description: "Premature Contribution Firewall: diff is too broad for focused review"
  },
  "policy-failed": {
    color: "cf222e",
    description: "Premature Contribution Firewall: repository contribution policy was not met"
  },
  "wrong-repository": {
    color: "cf222e",
    description: "Premature Contribution Firewall: issue appears to belong in another repository"
  },
  "needs-human-verification": {
    color: "bf8700",
    description: "Premature Contribution Firewall: human-run verification evidence is needed"
  },
  "secrets-risk": {
    color: "cf222e",
    description: "Premature Contribution Firewall: obvious secret-like material detected"
  },
  "kernel-subject-discipline": {
    color: "cf222e",
    description: "PCF: patch subject is not disciplined enough for kernel-grade review"
  },
  "needs-dco-signoff": {
    color: "cf222e",
    description: "PCF: human DCO Signed-off-by is required"
  },
  "needs-patch-rationale": {
    color: "cf222e",
    description: "PCF: patch lacks problem, reachability, impact, or correctness rationale"
  },
  "needs-fixes-tag": {
    color: "bf8700",
    description: "PCF: bug-fix metadata should include a proper Fixes tag"
  },
  "stable-discipline-failed": {
    color: "cf222e",
    description: "PCF: stable-tree request does not meet strict readiness rules"
  },
  "needs-maintainer-targeting": {
    color: "bf8700",
    description: "PCF: maintainer/list routing evidence is missing"
  },
  "needs-kernel-build-evidence": {
    color: "cf222e",
    description: "PCF: kernel-grade build, static analysis, or runtime evidence is missing"
  },
  "needs-tool-provenance": {
    color: "cf222e",
    description: "PCF: meaningful tool-generated content needs transparent provenance"
  },
  "needs-series-split": {
    color: "bf8700",
    description: "PCF: broad work should be split into a reviewable patch series"
  },
  "review-budget-high": {
    color: "bf8700",
    description: "PCF: estimated maintainer review budget is too high"
  },
  "drive-by-risk": {
    color: "bf8700",
    description: "PCF: contribution needs prior review or clearer subsystem routing"
  },
  "behavioral-risk": {
    color: "bf8700",
    description: "PCF: behavioral slop or rapid-submission signals need maintainer context"
  },
  "rapid-submission": {
    color: "bf8700",
    description: "PCF: submission pacing looks unusually fast for the diff size"
  },
  "high-pr-volume": {
    color: "cf222e",
    description: "PCF: author has unusually high recent pull-request volume"
  },
  "issue-form-incomplete": {
    color: "bf8700",
    description: "PCF: required issue template sections are missing"
  },
  "missing-linked-issue": {
    color: "bf8700",
    description: "PCF: repository policy requires a linked issue reference"
  }
};

export function formatReadinessComment({ result = {}, posture = {}, maintainerStack = null } = {}) {
  const lines = [
    "## PCF readiness summary",
    "",
    `**Status:** ${result.status} (${result.score}/100)`
  ];

  if (posture?.stackEnabled) {
    lines.push(`**Assurance:** ${posture.assuranceLabel}${posture.shielded ? " (shielded, dry-run enforced)" : ""}`);
  }

  lines.push("", result.summary || "No summary supplied.");

  if (maintainerStack?.behavioral?.findings?.length) {
    lines.push("", "### Behavioral context");
    for (const finding of maintainerStack.behavioral.findings.slice(0, 5)) {
      lines.push(`- ${finding.severity}: ${finding.reason}`);
    }
  }

  if (maintainerStack?.author?.enabled) {
    lines.push("", `### Author context`, `- ${maintainerStack.author.summary}`);
  }

  if (maintainerStack?.vouch?.configured) {
    lines.push(`- ${maintainerStack.vouch.summary}`);
  }

  if (maintainerStack?.duplicateAssist?.suggestions?.length) {
    lines.push("", "### Duplicate assist (deterministic, verify manually)");
    for (const suggestion of maintainerStack.duplicateAssist.suggestions) {
      const ref = suggestion.number ? `#${suggestion.number} ` : "";
      lines.push(`- ${ref}${suggestion.title || "untitled"} (score ${suggestion.score})`);
    }
  }

  if (result.repairSteps?.length) {
    lines.push("", "### Repair before review");
    for (const step of result.repairSteps.slice(0, 8)) lines.push(`- ${step}`);
  }

  if (posture?.nonClaims?.length) {
    lines.push("", "_Maintainer context only; not AI-authorship detection._");
  }

  lines.push("", "<!-- premature-contribution-firewall-readiness -->");
  return lines.filter((line, index, list) => line || list[index - 1] !== "").join("\n");
}

export function formatWebhookDryRun({ owner, repo, number, event, action, evaluation }) {
  return {
    repository: `${owner}/${repo}`,
    number,
    event,
    action,
    wouldApplyLabels: evaluation.labels,
    wouldPostComment: evaluation.comment
  };
}

export function labelDefinitionFor(name) {
  return DEFAULT_LABEL_DEFINITIONS[name] || {
    color: "6e7781",
    description: `Premature Contribution Firewall: ${name}`
  };
}
