export const RESIDUE_REGISTER_VERSION = "2026-09-26";

export function evaluateResidueRegister(input = {}) {
  input = plainObject(input);
  const name = text(input.name || input.id || "residue-register");
  const declared = normalizeEntries(input.declared || input.register || []);
  const observed = normalizeEntries(input.observed || input.measured || []);
  const declaredMap = new Map(declared.map((entry) => [entry.id, entry]));
  const observedMap = new Map(observed.map((entry) => [entry.id, entry]));

  const duplicates = [
    ...duplicateIds(input.declared || input.register || [], "declared"),
    ...duplicateIds(input.observed || input.measured || [], "observed")
  ];
  const newResidue = observed.filter((entry) => !declaredMap.has(entry.id));
  const staleResidue = declared.filter((entry) => !observedMap.has(entry.id));
  const matched = observed.filter((entry) => declaredMap.has(entry.id));
  const blockers = [];

  for (const entry of duplicates) {
    blockers.push({
      id: "duplicate-register-entry",
      residueId: entry.id,
      side: entry.side,
      reason: `Residue id '${entry.id}' appears more than once in the ${entry.side} set.`
    });
  }
  for (const entry of newResidue) {
    blockers.push({
      id: "new-undeclared-residue",
      residueId: entry.id,
      reason: `New residue '${entry.id}' appeared outside the shrink-only register. Read it before adding or fixing it.`
    });
  }
  for (const entry of staleResidue) {
    blockers.push({
      id: "stale-register-entry",
      residueId: entry.id,
      reason: `Good news: declared residue '${entry.id}' no longer reproduces. Remove the stale entry so the register records the shrink.`
    });
  }

  const status = blockers.length ? "blocked" : "pass";
  return {
    artifact: "pcf-shrink-only-residue-register",
    version: RESIDUE_REGISTER_VERSION,
    name,
    status,
    ok: status === "pass",
    summary: status === "pass"
      ? `Pass: ${observed.length} observed residue item(s) exactly match the declared shrink-only register.`
      : `Blocked: ${newResidue.length} new, ${staleResidue.length} stale, ${duplicates.length} duplicate residue item(s).`,
    counts: {
      declared: declared.length,
      observed: observed.length,
      matched: matched.length,
      new: newResidue.length,
      stale: staleResidue.length,
      duplicates: duplicates.length
    },
    declared,
    observed,
    matched,
    newResidue,
    staleResidue,
    blockers,
    nextActions: [
      ...newResidue.map((entry) => `Read '${entry.id}', reproduce it, then fix it or deliberately add it with a reason.`),
      ...staleResidue.map((entry) => `Remove '${entry.id}' from the declared register and keep its regression control.`)
    ],
    doctrine: {
      shrinkOnly: true,
      growthRule: "Any observed residue that is not declared fails the gate.",
      staleRule: "Any declared residue that no longer reproduces also fails until the declaration is removed.",
      zeroRule: "A zero register stays guarded: the next new residue fails immediately."
    },
    nonClaims: [
      "A matching register does not make the residue acceptable; it makes the known defect set explicit and non-growing.",
      "Removing stale residue records a repair; the underlying regression control should remain.",
      "This function compares supplied identifiers only and does not execute the measurements that produced them."
    ]
  };
}

function normalizeEntries(values) {
  return (Array.isArray(values) ? values : [values])
    .map((value) => {
      const entry = typeof value === "string" ? { id: value } : plainObject(value);
      return {
        id: text(entry.id || entry.key || entry.testId || entry.caseId),
        reason: text(entry.reason || entry.summary),
        category: text(entry.category),
        evidence: text(entry.evidence || entry.path || entry.url)
      };
    })
    .filter((entry) => entry.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function duplicateIds(values, side) {
  const ids = (Array.isArray(values) ? values : [values])
    .map((value) => typeof value === "string" ? text(value) : text(plainObject(value).id || plainObject(value).key || plainObject(value).testId || plainObject(value).caseId))
    .filter(Boolean);
  const seen = new Set();
  const emitted = new Set();
  const duplicates = [];
  for (const id of ids) {
    if (seen.has(id) && !emitted.has(id)) {
      duplicates.push({ id, side });
      emitted.add(id);
    }
    seen.add(id);
  }
  return duplicates;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}
