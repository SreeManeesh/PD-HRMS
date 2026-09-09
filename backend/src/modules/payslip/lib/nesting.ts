/**
 * Nesting engine — parent/child groups for payslip components.
 * Pure functions over the blueprint.
 */

import type { Blueprint, Nest, BlueprintComponent } from "./types";

export interface NestTree extends Nest {
  children: NestTree[];
  componentIds: string[];
}

export function buildNestTree(nests: Nest[]): NestTree[] {
  const byId = new Map<string, Nest & { children: NestTree[]; componentIds: string[] }>();
  for (const n of nests) {
    byId.set(n.id, { ...n, children: [], componentIds: [] });
  }
  const roots: NestTree[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const sort = (arr: NestTree[]) => {
    arr.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    arr.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function assignComponentsToNests(
  nests: Nest[],
  components: BlueprintComponent[]
): { tree: NestTree[]; orphanIds: string[] } {
  const tree = buildNestTree(nests);
  // index paths for O(1) addition
  const index = new Map<string, NestTree>();
  const flatten = (arr: NestTree[]) => arr.forEach((n) => { index.set(n.id, n); flatten(n.children); });
  flatten(tree);

  const orphanIds: string[] = [];
  for (const c of components) {
    if (c.nestId && index.has(c.nestId)) {
      index.get(c.nestId)!.componentIds.push(c.id);
    } else {
      orphanIds.push(c.id);
    }
  }
  return { tree, orphanIds };
}

/** Detect circular nesting (a nest ultimately being its own ancestor). */
export function findNestingCycle(nests: Nest[]): string[] | null {
  const byId = new Map(nests.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const walk = (id: string): string[] | null => {
    if (inStack.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visited.add(id);
    inStack.add(id);
    stack.push(id);
    const n = byId.get(id);
    if (n?.parentId && byId.has(n.parentId)) {
      const cycle = walk(n.parentId);
      if (cycle) return cycle;
    }
    stack.pop();
    inStack.delete(id);
    return null;
  };
  for (const id of byId.keys()) {
    const cycle = walk(id);
    if (cycle) return cycle;
  }
  return null;
}

/** Orphan components (referencing a missing nest) + orphans of missing parents. */
export function validateNests(nests: Nest[], components: BlueprintComponent[]) {
  const nestIds = new Set(nests.map((n) => n.id));
  const cycle = findNestingCycle(nests);
  const missingParent = nests.filter((n) => n.parentId && !nestIds.has(n.parentId)).map((n) => n.id);
  const orphanComponents = components.filter((c) => c.nestId && !nestIds.has(c.nestId)).map((c) => c.id);
  const unassignedComponents = components.filter((c) => !c.nestId).map((c) => c.id);
  return { cycle, missingParent, orphanComponents, unassignedComponents };
}

/** Default nest set produced by auto-configuration (India). */
export const DEFAULT_NESTS: Nest[] = [
  { id: "fixed_pay", name: "Fixed Pay", displayOrder: 10, expandByDefault: true, systemDefault: true, autoAssign: true },
  { id: "variable_pay", name: "Variable Pay", displayOrder: 20, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "benefits", name: "Benefits & Reimbursements", displayOrder: 30, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "statutory_deductions", name: "Statutory Deductions", displayOrder: 40, expandByDefault: true, systemDefault: true, autoAssign: true },
  { id: "employer_contributions", name: "Employer Contributions", displayOrder: 50, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "state_specific", name: "State-Specific", displayOrder: 60, expandByDefault: false, systemDefault: true, autoAssign: true },
];