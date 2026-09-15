/* Remove unused import specifiers from import blocks, deterministically.
 * Usage: node _codemod_imports.cjs
 * Edit the PLAN below, then run. Safe: only touches lines inside `import { ... } from "..."` blocks.
 */
const fs = require("fs");
const path = require("path");

const PLAN = [
  { file: "src/components/payroll/BlueCollarPayrollPanel.jsx", remove: ["Filter", "ShieldCheck", "FileDown"] },
  { file: "src/components/payroll/ContractorBillingPanel.jsx", remove: ["Phone", "Mail", "Percent", "DollarSign", "ShieldCheck"] },
  { file: "src/components/payroll/DeductionsPanel.jsx", remove: ["Percent", "Check", "DollarSign", "Layers"] },
  { file: "src/components/payroll/EarningsPanel.jsx", remove: ["Layers", "Hash", "Briefcase"] },
  { file: "src/components/payroll/PayRulesPanel.jsx", remove: ["AlertCircle", "Trash2"] },
  { file: "src/components/payroll/ProductionRecordsPanel.jsx", remove: ["CheckCircle2", "TrendingUp"] },
  { file: "src/components/payroll/WageRatesPanel.jsx", remove: ["Calculator"] },
  { file: "src/pages/Attendance/Attendance.jsx", remove: ["Home", "Filter", "Briefcase", "Building2"] },
  { file: "src/pages/Employees/BulkImportPreviewModal.jsx", remove: ["X"] },
  { file: "src/pages/Employees/EmployeeProfile.jsx", remove: ["Calendar", "Factory"] },
  { file: "src/pages/ESS/ESS.jsx", remove: ["EXPORT_EXPIRY_HOURS"] },
  { file: "src/pages/Payroll/Payroll.jsx", remove: ["CheckCircle2", "getEmployeePayrollSummary", "inr", "getSkillMeta"] },
  { file: "src/pages/PayslipBranding/PayslipBranding.jsx", remove: ["Download", "Check", "Copy", "Calendar", "CreditCard", "MapPin", "Clock", "Maximize2", "calculateBlueprint"] },
  { file: "src/pages/PayslipDesigner/PayslipDesigner.jsx", remove: ["ArrowUpDown", "ArrowUp", "ArrowDown"] },
  { file: "src/pages/Policies/Policies.jsx", remove: ["ExternalLink"] },
  { file: "src/pages/Recruitment/Recruitment.jsx", remove: ["X"] },
  { file: "src/pages/SecurityAdmin/SecurityAdmin.jsx", remove: ["updateSsoConfig"] },
  { file: "src/pages/Tasks/Tasks.jsx", remove: ["getTaskTotalHours"] },
  { file: "src/pages/Travel/Travel.jsx", remove: ["employeeGradeDirectory"] },
  { file: "src/components/payslip/ClassicTablePayslip.jsx", remove: ["React"] },
  { file: "src/components/shared/EmployeeSearchBox.jsx", remove: ["React"] },
  { file: "src/tests/App.smoke.test.jsx", remove: ["React"] },
  { file: "src/pages/Dashboard/HRDashboard.jsx", remove: ["HiringChart"] },
];

const root = __dirname;
let changedFiles = 0;

const IMPORT_RE = /import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["'];?/g;

function cleanBraces(content, remove) {
  if (content.includes("\n")) {
    // multi-line: drop whole lines whose name is removed
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    return content
      .split(/\r?\n/)
      .filter((line) => {
        const m = /^\s*([A-Za-z0-9_$]+)\s*,?\s*$/.exec(line);
        return !(m && remove.includes(m[1]));
      })
      .join(eol);
  }
  // single-line: filter tokens
  const parts = content.split(",").map((s) => s.trim()).filter(Boolean);
  return " " + parts.filter((p) => !remove.includes(p.replace(/^\s*|\s*$/g, ""))).join(", ") + " ";
}

for (const entry of PLAN) {
  const abs = path.join(root, entry.file);
  if (!fs.existsSync(abs)) {
    console.log("MISSING FILE:", entry.file);
    continue;
  }
  const src = fs.readFileSync(abs, "utf8");
  let changed = false;
  let next = src.replace(IMPORT_RE, (full, def, braces) => {
    const removeHere = entry.remove.filter((name) => {
      const names = braces.split(",").map((s) => s.trim());
      return names.includes(name) || (def === name);
    });
    if (!removeHere.length) return full;
    changed = true;
    const newDefault = def && entry.remove.includes(def) ? "" : def ? def + ", " : "";
    const newBraces = cleanBraces(braces, removeHere);
    const fromPart = full.slice(full.indexOf("} from"));
    return `import ${newDefault}{${newBraces}}${fromPart.slice(1)}`;
  });
  // Default-only imports: `import X from "mod";`
  next = next.replace(/^import\s+([A-Za-z0-9_$]+)\s+from\s+["'][^"']+["'];?\r?\n/gm, (full, def) => {
    if (!entry.remove.includes(def)) return full;
    changed = true;
    return "";
  });
  if (changed) {
    fs.writeFileSync(abs, next, "utf8");
    changedFiles += 1;
    console.log("UPDATED:", entry.file);
  } else {
    console.log("NO CHANGE:", entry.file);
  }
}
console.log("files changed:", changedFiles);
