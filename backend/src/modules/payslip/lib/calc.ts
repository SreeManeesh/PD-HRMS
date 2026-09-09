/**
 * Payroll calculation engine.
 *
 * Pure / framework-free so it can be unit-tested and reused anywhere.
 * Operates on a JSON-blueprint of components. Each component declares:
 *
 *   {
 *     id, label,
 *     kind: "earning" | "deduction" | "employer" | "reimbursement",
 *     logic: {
 *       type: "fixed" | "percentage" | "formula",
 *       value?,               // fixed
 *       sourceField?, pct?,   // percentage: pct% of <sourceField> value
 *       formula?,             // safe formula string
 *       calculationPriority,
 *       isBalancing?: boolean,
 *       min?: { value? | formula?, action },
 *       max?: { value? | formula?, action: "cap"|"transfer"|"error"|"set_zero"|"ignore", transferTo? },
 *     }
 *   }
 *
 * The engine sorts by calculationPriority with dependency-aware topological
 * order, evaluates component-by-component, applies min/max with transfers, and
 * lets a designated balancing component absorb accumulated excess.
 */

import { evaluateFormula, formulaFieldDeps } from "./expression";

export interface ThresholdConfig {
  /** Absolute rupee amount OR percentage (pct + pctOf) — whichever is set. */
  value?: number;
  formula?: string;
  /** Percentage threshold: `pct` % of the value of field `pctOf`. */
  pct?: number;
  pctOf?: string;
  action: "set_zero" | "cap" | "transfer" | "error" | "ignore";
  transferTo?: string;
}

export interface ComponentLogic {
  type: "fixed" | "percentage" | "formula";
  value?: number;
  sourceField?: string;
  pct?: number;
  formula?: string;
  calculationPriority?: number;
  isBalancing?: boolean;
  min?: ThresholdConfig;
  max?: ThresholdConfig;
}

export interface PayComponent {
  id: string;
  label: string;
  kind: "earning" | "deduction" | "employer" | "reimbursement";
  logic: ComponentLogic;
  visible?: boolean;
  tax?: Record<string, unknown>;
}

export interface ComponentResult {
  computed: number;
  final: number;
  min?: number;
  max?: number;
  excess?: number;
  transferFrom?: number;
  action?: string;
  note?: string;
  order: number;
  formula?: string;
}

export type ComponentResults = Record<string, ComponentResult>;

export function buildContext(
  base: Record<string, number>,
  results: ComponentResults
): Record<string, number> {
  const ctx: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) ctx[k.toLowerCase()] = v;
  for (const [k, v] of Object.entries(results)) ctx[k.toLowerCase()] = v.final;
  return ctx;
}

function evalThreshold(t: ThresholdConfig | undefined, ctx: Record<string, number>): number | undefined {
  if (!t) return undefined;
  if (t.value !== undefined) return t.value;
  if (t.pct !== undefined && t.pctOf) {
    const base = ctx[t.pctOf.toLowerCase()] ?? ctx[t.pctOf] ?? 0;
    return base * (t.pct / 100);
  }
  if (t.formula) return evaluateFormula(t.formula, ctx);
  return undefined;
}

/** Detect circular dependencies among components. Returns the cycle path or null. */
export function findCircularDependency(components: PayComponent[]): string[] | null {
  const deps = fullDeps(components);
  const ids = new Set(components.map((c) => c.id.toLowerCase()));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  const walk = (id: string): string[] | null => {
    if (inStack.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visited.add(id);
    inStack.add(id);
    stack.push(id);
    for (const dep of deps.get(id) || []) {
      if (ids.has(dep)) {
        const cycle = walk(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    inStack.delete(id);
    return null;
  };
  for (const id of ids) {
    const cycle = walk(id);
    if (cycle) return cycle;
  }
  return null;
}

export function formulaDeps(comp: PayComponent): string[] {
  const list: string[] = [];
  if (comp.logic.type === "percentage" && comp.logic.sourceField) list.push(comp.logic.sourceField.toLowerCase());
  for (const d of formulaFieldDeps(comp.logic.formula || "")) list.push(d.toLowerCase());
  return list;
}

/** Dependencies WITH transfer direction: if component A transfers excess to B,
 *  B depends on A (B computes after A). */
export function fullDeps(components: PayComponent[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const byId = new Map(components.map((c) => [c.id.toLowerCase(), c]));
  for (const c of components) {
    const list = new Set(formulaDeps(c));
    // any component that transfers INTO this one becomes a dependency
    for (const other of components) {
      if (other.logic.max?.transferTo && other.logic.max.transferTo.toLowerCase() === c.id.toLowerCase()) {
        if (other.id.toLowerCase() !== c.id.toLowerCase()) list.add(other.id.toLowerCase());
      }
    }
    map.set(c.id.toLowerCase(), [...list].filter((d) => byId.has(d)));
  }
  return map;
}

/** Topological order (by priority tie-break); throws on cycles. */
export function calculationOrder(components: PayComponent[]): string[] {
  const byId = new Map(components.map((c) => [c.id.toLowerCase(), c]));
  const ids = [...byId.keys()];
  const dep = fullDeps(components);

  const indeg = new Map<string, number>();
  for (const id of ids) indeg.set(id, 0);
  // edge: dependency d → node; node's indeg counts its dependencies
  for (const [node, dlist] of dep) {
    indeg.set(node, (indeg.get(node) ?? 0) + dlist.length);
  }

  const ready = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) =>
      (byId.get(a)?.logic.calculationPriority ?? 999) - (byId.get(b)?.logic.calculationPriority ?? 999)
    );
    const id = ready.shift()!;
    order.push(id);
    for (const [other, dlist] of dep) {
      if (dlist.includes(id)) {
        indeg.set(other, (indeg.get(other) ?? 0) - 1);
        if ((indeg.get(other) ?? 0) === 0) ready.push(other);
      }
    }
  }
  if (order.length !== ids.length) throw new Error("Circular calculation dependency detected.");
  return order;
}

export interface CalcInput {
  components: PayComponent[];
  base: Record<string, number>;
  external?: Record<string, number>;
}

export interface CalcResult {
  results: ComponentResults;
  order: string[];
  allOrder: string[];
  earningsTotal: number;
  deductionsTotal: number;
  employerTotal: number;
  gross: number;
  net: number;
  notes: string[];
}

export function calculatePayroll(input: CalcInput): CalcResult {
  const { components, base, external = {} } = input;
  const notes: string[] = [];
  const results: ComponentResults = {};
  const byLower = new Map(components.map((c) => [c.id.toLowerCase(), c]));

  // Phase 1 — evaluation in dependency/priority order
  const order = calculationOrder(components);
  // track transfers: targetId -> accumulated excess to be absorbed
  const transfers = new Map<string, number>();

  // ctx builder that includes external + base + results so far
  const ctx = () => buildContext({ ...base, ...external }, results);

  for (const id of order) {
    const comp = byLower.get(id)!;
    if (comp.visible === false) continue;
    const logic = comp.logic;

    let computed = 0;
    if (logic.type === "fixed") {
      // Explicit value wins; otherwise pull from the base/context by id so
      // components like "basic" (auto-configured as fixed with no literal)
      // pick up the employee's actual salary from the base context.
      computed = logic.value !== undefined ? logic.value : (ctx()[id] ?? 0);
    }
    else if (logic.type === "percentage") {
      const b = logic.sourceField ? ctx()[logic.sourceField.toLowerCase()] ?? 0 : 0;
      computed = b * ((logic.pct ?? 0) / 100);
    } else if (logic.type === "formula") {
      computed = evaluateFormula(logic.formula || "0", ctx());
    }

    let final = computed;
    let minVal: number | undefined;
    let maxVal: number | undefined;
    let excess: number | undefined;
    let action: string | undefined;
    let note: string | undefined;
    const transferFrom = transfers.get(id) ?? 0;

    // min threshold
    const minThreshold = evalThreshold(logic.min, ctx());
    if (minThreshold !== undefined) {
      minVal = minThreshold;
      if (computed < minThreshold) {
        switch (logic.min?.action) {
          case "set_zero": final = 0; action = "min:set_zero"; break;
          case "cap": final = minThreshold; action = "min:cap"; break;
          case "error": throw new Error(`${comp.label}: below minimum threshold (${minThreshold})`);
          case "ignore": break;
          default: final = minThreshold;
        }
      }
    }

    // max threshold
    const maxThreshold = evalThreshold(logic.max, ctx());
    if (maxThreshold !== undefined) {
      maxVal = maxThreshold;
      if (computed > maxThreshold) {
        excess = computed - maxThreshold;
        switch (logic.max?.action) {
          case "cap": final = maxThreshold; action = "cap"; break;
          case "set_zero": final = 0; action = "set_zero"; break;
          case "transfer": {
            final = maxThreshold;
            action = "transfer";
            const target = logic.max?.transferTo;
            if (target) {
              transfers.set(target.toLowerCase(), (transfers.get(target.toLowerCase()) ?? 0) + excess);
              note = `Excess ${excess} transferred to ${target}`;
            }
            break;
          }
          case "error": throw new Error(`${comp.label}: exceeds maximum threshold (${maxThreshold})`);
          case "ignore": break;
          default: final = maxThreshold;
        }
      }
    }

    // balancing component absorbs accumulated excess
    if (logic.isBalancing) {
      final = computed + (transferFrom ?? 0);
      if (transferFrom > 0) {
        action = "balancing";
        note = `Absorbed ${transferFrom} from transferred excess`;
        transfers.delete(id);
      }
    }

    final = Math.round(final * 100) / 100;
    results[id] = {
      computed: Math.round(computed * 100) / 100,
      final,
      ...(minVal !== undefined ? { min: minVal } : {}),
      ...(maxVal !== undefined ? { max: maxVal } : {}),
      ...(excess !== undefined ? { excess: Math.round(excess * 100) / 100 } : {}),
      ...(transferFrom ? { transferFrom } : {}),
      ...(action ? { action } : {}),
      ...(note ? { note } : {}),
      order: logic.calculationPriority ?? 999,
      formula: logic.formula,
    };
    if (note) notes.push(`${comp.label}: ${note}`);
  }

  // Phase 2 — totals + net
  let earningsTotal = 0;
  let deductionsTotal = 0;
  let employerTotal = 0;
  const allOrder = calculationOrder(components);
  for (const [id, r] of Object.entries(results)) {
    const c = byLower.get(id);
    if (!c) continue;
    if (c.kind === "earning") earningsTotal += r.final;
    else if (c.kind === "deduction") deductionsTotal += r.final;
    else if (c.kind === "employer") employerTotal += r.final;
  }
  const gross = earningsTotal;
  const net = earningsTotal - deductionsTotal;

  return {
    results,
    order,
    allOrder,
    earningsTotal: Math.round(earningsTotal * 100) / 100,
    deductionsTotal: Math.round(deductionsTotal * 100) / 100,
    employerTotal: Math.round(employerTotal * 100) / 100,
    gross: Math.round(gross * 100) / 100,
    net: Math.round(net * 100) / 100,
    notes,
  };
}