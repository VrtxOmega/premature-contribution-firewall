export const STACK_VERSION = "2026.06.10";

export const ASSURANCE_LEVELS = {
  standard: {
    id: "standard",
    label: "Standard assurance",
    behavioralSignals: true,
    authorContext: true,
    vouchContext: true,
    semanticDuplicateAssist: false,
    strictIssueForms: false,
    dryRunRequired: false
  },
  high: {
    id: "high",
    label: "High assurance",
    behavioralSignals: true,
    authorContext: true,
    vouchContext: true,
    semanticDuplicateAssist: true,
    strictIssueForms: true,
    dryRunRequired: true
  }
};

export function resolveShieldedPosture(options = {}, env = process.env) {
  const shielded = options.shielded === true
    || options.profile === "shielded"
    || String(env.PCF_SHIELDED || "").toLowerCase() === "true";
  const stackEnabled = shielded
    || options.maintainerStack === true
    || String(env.PCF_MAINTAINER_STACK || "").toLowerCase() === "true";
  const requestedLevel = String(options.assuranceLevel || env.PCF_ASSURANCE_LEVEL || "").toLowerCase();
  const assuranceLevel = ASSURANCE_LEVELS[requestedLevel]
    ? requestedLevel
    : shielded
      ? "high"
      : "standard";
  const level = ASSURANCE_LEVELS[assuranceLevel];
  const disabled = (flag, levelDefault) => stackEnabled
    && options[flag] !== false
    && (options[flag] === true || levelDefault);

  const posture = {
    shielded,
    stackEnabled,
    assuranceLevel,
    assuranceLabel: level.label,
    stackVersion: STACK_VERSION,
    behavioralSignals: disabled("behavioralSignals", level.behavioralSignals),
    authorContext: disabled("authorContext", level.authorContext),
    vouchContext: disabled("vouchContext", level.vouchContext),
    semanticDuplicateAssist: stackEnabled && (options.semanticDuplicateAssist === true || level.semanticDuplicateAssist),
    strictIssueForms: stackEnabled && (options.strictIssueForms === true || level.strictIssueForms),
    dryRunRequired: shielded || (stackEnabled && level.dryRunRequired),
    writesDisabled: shielded ? true : env.PCF_DRY_RUN !== "false",
    nonClaims: [
      "Shielded posture strengthens maintainer context; it is not AI-authorship detection.",
      "Author trust bands are maintainer context only unless a project explicitly maps them to enforcement.",
      "Companion tools such as anti-slop, Good Egg, and Vouch remain opt-in outside PCF."
    ]
  };

  if (!stackEnabled) {
    return {
      ...posture,
      assuranceLevel: "standard",
      assuranceLabel: ASSURANCE_LEVELS.standard.label,
      behavioralSignals: false,
      authorContext: false,
      vouchContext: false,
      semanticDuplicateAssist: false,
      strictIssueForms: false,
      dryRunRequired: false
    };
  }

  return posture;
}