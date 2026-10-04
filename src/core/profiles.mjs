const PROFILES = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    name: "Standard Maintainer",
    description: "General GitHub maintainer review-readiness checks."
  }),
  "kernel-grade": Object.freeze({
    id: "kernel-grade",
    name: "Kernel-Grade",
    description: "Strict patch-discipline checks inspired by Linux kernel contribution norms."
  })
});

export class InvalidReviewProfileError extends TypeError {
  constructor(value) {
    const supplied = typeof value === "string" ? JSON.stringify(value).slice(0, 120) : Array.isArray(value) ? "array" : typeof value;
    super(`Invalid review profile ${supplied}. Use standard or kernel-grade; omit the value for the default.`);
    this.name = "InvalidReviewProfileError";
    this.code = "PCF_INVALID_PROFILE";
  }
}

export function availableProfiles() {
  return Object.values(PROFILES);
}

// Validate every candidate before applying precedence, including overridden values.
export function selectReviewProfile(...values) {
  const profiles = values.map(value => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") throw new InvalidReviewProfileError(value);
    const profile = value.trim();
    if (profile && !Object.hasOwn(PROFILES, profile)) throw new InvalidReviewProfileError(value);
    return profile;
  });
  return profiles.find(Boolean) || "";
}

export function resolveReviewProfile(...values) {
  return PROFILES[selectReviewProfile(...values) || "standard"];
}
