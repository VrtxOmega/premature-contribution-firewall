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
  }
};

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
