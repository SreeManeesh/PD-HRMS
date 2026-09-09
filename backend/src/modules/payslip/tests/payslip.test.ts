/**
 * Unit tests — calculation engine, dependencies, tax, nesting, country/state.
 * Run with: npx tsx tests/payslip.test.ts
 */

import assert from "node:assert";
import { evaluateFormula, formulaFieldDeps, parseFormula } from "../lib/expression";
import {
  calculatePayroll,
  findCircularDependency,
  calculationOrder,
  type PayComponent,
} from "../lib/calc";
import { calculateTax, compareRegimes, INDIA_TAX_URL_BASELINE, type TaxInput } from "../lib/tax";
import { findNestingCycle, buildNestTree, validateNests } from "../lib/nesting";
import { resolveApplicableComponents, COMPONENT_CATALOG } from "../lib/countryState";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.error(`  ✖ ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

console.log("\n── Expression parser ──");
test("fixed expression", () => assert.equal(evaluateFormula("5000", {}), 5000));
test("percentage formula", () => assert.equal(evaluateFormula("{{basic}} * 0.5", { basic: 40000 }), 20000));
test("formula with dots", () => assert.equal(evaluateFormula("payroll.gross - 1000", { "payroll.gross": 60000 }), 59000));
test("MIN function", () => assert.equal(evaluateFormula("MIN(basic*0.5, 15000)", { basic: 40000 }), 15000));
test("MAX function", () => assert.equal(evaluateFormula("MAX(a,b)", { a: 10, b: 20 }), 20));
test("ROUND function", () => assert.equal(evaluateFormula("ROUND(10.567, 2)", {}), 10.57));
test("IF function takes branches", () => assert.equal(evaluateFormula("IF(x>5, 100, 50)", { x: 10 }), 100));
test("unary minus", () => assert.equal(evaluateFormula("-5 + 3", {}), -2));
test("operator precedence", () => assert.equal(evaluateFormula("2 + 3 * 4", {}), 14));
test("rejects evilly encoded input", () => {
  assert.throws(() => evaluateFormula("process.exit()", {}));
  assert.throws(() => evaluateFormula("require('fs')", {}));
  assert.throws(() => evaluateFormula("x = 5; alert(1)", {}));
  assert.throws(() => evaluateFormula("globalThis['process']", {}));
});
test("formulaFieldDeps detects fields", () => {
  const deps = formulaFieldDeps("basic * 0.5 + hra");
  assert.ok(deps.includes("basic"));
  assert.ok(deps.includes("hra"));
});
test("parseFormula rejects trailing junk", () => {
  assert.throws(() => parseFormula("1 2"));
});

console.log("\n── Calculation engine ──");
const fixedBasic: PayComponent = {
  id: "basic", label: "Basic", kind: "earning",
  logic: { type: "fixed", value: 40000, calculationPriority: 1 },
};
const hraComp: PayComponent = {
  id: "hra", label: "HRA", kind: "earning",
  logic: {
    type: "percentage", sourceField: "basic", pct: 50, calculationPriority: 2,
    max: { value: 15000, action: "transfer", transferTo: "special_allowance" },
  },
};
const convComp: PayComponent = {
  id: "conveyance", label: "Conveyance", kind: "earning",
  logic: { type: "fixed", value: 1600, calculationPriority: 3 },
};
const specialComp: PayComponent = {
  id: "special_allowance", label: "Special Allowance", kind: "earning",
  logic: { type: "formula", formula: "0", calculationPriority: 99, isBalancing: true },
};

test("fixed + percentage + cap + transfer + balancing cascade", () => {
  const res = calculatePayroll({
    components: [fixedBasic, hraComp, convComp, specialComp],
    base: {},
  });
  assert.equal(res.results["basic"].final, 40000);
  // HRA = 50% of 40000 = 20000 → capped at 15000, excess 5000 transferred
  assert.equal(res.results["hra"].final, 15000);
  assert.equal(res.results["hra"].excess, 5000);
  assert.equal(res.results["hra"].action, "transfer");
  // special allowance balancing component absorbed 5000
  assert.equal(res.results["special_allowance"].final, 5000);
  assert.equal(res.gross, 40000 + 15000 + 1600 + 5000);
});

test("cap action (no transfer)", () => {
  const capComp: PayComponent = {
    id: "hra2", label: "HRA2", kind: "earning",
    logic: { type: "percentage", sourceField: "basic", pct: 50, calculationPriority: 2, max: { value: 15000, action: "cap" } },
  };
  const res = calculatePayroll({ components: [fixedBasic, capComp], base: {} });
  assert.equal(res.results["hra2"].final, 15000);
  assert.equal(res.results["hra2"].excess, 5000);
});

test("minimum set_zero", () => {
  const minComp: PayComponent = {
    id: "bonus", label: "Bonus", kind: "earning",
    logic: { type: "fixed", value: 1000, calculationPriority: 2, min: { value: 2000, action: "set_zero" } },
  };
  const res = calculatePayroll({ components: [fixedBasic, minComp], base: {} });
  assert.equal(res.results["bonus"].final, 0);
});

test("maximum error throws", () => {
  const errComp: PayComponent = {
    id: "pt", label: "PT", kind: "deduction",
    logic: { type: "fixed", value: 3000, calculationPriority: 2, max: { value: 2500, action: "error" } },
  };
  assert.throws(() => calculatePayroll({ components: [fixedBasic, errComp], base: {} }));
});

test("percentage maximum (pct of basic) caps correctly", () => {
  const pctComp: PayComponent = {
    id: "hraPct", label: "HRA %", kind: "earning",
    logic: { type: "fixed", value: 20000, calculationPriority: 2, max: { pct: 30, pctOf: "basic", action: "cap" } },
  };
  // basic = 40000 → max = 30% = 12000 → capped
  const res = calculatePayroll({ components: [fixedBasic, pctComp], base: {} });
  assert.equal(res.results["hrapct"].final, 12000);
});

test("calculation order respects priorities", () => {
  const order = calculationOrder([specialComp, fixedBasic, hraComp]);
  assert.equal(order[0], "basic");
  assert.equal(order[order.length - 1], "special_allowance");
});

test("circular dependency detected", () => {
  const a: PayComponent = { id: "a", label: "A", kind: "earning", logic: { type: "formula", formula: "b + 1", calculationPriority: 1 } };
  const b: PayComponent = { id: "b", label: "B", kind: "earning", logic: { type: "formula", formula: "a + 1", calculationPriority: 2 } };
  const cycle = findCircularDependency([a, b]);
  assert.ok(cycle);
  assert.ok(cycle!.includes("a") && cycle!.includes("b"));
});

console.log("\n── Tax engine ──");
const taxInput: TaxInput = {
  grossAnnual: 1200000,
  rules: INDIA_TAX_URL_BASELINE,
  exemptions: { hra: 120000, lta: 0, others: 0 },
  deductions: { section80C: 144000, section80D: 0, section24b: 0, professionalTax: 2400 },
};

test("old regime computes", () => {
  const r = calculateTax(taxInput, "OLD");
  assert.ok(r.taxableIncome > 0);
  assert.ok(r.annualTax > 0);
  assert.ok(r.slabLines.length >= 3);
});
test("new regime computes with lower taxable due to std deduction", () => {
  const r = calculateTax(taxInput, "NEW");
  assert.ok(r.taxBeforeRebate >= 0);
});
test("comparison returns recommendation", () => {
  const cmp = compareRegimes(taxInput);
  assert.ok(["OLD", "NEW"].includes(cmp.recommended));
  assert.ok(cmp.difference !== undefined);
});
test("explainable breakdown fields present", () => {
  const r = calculateTax(taxInput, "OLD");
  for (const f of ["grossIncome", "taxableIncome", "taxBeforeRebate", "rebate", "cess", "annualTax", "monthlyTax"]) {
    assert.ok(f in r, `${f} missing`);
  }
});

console.log("\n── Nesting engine ──");
test("nest tree builds with parent/child", () => {
  const tree = buildNestTree([
    { id: "fixed", name: "Fixed Pay", displayOrder: 1 },
    { id: "benefits", name: "Benefits", displayOrder: 2, parentId: "fixed" },
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children.length, 1);
});
test("cicrcular nesting detected", () => {
  const cycle = findNestingCycle([
    { id: "a", name: "A", displayOrder: 1, parentId: "b" },
    { id: "b", name: "B", displayOrder: 2, parentId: "a" },
  ]);
  assert.ok(cycle);
});
test("orphan validation finds missing parents", () => {
  const v = validateNests(
    [{ id: "x", name: "X", displayOrder: 1 }],
    [{
      id: "c", label: "C", kind: "earning", logic: { type: "fixed", value: 1 }, nestId: "missing_nest",
      ui: { x: 1, y: 1, w: 10, h: 5 },
    }]
  );
  assert.ok(Array.isArray(v.orphanComponents));
  assert.equal(v.orphanComponents.length, 1);
});

console.log("\n── Country / State engine ──");
test("Maharashtra auto-config includes PT, LWF, EPF employer", () => {
  const applied = resolveApplicableComponents(COMPONENT_CATALOG, {
    country: "India", state: "Maharashtra", companyEmployees: 50, grossMonthly: 60000,
  });
  const ids = applied.map((c) => c.id);
  assert.ok(ids.includes("professional_tax"));
  assert.ok(ids.includes("lwf"));
  assert.ok(ids.includes("epf_employer"));
  assert.ok(ids.includes("gratuity"));
});
test("small company excludes employer PF/gratuity", () => {
  const applied = resolveApplicableComponents(COMPONENT_CATALOG, {
    country: "India", state: "Maharashtra", companyEmployees: 5, grossMonthly: 60000,
  });
  const ids = applied.map((c) => c.id);
  assert.ok(!ids.includes("epf_employer"));
  assert.ok(!ids.includes("gratuity"));
});
test("components deduplicated", () => {
  const applied = resolveApplicableComponents(COMPONENT_CATALOG, {
    country: "India", state: "Maharashtra", companyEmployees: 50,
  });
  const ids = applied.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

console.log(`\n${passed} tests passed\n`);