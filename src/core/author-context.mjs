export function buildAuthorContext(input = {}) {
  const raw = input.authorContext && typeof input.authorContext === "object"
    ? input.authorContext
    : {};
  const login = String(raw.login || raw.author || input.author || input.authorLogin || "").trim();
  const association = String(raw.association || input.authorAssociation || "").toUpperCase();
  const accountAgeDays = finiteOrNull(raw.accountAgeDays ?? raw.account_age_days);
  const publicRepos = finiteOrNull(raw.publicRepos ?? raw.public_repos);
  const followers = finiteOrNull(raw.followers);
  const mergedPrsInRepo = finiteOrNull(raw.mergedPrsInRepo ?? raw.merged_prs_in_repo);
  const recentPrs24h = finiteOrNull(raw.recentPrs24h ?? raw.recent_prs_24h);
  const hasAvatar = raw.hasAvatar ?? raw.has_avatar;
  const hasBio = raw.hasBio ?? raw.has_bio;

  const trustBand = classifyTrustBand({
    association,
    accountAgeDays,
    publicRepos,
    mergedPrsInRepo,
    login
  });

  const signals = [];
  if (/^(OWNER|MEMBER|COLLABORATOR)$/.test(association)) signals.push("repository-role-trusted");
  if (mergedPrsInRepo >= 1) signals.push("prior-merged-pr-in-repo");
  if (accountAgeDays !== null && accountAgeDays < 90) signals.push("fresh-account");
  if (accountAgeDays !== null && accountAgeDays >= 365) signals.push("aged-account");
  if (recentPrs24h >= 5) signals.push("high-recent-pr-volume");
  if (publicRepos !== null && publicRepos === 0) signals.push("no-public-repos");
  if (hasAvatar === false) signals.push("missing-avatar");
  if (hasBio === false) signals.push("missing-bio");

  return {
    enabled: Boolean(login || association || accountAgeDays !== null || mergedPrsInRepo !== null),
    login,
    association,
    accountAgeDays,
    publicRepos,
    followers,
    mergedPrsInRepo,
    recentPrs24h,
    trustBand,
    signals,
    maintainerContextOnly: true,
    summary: summarizeAuthorContext({ login, association, trustBand, mergedPrsInRepo, accountAgeDays, recentPrs24h })
  };
}

export function classifyTrustBand({ association = "", accountAgeDays = null, publicRepos = null, mergedPrsInRepo = null, login = "" } = {}) {
  if (!login && !association && accountAgeDays === null && mergedPrsInRepo === null) return "unknown";
  if (/^(OWNER|MEMBER|COLLABORATOR)$/.test(association)) return "high";
  if (mergedPrsInRepo >= 1) return "high";
  if (accountAgeDays !== null && accountAgeDays >= 365 && (publicRepos ?? 0) >= 3) return "medium";
  if (accountAgeDays !== null && accountAgeDays < 90) return "low";
  if ((publicRepos ?? 1) === 0) return "low";
  return "medium";
}

function summarizeAuthorContext({ login, association, trustBand, mergedPrsInRepo, accountAgeDays, recentPrs24h }) {
  if (!login && !association) return "No author context supplied; trust band is unknown.";
  const parts = [];
  if (login) parts.push(`author ${login}`);
  if (association) parts.push(`association ${association}`);
  parts.push(`trust band ${trustBand}`);
  if (mergedPrsInRepo !== null) parts.push(`${mergedPrsInRepo} merged PR(s) in repo`);
  if (accountAgeDays !== null) parts.push(`account age ${accountAgeDays} day(s)`);
  if (recentPrs24h !== null && recentPrs24h > 0) parts.push(`${recentPrs24h} PR(s) in 24h`);
  return `Author context (maintainer-only): ${parts.join(", ")}.`;
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}