/**
 * Shared blueprint types for the Smart Payslip Designer.
 * The blueprint is a JSON document persisted on PayslipTemplateVersion.
 */

import type { PayComponent, ComponentLogic, ThresholdConfig } from "./calc";

export interface BlueprintTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  font: string;
  logo?: string;
  pageSize: string;      // "A4"
  orientation: string;   // "portrait" | "landscape"
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface UIBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComponentUI {
  x: number;
  y: number;
  w: number;
  h: number;
  style?: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: "left" | "center" | "right";
    fontFamily?: string;
  };
  label?: string;
}

export interface Nest {
  id: string;
  name: string;
  parentId?: string | null;
  displayOrder: number;
  expandByDefault?: boolean;
  collapsible?: boolean;
  visible?: boolean;
  backgroundColor?: string;
  borderStyle?: "none" | "solid" | "dashed";
  borderColor?: string;
  headerStyle?: string;
  autoAssign?: boolean;
  systemDefault?: boolean;
}

export interface BlueprintComponent extends PayComponent {
  ui: ComponentUI;
  dataBinding?: {
    source?: string;
    format?: string;
    label?: string;
  };
  nestId?: string | null;
  displayOrder?: number;
  tax?: {
    oldRegime?: { treatment?: string; section?: string; formula?: string };
    newRegime?: { treatment?: string; section?: string; formula?: string };
  };
  visibility?: { field?: string; operator?: "eq" | "gt" | "gte" | "lt" | "lte" | "ne"; value?: string | number };
  mandatory?: boolean;
  autoAssigned?: boolean;
  autoReason?: string | null;
  override?: { manual?: string | null; reason?: string | null; byId?: string | null; at?: string | null };
}

export interface Blueprint {
  name: string;
  country: string;
  state: string | null;
  financialYear: number;
  theme: BlueprintTheme;
  nests: Nest[];
  components: BlueprintComponent[];
  taxConfig?: {
    defaultRegime: "OLD" | "NEW";
    employeeChoiceAllowed: boolean;
    selectionDeadline?: string;
    regimes: ("OLD" | "NEW")[];
  };
  settings?: {
    companyName?: string;
    companyEmployeeCount?: number;
    skillType?: string;
    tags?: string[];
  };
}

export { PayComponent, ComponentLogic, ThresholdConfig };
export type { ComponentUI as UIComponent };