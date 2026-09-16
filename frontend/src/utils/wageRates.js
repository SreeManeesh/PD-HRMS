/**
 * Shared wage-rate helpers — single frontend source of truth for Basic Wages.
 * Mirrors backend `resolveEmployeeWageRate` + `basicMonthlyWage` +
 * `splitMonthlyPackage`:
 *   dailyRate = employee override (dailyWageRate > 0) else wage-table match
 *               by skill + state + location + contractor (state-aware),
 *   basicMonthly = round(dailyRate × 26 statutory days) — LOCKED, never a residual.
 *
 * Doctrine (backend + frontend identical):
 *   monthly salary (base pay) = Basic (state/skill minimum) + allowances
 *   gross earnings === monthly salary, always.
 * E.g. monthly ₹40,000 with a ₹22,000 state minimum → basic ₹22,000 and the
 * ₹18,000 remainder is divided into the allowance components.
 */

export const normalizeSkill = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * Single dynamic source of truth for payroll math: the employee's
 * Monthly gross (₹) — the editable field in the employee profile.
 * Prefers the stored monthlyGross, falls back to annualSalary / 12.
 * Returns a rounded rupee amount, or null when the employee has no
 * package set (callers render "—" / treat percentages as 0).
 * Recomputed on every render from the live employee list, so profile
 * edits reflect immediately (dynamic only — never static, never
 * wage-derived).
 */
export function employeeMonthlyGross(emp = {}) {
  const direct = Number(emp.monthlyGross);
  if (direct > 0) return Math.round(direct);
  const wiz = Number(emp.wizardData?.monthlyGross);
  if (wiz > 0) return Math.round(wiz);
  const annual =
    Number(emp.annualSalary) ||
    Number(emp.wizardData?.annualSalary) ||
    Number(emp.salary) ||
    0;
  if (annual > 0) return Math.round(annual / 12);
  return null;
}

/** Canonical label for the single percentage base used everywhere. */
export const MONTHLY_GROSS_LABEL = "Monthly gross";

/** Legacy base names (Basic Salary / Gross Pay / etc.) all mean Monthly gross now. */
export function isMonthlyGrossBase(v) {
  const s = String(v || "").toLowerCase();
  return (
    s.includes("monthly") ||
    s.includes("gross") ||
    s.includes("ctc") ||
    s.includes("basic") ||
    s === ""
  );
}

export const isBasicKey = (codeOrName, name = "") => {
  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
  return norm(codeOrName).includes("basic") || norm(name).includes("basic");
};

export function resolveEmployeeWageRate(emp = {}, wageRates = []) {
  const override = Number(emp.dailyWageRate) || 0;
  if (override > 0) {
    return { dailyRate: override, hourlyRate: Math.round((override / 8) * 100) / 100, isOverride: true, source: "Override" };
  }
  const skill = normalizeSkill(emp.skillType || "Skilled");
  const matching = (wageRates || []).filter(
    (r) => normalizeSkill(r.skillCategory) === skill
  );
  const empState = String(emp.state || "").trim().toLowerCase();

  let match =
    matching.find(
      (r) =>
        empState &&
        r.state &&
        (r.state.toLowerCase() === empState || r.state.toLowerCase().includes(empState)) &&
        r.locationId === emp.locationId &&
        r.contractorId === emp.contractorId
    ) ||
    (empState
      ? matching.find(
          (r) =>
            r.state &&
            (r.state.toLowerCase() === empState || r.state.toLowerCase().includes(empState)) &&
            !r.contractorId
        )
      : null) ||
    (emp.locationId
      ? matching.find((r) => r.locationId === emp.locationId && !r.contractorId)
      : null) ||
    (emp.contractorId
      ? matching.find((r) => !r.locationId && r.contractorId === emp.contractorId)
      : null) ||
    matching.find(
      (r) => (!r.state || r.state.toLowerCase().includes("all")) && !r.locationId && !r.contractorId
    ) ||
    matching[0];

  if (match) {
    const dr = Number(match.dailyRate) || 0;
    const hr = match.hourlyRate
      ? Number(match.hourlyRate)
      : Math.round((dr / 8) * 100) / 100;
    return { dailyRate: dr, hourlyRate: hr, isOverride: false, source: match.state || "All States (Default)", rateId: match.id };
  }
  // No static fallback — wage rates are strictly fetched from API + overrides.
  // If no rate is configured for this skill/state, return 0 so the UI shows
  // wage-driven values as unset rather than inventing a hardcoded amount.
  return { dailyRate: 0, hourlyRate: 0, isOverride: false, source: null };
}

export function basicMonthlyFor(emp = {}, wageRates = []) {
  const r = resolveEmployeeWageRate(emp, wageRates);
  return { ...r, basicMonthly: Math.round(r.dailyRate * 26) };
}

const isPctFromGross = (c) => {
  const src = String(c?.percentageFrom || c?.sourceField || "basic").toLowerCase();
  return src.includes("gross") || src.includes("ctc") || src === "gross pay";
};

/**
 * Rupee-exact monthly split (mirrors backend `splitMonthlyPackage`):
 * Basic is FIXED; the remainder (target − basic) is the ALLOWANCE ENVELOPE
 * shared by all non-basic parts. Returns { basic, gross, amounts, nonCompliant, excess }
 * where amounts holds every non-basic part by component key and
 * Σ(amounts) + basic === gross ALWAYS:
 *  - configured parts fit → honoured in full, leftover goes to `otherKey`,
 *  - configured parts over-draw → EVERY part scaled pro-rata (rupee-exact,
 *    largest-remainder) so Σ(non-basic) === envelope exactly, i.e. gross
 *    earnings === monthly gross in any circumstances; `excess` reports the
 *    overage so callers can surface a disclaimer,
 *  - Basic alone exceeds the envelope (statutory floor) → gross raised to
 *    the committed minimum, flagged `nonCompliant`.
 */
export function splitMonthlyPackage({ target, basic, fixedWeights = [], basicPctParts = [], grossPctParts = [], otherKey } = {}) {
  const T = Math.max(Math.round(target || 0), 0);
  const B = Math.max(Math.round(basic || 0), 0);
  const weights = (fixedWeights || []).map((w) => ({ key: w.key, weight: Math.max(Math.round(w.weight || 0), 0) }));
  const bPct = (basicPctParts || []).map((p) => ({ key: p.key, amount: Math.max(Math.round(p.amount || 0), 0) }));
  const gPct = (grossPctParts || []).map((p) => ({ key: p.key, amount: Math.max(Math.round(p.amount || 0), 0) }));
  const amounts = {};
  const bSum = bPct.reduce((s, p) => s + p.amount, 0);
  const gSum = gPct.reduce((s, p) => s + p.amount, 0);
  const sumW = weights.reduce((s, w) => s + w.weight, 0);
  const envelope = T - B; // allowance pool shared by ALL non-basic parts
  const configured = bSum + gSum + sumW;
  const oKey = otherKey || (weights.find((w) => /other/i.test(w.key)) || {}).key || "otherAllowances";
  if (envelope < 0) {
    for (const p of [...bPct, ...gPct]) amounts[p.key] = (amounts[p.key] || 0) + p.amount;
    return { basic: B, gross: B + bSum + gSum, amounts, nonCompliant: true, excess: 0 };
  }
  if (configured <= envelope) {
    for (const p of [...bPct, ...gPct]) amounts[p.key] = (amounts[p.key] || 0) + p.amount;
    for (const w of weights) amounts[w.key] = (amounts[w.key] || 0) + w.weight;
    const leftover = envelope - configured;
    if (leftover > 0) amounts[oKey] = (amounts[oKey] || 0) + leftover;
    return { basic: B, gross: T, amounts, nonCompliant: false, excess: 0 };
  }
  const parts = [...bPct, ...gPct, ...weights].filter((p) => p.amount > 0);
  const scale = envelope / configured;
  const floored = parts.map((p) => {
    const raw = p.amount * scale;
    return { key: p.key, base: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let assigned = floored.reduce((s, f) => s + f.base, 0);
  floored.sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (assigned < envelope && floored.length > 0) {
    floored[i % floored.length].base += 1;
    assigned += 1;
    i += 1;
  }
  for (const f of floored) amounts[f.key] = (amounts[f.key] || 0) + f.base;
  return { basic: B, gross: T, amounts, nonCompliant: false, excess: configured - envelope };
}

/**
 * Monthly envelope for an employee — base pay is strictly employee-defined
 * and NEVER sourced from wage rates: monthly staff carry it as
 * annualSalary/12, daily staff as dailyRate × 26 (a daily worker's pay basis
 * IS the rate). A monthly employee with no package has NO monthly
 * (monthlyGross/monthlySalary null, needsPackage true) — the wage table
 * contributes ONLY their Basic line, never a monthly.
 */
export function monthlyGrossFor(emp = {}, components = [], wageRates = []) {
  const { basicMonthly } = basicMonthlyFor(emp, wageRates);
  const storedMonthly = Math.round((Number(emp.annualSalary) || 0) / 12);
  const isDaily =
    String(emp.salaryType || "").trim().toLowerCase() === "daily" ||
    (Number(emp.dailyWageRate) > 0 && !Number(emp.annualSalary));
  if (!isDaily && storedMonthly <= 0) {
    return { basicMonthly, monthlyGross: null, monthlySalary: null, monthlyDefined: false, needsPackage: true, nonCompliant: true };
  }
  const empSkill = normalizeSkill(emp.skillType || "Skilled");
  const applicable = (components || []).filter((c) => {
    if (c?.isActive === false) return false;
    if (isBasicKey(c.code, c.name)) return false;
    const compSkill = normalizeSkill(c.skillType || c.applicableCategory || "ALL");
    if (compSkill !== "all" && compSkill !== empSkill) return false;
    if (c.locationId && c.locationId !== emp.locationId) return false;
    if (c.contractorId && c.contractorId !== emp.contractorId) return false;
    return true;
  });
  const numOf = (c) => Number(c.thresholdValue ?? c.value ?? c.pct ?? 0) || 0;
  // maxCap upper-limits a part BEFORE the split (mirrors backend getEmployeeWages).
  const capOf = (c, amt) => {
    let v = Math.max(Math.round(amt), 0);
    if (c.maxCap != null && Number(c.maxCap) > 0 && v > Math.round(Number(c.maxCap))) {
      v = Math.round(Number(c.maxCap));
    }
    return v;
  };
  const fixedWeights = applicable
    .filter((c) => c.thresholdType !== "percentage" && c.calcType !== "percentage")
    .map((c) => ({ key: String(c.code || c.name), weight: capOf(c, numOf(c)) }));
  const basicPctParts = applicable
    .filter((c) => (c.thresholdType === "percentage" || c.calcType === "percentage") && !isPctFromGross(c))
    .map((c) => ({ key: String(c.code || c.name), amount: capOf(c, Math.round((basicMonthly * numOf(c)) / 100)) }));
  const envelopeForPct = storedMonthly > 0
    ? storedMonthly
    : (() => {
        const gRatio = applicable
          .filter((c) => (c.thresholdType === "percentage" || c.calcType === "percentage") && isPctFromGross(c))
          .reduce((s, c) => s + numOf(c) / 100, 0);
        const denom = 1 - gRatio;
        const fixedSum = fixedWeights.reduce((s, w) => s + w.weight, 0);
        const bSum = basicPctParts.reduce((s, p) => s + p.amount, 0);
        return denom > 0 ? Math.round((basicMonthly + bSum + fixedSum) / denom) : Math.round(basicMonthly + bSum + fixedSum);
      })();
  const grossPctParts = applicable
    .filter((c) => (c.thresholdType === "percentage" || c.calcType === "percentage") && isPctFromGross(c))
    .map((c) => ({ key: String(c.code || c.name), amount: capOf(c, Math.round((envelopeForPct * numOf(c)) / 100)) }));
  const split = splitMonthlyPackage({
    target: storedMonthly > 0 ? storedMonthly : envelopeForPct,
    basic: basicMonthly,
    fixedWeights,
    basicPctParts,
    grossPctParts,
  });
  return { basicMonthly: split.basic, monthlyGross: split.gross, monthlySalary: split.gross, monthlyDefined: true, needsPackage: false, nonCompliant: split.nonCompliant };
}
