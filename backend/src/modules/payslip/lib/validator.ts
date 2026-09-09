/**
 * Pre-publish validation for a payslip blueprint.
 * Returns actionable error strings grouped by area.
 */

import type { Blueprint } from "./types";
import { findCircularDependency, fullDeps, calculationOrder } from "./calc";
import { findNestingCycle } from "./nesting";

export interface ValidationReport {
  ok: boolean;
  layout: string[];
  calculation: string[];
  tax: string[];
  countryState: string[];
  nesting: string[];
}

export function validateBlueprint(bp: Blueprint): ValidationReport {
  const report: ValidationReport = {
    ok: true,
    layout: [],
    calculation: [],
    tax: [],
    countryState: [],
    nesting: [],
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const compIds = new Set(bp.components.map((c) => c.id.toLowerCase()));
  for (const c of bp.components) {
    const { x, y, w, h } = c.ui || {};
    if (x === undefined || y === undefined || w === undefined || h === undefined) {
      report.layout.push(`${c.label} (${c.id}): missing coordinates or size.`);
    }
    if ((w ?? 0) <= 0 || (h ?? 0) <= 0) {
      report.layout.push(`${c.label} (${c.id}): invalid size (w/h must be > 0).`);
    }
  }
  // overlap detection (simple bounding boxes, only where hindered)
  const boxes = bp.components.map((c) => ({ id: c.id, ...c.ui }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      if (overlap) {
        report.layout.push(`Components "${a.id}" and "${b.id}" overlap on the canvas.`);
      }
    }
  }

  // ── Calculation ───────────────────────────────────────────────────────────
  const cycle = findCircularDependency(bp.components);
  if (cycle) {
    report.calculation.push(`Circular calculation dependency detected: ${cycle.join(" → ")}.`);
  } else {
    try { calculationOrder(bp.components); } catch (e) {
      report.calculation.push((e as Error).message);
    }
  }
  const depsByComp = fullDeps(bp.components);
  for (const c of bp.components) {
    for (const d of depsByComp.get(c.id.toLowerCase()) || []) {
      if (!compIds.has(d)) {
        report.calculation.push(`${c.label} (${c.id}): references missing component/field "${d}".`);
      }
    }
    const max = c.logic.max;
    if (max?.action === "transfer") {
      if (!max.transferTo) report.calculation.push(`${c.label} (${c.id}): transfer action needs a transfer target.`);
      else if (!compIds.has(max.transferTo.toLowerCase())) report.calculation.push(`${c.label} (${c.id}): transfer target "${max.transferTo}" doesn't exist.`);
    }
    if (c.logic.type === "percentage" && !c.logic.sourceField) {
      report.calculation.push(`${c.label} (${c.id}): percentage logic needs a source field.`);
    }
  }
  const balancers = bp.components.filter((c) => c.logic.isBalancing);
  if (!balancers.length) {
    report.calculation.push("No balancing component is configured; excess transfers will be lost.");
  }

  // ── Tax ───────────────────────────────────────────────────────────────────
  if (!bp.taxConfig || !bp.taxConfig.regimes?.length) {
    report.tax.push("Tax regimes are not configured for this template.");
  } else {
    if (!bp.taxConfig.defaultRegime) report.tax.push("Default tax regime is not set.");
    if (!bp.financialYear) report.tax.push("Financial year is not set.");
  }

  // ── Country/State ─────────────────────────────────────────────────────────
  if (!bp.country) report.countryState.push("Country is not set.");
  else if (bp.state && bp.country !== "India") report.countryState.push(`State-specific rules only resolve for India (got ${bp.country}).`);

  // ── Nesting ───────────────────────────────────────────────────────────────
  const nestCycle = findNestingCycle(bp.nests || []);
  if (nestCycle) report.nesting.push(`Circular nesting detected: ${nestCycle.join(" → ")}.`);
  const nestIds = new Set((bp.nests || []).map((n) => n.id));
  for (const n of bp.nests || []) {
    if (n.parentId && !nestIds.has(n.parentId)) {
      report.nesting.push(`Nest "${n.name}" (${n.id}) references missing parent "${n.parentId}".`);
    }
  }
  for (const c of bp.components) {
    if (c.nestId && !nestIds.has(c.nestId)) {
      report.nesting.push(`Component "${c.label}" (${c.id}) references missing nest "${c.nestId}".`);
    }
  }

  report.ok = report.layout.length === 0 &&
    report.calculation.length === 0 &&
    report.tax.length === 0 &&
    report.countryState.length === 0 &&
    report.nesting.length === 0;
  return report;
}