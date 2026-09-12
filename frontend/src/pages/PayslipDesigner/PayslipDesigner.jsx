/**
 * Nesting Manager — organize payslip components into parent/child nesting
 * groups, control calculation order, preview tax and manage versions.
 *
 * The visual canvas design editor, Theme and Preview were moved out — Theme +
 * Preview now live in the Payslip Branding page.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Trash2, Save, Layers,
  SlidersHorizontal, Calculator, FolderTree, Search,
  ChevronDown, ChevronRight,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import {
  listPayslipTemplates, createPayslipTemplate, getPayslipTemplate, savePayslipDraft,
  listPayslipVersions, publishPayslipTemplate, restorePayslipVersion,
  getComponentCatalog, getAutoConfig,
  calculateBlueprint, compareTaxForBlueprint,
  validateBlueprint,
} from "../../services/payslipDesignerService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { inr } from "./format.js";
import { skillTypes } from "../../mock/employees.js";
import { getEmployees } from "../../services/employeeService.js";
import { getEmployeePayrollSummary } from "../../services/payrollService.js";
import "./PayslipDesigner.css";

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  secondaryColor: "#0d1b2a",
  accentColor: "#0891b2",
  font: "Helvetica",
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
};

const pdInputStyle = {
  width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)", background: "var(--card)", outline: "none",
};

const DEFAULT_NESTS = [
  { id: "fixed_pay", name: "Fixed Pay", displayOrder: 10, expandByDefault: true, systemDefault: true, autoAssign: true },
  { id: "variable_pay", name: "Variable Pay", displayOrder: 20, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "benefits", name: "Benefits & Reimbursements", displayOrder: 30, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "statutory_deductions", name: "Statutory Deductions", displayOrder: 40, expandByDefault: true, systemDefault: true, autoAssign: true },
  { id: "employer_contributions", name: "Employer Contributions", displayOrder: 50, expandByDefault: false, systemDefault: true, autoAssign: true },
  { id: "state_specific", name: "State-Specific", displayOrder: 60, expandByDefault: false, systemDefault: true, autoAssign: true },
];

const uid = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function cloneBlueprint(bp) {
  return JSON.parse(JSON.stringify(bp));
}

export function PayslipDesignerPanel() {
  const { permissions } = useAuth();
  const canWrite = permissions.includes("payroll:write");

  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState("nest");

  // ── Custom component creation (Nesting manager) ──
  const [showNewComp, setShowNewComp] = useState(false);
  const [ncLabel, setNcLabel] = useState("");
  const [ncKind, setNcKind] = useState("earning");
  const [ncType, setNcType] = useState("fixed");
  const [ncValue, setNcValue] = useState("0");
  const [ncPct, setNcPct] = useState("0");
  const [ncSource, setNcSource] = useState("ctc");
  const [ncFormula, setNcFormula] = useState("0");
  const [ncPriority, setNcPriority] = useState("20");
  const [ncNest, setNcNest] = useState("");
  const toast = useToast();
  const [calcResult, setCalcResult] = useState(null);
  const [taxCompare, setTaxCompare] = useState(null);
  const [validation, setValidation] = useState(null);
  const [versions, setVersions] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoCursor, setRedoCursor] = useState(0);
  const [matchedEmployees, setMatchedEmployees] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [empQuery, setEmpQuery] = useState("");
  const [calcEmp, setCalcEmp] = useState(null);

  // ── New nesting template (asks for a skill type) ──
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [ntName, setNtName] = useState("");
  const [ntSkillType, setNtSkillType] = useState("");

  const load = useCallback(async (id) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const [tempRes, verRes] = await Promise.all([getPayslipTemplate(id), listPayslipVersions(id)]);
      const bp0 = tempRes.data.latestBlueprint || {
        name: tempRes.data.name,
        country: tempRes.data.country || "India",
        state: tempRes.data.state || null,
        financialYear: tempRes.data.financialYear || 2026,
        theme: { ...DEFAULT_THEME },
        nests: DEFAULT_NESTS.map((n) => ({ ...n })),
        components: [],
        taxConfig: { defaultRegime: "NEW", employeeChoiceAllowed: true, regimes: ["OLD", "NEW"] },
        settings: { companyName: "Proteccio HRMS", skillType: "" },
      };
      // Percentage components are based on CTC (monthly cost-to-company), not
      // basic — migrate any legacy "basic" source on load.
      const bp = { ...bp0, components: (bp0.components || []).map((c) =>
        c.logic?.type === "percentage" && c.logic.sourceField === "basic"
          ? { ...c, logic: { ...c.logic, sourceField: "ctc" } }
          : c
      ) };
      setBlueprint(bp);
      setVersions(verRes.data || []);
      setHistory([cloneBlueprint(bp)]);
      setRedoCursor(0);
      setCalcResult(null);
      setTaxCompare(null);
      setSelectedId(null);
    } catch (e) {
      setError(e.message || "Could not load template");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setLoadingTemplates(true);
    listPayslipTemplates()
      .then((res) => {
        const list = res.data || [];
        setTemplates(list);
        if (!templateId) {
          const active = list.find((t) => t.isActive && t.status === "Published");
          const pick = (active || list[0]);
          if (pick) setTemplateId(pick.id);
        }
      })
      .catch((e) => setError(e.message || "Could not load templates"))
      .finally(() => setLoadingTemplates(false));
    getComponentCatalog().then((r) => setCatalog(r.data || [])).catch(() => setCatalog([]));
    getEmployees({ limit: 5000 }).then((res) => setEmployees(res.data || [])).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    load(templateId);
  }, [templateId, load]);

  // Pull active employees whose skill type matches this nesting template's
  // skill type — their payslips are generated from this nesting template.
  const matchedSkillType = blueprint?.settings?.skillType || "";
  useEffect(() => {
    if (!matchedSkillType) { setMatchedEmployees([]); return; }
    let active = true;
    getEmployees({ status: "Active", limit: 5000 })
      .then((res) => {
        if (!active) return;
        const list = res.data || [];
        setMatchedEmployees(list.filter((e) => (e.skillType || "") === matchedSkillType));
      })
      .catch(() => { if (active) setMatchedEmployees([]); });
    return () => { active = false; };
  }, [matchedSkillType]);

  const pushHistory = useCallback((nextBp) => {
    setBlueprint((prev) => nextBp || prev);
    if (nextBp) {
      setHistory((h) => [...h.slice(0, redoCursor + 1), cloneBlueprint(nextBp)].slice(-40));
      setRedoCursor((c) => c + 1);
    }
  }, [redoCursor]);

  const mutateBlueprint = useCallback((fn) => {
    setBlueprint((prev) => {
      const next = cloneBlueprint(prev);
      fn(next);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const undo = () => {
    if (redoCursor > 0) {
      setRedoCursor((c) => c - 1);
      setBlueprint(cloneBlueprint(history[redoCursor - 1]));
    }
  };
  const redo = () => {
    if (redoCursor < history.length - 1) {
      setRedoCursor((c) => c + 1);
      setBlueprint(cloneBlueprint(history[redoCursor + 1]));
    }
  };

  const runCalculate = useCallback(async () => {
    if (!blueprint) return;
    try {
      const base = { basic: 40000, monthlyGross: 60000, annualSalary: 720000 };
      const res = await calculateBlueprint(blueprint, base);
      setCalcResult(res.data);
    } catch (e) {
      setError(e.message || "Calculation failed");
    }
  }, [blueprint]);

  const runTaxCompare = useCallback(async () => {
    if (!blueprint) return;
    try {
      const base = { basic: 40000, monthlyGross: 60000, annualSalary: 720000 };
      const res = await compareTaxForBlueprint(blueprint, base);
      setTaxCompare(res.data);
    } catch (e) {
      setError(e.message || "Tax calculation failed");
    }
  }, [blueprint]);

  const runValidation = useCallback(async () => {
    if (!blueprint) return;
    try {
      const res = await validateBlueprint(blueprint);
      setValidation(res.data);
    } catch (e) {
      setError(e.message || "Validation failed");
    }
  }, [blueprint]);

  useEffect(() => {
    if (activeView === "tax") {
      runTaxCompare();
      runCalculate();
    }
  }, [activeView, runTaxCompare, runCalculate]);

  // Recalculate whenever the blueprint changes so the calc-flow and tax
  // views stay in sync with nesting edits (components, order, logic).
  useEffect(() => {
    if (!blueprint) return;
    if (activeView === "calcflow" || activeView === "tax" || activeView === "nest") {
      const t = window.setTimeout(() => { runCalculate(); }, 250);
      return () => window.clearTimeout(t);
    }
  }, [blueprint, activeView, runCalculate]);

  const handleSaveAndPublish = async () => {
    if (!blueprint || !templateId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // 1. Validate
      const v = await validateBlueprint(blueprint);
      setValidation(v.data);
      if (!v.data.ok) {
        setError("Validation failed — fix the errors before publishing.");
        toast("Validation failed", "error");
        setActiveView("nest");
        return;
      }
      // 2. Save the draft (persists this nesting template)
      const s = await savePayslipDraft(templateId, blueprint, "Saved from Nesting Manager (Save & Publish)");
      // 3. Publish as the active version
      const p = await publishPayslipTemplate(templateId);
      setNotice(`Validated, saved as v${s.data?.version ?? "?"} and published — active v${p.data?.version ?? "?"}`);
      toast("Nesting template saved & published");
      load(templateId);
    } catch (e) {
      setError(e.message || "Save & publish failed");
      toast(e.message || "Save & publish failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleNewTemplate = async () => {
    if (!ntName.trim() || !ntSkillType) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await createPayslipTemplate({ name: ntName.trim() });
      const id = r.data.id;
      // Tag the new nesting with the chosen skill type, then persist it as a
      // draft so payslips for employees of this skill type use this template.
      const t = await getPayslipTemplate(id);
      const bp0 = t.data.latestBlueprint || null;
      if (bp0) {
        const bp = JSON.parse(JSON.stringify(bp0));
        bp.settings = { ...(bp.settings || {}), skillType: ntSkillType };
        await savePayslipDraft(id, bp, "New nesting template with skill type");
      }
      const list = await listPayslipTemplates();
      setTemplates(list.data || []);
      setTemplateId(id);
      load(id);
      toast(`Nesting template created for ${ntSkillType}`);
    } catch (e) {
      setError(e.message || "Could not create template");
      toast(e.message || "Could not create template", "error");
    } finally {
      setBusy(false);
      setShowNewTemplate(false);
      setNtName("");
      setNtSkillType("");
    }
  };

  const handleAutoConfig = async () => {
    if (!blueprint) return;
    setBusy(true);
    try {
      const res = await getAutoConfig({
        country: blueprint.country,
        state: blueprint.state,
        companyEmployees: blueprint.settings?.companyEmployeeCount || 50,
        grossMonthly: 60000,
      });
      const autoComps = res.data || [];
      mutateBlueprint((next) => {
        const existing = new Set(next.components.map((c) => c.id));
        let order = next.components.length;
        for (const a of autoComps) {
          if (existing.has(a.id)) continue;
          next.components = [...next.components, {
            ...a,
            id: a.id,
            ui: { x: 20, y: 10 + order * 30, w: 60, h: 24 },
            nestId: a.nestId || null,
            autoAssigned: true,
            autoReason: a.autoReason || "Auto",
            visible: true,
          }];
          order += 1;
        }
      });
      setNotice(`Applied ${autoComps.length} auto-configured components`);
    } catch (e) {
      setError(e.message || "Auto-config failed");
    } finally {
      setBusy(false);
    }
  };

  const createComponent = () => {
    if (!blueprint || !ncLabel.trim()) return;
    mutateBlueprint((next) => {
      const base = ncLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      let id = base || uid();
      if (next.components.some((c) => c.id === id)) id = `${id}_${uid().slice(0, 4)}`;
      const order = next.components.length;
      const logic = { type: ncType, calculationPriority: Math.max(1, Number(ncPriority) || 20) };
      if (ncType === "fixed") logic.value = Number(ncValue) || 0;
      else if (ncType === "percentage") { logic.sourceField = ncSource || "ctc"; logic.pct = Number(ncPct) || 0; }
      else logic.formula = ncFormula || "0";
      next.components = [...next.components, {
        id,
        label: ncLabel.trim(),
        kind: ncKind,
        logic,
        ui: { x: 20, y: 10 + order * 30, w: 60, h: 24 },
        nestId: ncNest || null,
        displayOrder: order,
        visible: true,
      }];
    });
    setShowNewComp(false);
    setNcLabel("");
    setNcKind("earning");
    setNcType("fixed");
    setNcValue("0");
    setNcPriority("20");
    setNcNest("");
    toast("Component added");
  };

  const engSummary = useMemo(() => {
    if (!calcResult) return [];
    return Object.entries(calcResult.results).map(([id, r]) => ({
      id,
      raw: r.computed,
      final: r.final,
      min: r.min,
      max: r.max,
      excess: r.excess,
      action: r.action,
      order: calcResult.order.indexOf(id) + 1,
    }));
  }, [calcResult]);

  if (loadingTemplates) return <Spinner />;

  return (
    <>
      <div className="pd-shell">
        <PageHeader title="Nesting Manager" subtitle="Organize components into nesting groups — everything is JSON-driven and configurable" />

        {error && <div className="pd-error">{error}</div>}
        {notice && <div style={{ fontSize: "12.5px", color: "#16a34a", fontWeight: 600 }}>{notice}</div>}

        {validation && (
          <div style={{
            background: validation.ok ? "var(--green-light, #f0fdf4)" : "var(--red-light)",
            border: `1px solid ${validation.ok ? "#bbf7d0" : "var(--red)"}`,
            borderRadius: "var(--radius)",
            padding: "10px 14px",
            fontSize: "12.5px",
            color: validation.ok ? "#16a34a" : "var(--red)",
            fontWeight: 600,
          }}>
            {validation.ok ? "Blueprint is valid." : (
              <>
                <div style={{ marginBottom: 4 }}>Validation errors:</div>
                {[...validation.layout, ...validation.calculation, ...validation.tax, ...validation.countryState, ...validation.nesting].map((m, i) => (
                  <div key={i}>• {m}</div>
                ))}
              </>
            )}
          </div>
        )}

        <div className="pd-tabs">
          {[
            { id: "nest", label: "Nesting", icon: FolderTree },
            { id: "calcflow", label: "Calc Flow", icon: Calculator },
            { id: "tax", label: "Tax", icon: SlidersHorizontal },
            { id: "history", label: "Versions", icon: Layers },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`pd-tab ${activeView === t.id ? "active" : ""}`} onClick={() => setActiveView(t.id)}>
                <Icon size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />{t.label}
              </button>
            );
          })}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={{ height: 32, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, background: "var(--card)", outline: "none", cursor: "pointer" }}
            >
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.latestVersion}){t.isActive && t.status === "Published" ? " — Active" : ""}</option>)}
            </select>
            <button className="pd-btn" onClick={() => setActiveView("nest")}>
              <FolderTree size={15} /> Nesting Manager
            </button>
            <button className="pd-btn" onClick={() => setShowNewTemplate(true)} disabled={busy}>
              <Plus size={15} /> New Template
            </button>
          </div>
        </div>

        {busy && <Spinner />}

        {/* NESTING VIEW */}
        {activeView === "nest" && blueprint && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Nesting Manager</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>
              Organize components into parent/child nests. Drag a component row onto a nest to reassign; each nest can be renamed, reordered, hidden or expanded.
            </div>
            {blueprint.nests.map((nest) => (
              <NestCard
                key={nest.id}
                nest={nest}
                comps={blueprint.components.filter((c) => c.nestId === nest.id)}
                catalog={catalog}
                allComponents={blueprint.components}
                onChangeNest={(nid) => mutateBlueprint((next) => {
                  const i = next.nests.findIndex((n) => n.id === nest.id);
                  if (i >= 0) next.nests[i] = { ...next.nests[i], ...nid };
                })}
                onRemoveNest={(nid2) => mutateBlueprint((next) => {
                  next.nests = next.nests.filter((n) => n.id !== nid2);
                  next.components = next.components.map((c) => (c.nestId === nid2 ? { ...c, nestId: null } : c));
                })}
                onDropComp={(cid, nid) => mutateBlueprint((next) => {
                  const i = next.components.findIndex((c) => c.id === cid);
                  if (i >= 0) next.components[i] = { ...next.components[i], nestId: nid };
                })}
                onAddToNest={(cat, nid) => mutateBlueprint((next) => {
                  const exists = next.components.some((c) => c.id === cat.id || c.id.toLowerCase() === cat.id.toLowerCase());
                  if (exists) return;
                  const order = next.components.length;
                  next.components = [...next.components, {
                    id: cat.id,
                    label: cat.label,
                    kind: cat.kind,
                    logic: JSON.parse(JSON.stringify(cat.logic)),
                    ui: { x: 20, y: 10 + order * 30, w: 60, h: 24 },
                    nestId: nid,
                    displayOrder: order,
                    visible: true,
                  }];
                  setActiveView("nest");
                })}
                onUnassignComp={(cid) => mutateBlueprint((next) => {
                  const i = next.components.findIndex((c) => c.id === cid);
                  if (i >= 0) next.components[i] = { ...next.components[i], nestId: null };
                })}
                onDeleteComp={(cid) => {
                  mutateBlueprint((next) => {
                    next.components = next.components.filter((c) => c.id !== cid);
                  });
                  if (selectedId === cid) setSelectedId(null);
                }}
                onUpdateComp={(cid, logicPatch) => mutateBlueprint((next) => {
                  const i = next.components.findIndex((c) => c.id === cid);
                  if (i >= 0) next.components[i] = {
                    ...next.components[i],
                    logic: { ...(next.components[i].logic || {}), ...logicPatch },
                  };
                })}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="pd-btn" onClick={() => setShowNewComp((s) => !s)}><Plus size={15} /> New Component</button>
                <button className="pd-btn" onClick={() => {
                  const n = prompt("Nest name");
                  if (n) { mutateBlueprint((next) => { next.nests = [...next.nests, { id: uid(), name: n, displayOrder: (next.nests.length + 1) * 10 }]; }); toast("Nest created"); }
                }}><Plus size={15} /> New Nest</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--label)" }}>
                  Skill Type
                  <select
                    value={blueprint.settings?.skillType || ""}
                    onChange={(e) => mutateBlueprint((next) => { next.settings = { ...(next.settings || {}), skillType: e.target.value }; })}
                    style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, background: "var(--card)", outline: "none", cursor: "pointer" }}
                  >
                    <option value="">Select Skill Type</option>
                    {skillTypes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <button className="pd-btn primary" onClick={handleSaveAndPublish} disabled={busy || !canWrite}>
                  {busy ? "Saving…" : (<><Save size={15} /> Save & Publish</>)}
                </button>
              </div>
            </div>

            {matchedSkillType && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: "var(--radius)", background: "var(--primary-light)", border: "1px solid var(--primary)", fontSize: 12.5 }}>
                <span style={{ fontWeight: 700, color: "var(--primary)" }}>{matchedEmployees.length}</span>
                <span style={{ color: "var(--text)" }}> active employee{matchedEmployees.length === 1 ? "" : "s"} match the skill type "{matchedSkillType}" — their payslips will be generated with this nesting template.</span>
                {matchedEmployees.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {matchedEmployees.map((e) => (
                      <span key={e.id} style={{ padding: "3px 10px", background: "#fff", border: "1px solid var(--border)", borderRadius: 99, fontSize: 11.5, color: "var(--label)" }}>{e.firstName} {e.lastName} ({e.id})</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {showNewComp && (
              <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Create a new component</div>
                <input value={ncLabel} onChange={(e) => setNcLabel(e.target.value)} placeholder="Component label (e.g. Shift Allowance)" style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13 }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12.5 }}>Type
                    <select value={ncKind} onChange={(e) => setNcKind(e.target.value)} style={{ display: "block", height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }}>
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                      <option value="employer">Employer Contribution</option>
                      <option value="reimbursement">Reimbursement</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12.5 }}>Logic
                    <select value={ncType} onChange={(e) => setNcType(e.target.value)} style={{ display: "block", height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }}>
                      <option value="fixed">Fixed ₹</option>
                      <option value="percentage">% of field</option>
                      <option value="formula">Formula</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12.5 }}>Nest
                      <select value={ncNest} onChange={(e) => setNcNest(e.target.value)} style={{ display: "block", height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }}>
                        <option value="">— unassigned —</option>
                        {blueprint.nests.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                      </select>
                    </label>
                  <label style={{ fontSize: 12.5 }}>Priority
                    <input value={ncPriority} onChange={(e) => setNcPriority(e.target.value)} type="number" style={{ display: "block", width: 70, height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }} />
                  </label>
                </div>
                {ncType === "fixed" && (
                  <label style={{ fontSize: 12.5 }}>Value (₹)
                    <input value={ncValue} onChange={(e) => setNcValue(e.target.value)} type="number" style={{ display: "block", width: 140, height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }} />
                  </label>
                )}
                {ncType === "percentage" && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <label style={{ fontSize: 12.5 }}>% of
                      <input value={ncPct} onChange={(e) => setNcPct(e.target.value)} type="number" style={{ display: "block", width: 80, height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }} />
                    </label>
                    <label style={{ fontSize: 12.5 }}>Source field
                      <input value={ncSource} onChange={(e) => setNcSource(e.target.value)} style={{ display: "block", width: 140, height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }} />
                    </label>
                  </div>
                )}
                {ncType === "formula" && (
                  <label style={{ fontSize: 12.5 }}>Formula
                    <input value={ncFormula} onChange={(e) => setNcFormula(e.target.value)} placeholder="e.g. basic * 0.02" style={{ display: "block", width: 220, height: 32, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, padding: "0 6px" }} />
                  </label>
                )}
                <div>
                  <button className="pd-btn primary" onClick={createComponent} disabled={!ncLabel.trim()}><Plus size={15} /> Add Component</button>
                  <button className="pd-btn" onClick={() => setShowNewComp(false)} style={{ marginLeft: 8 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CALC FLOW */}
        {activeView === "calcflow" && blueprint && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Calculation Order</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>
              Payroll is computed in dependency order (not canvas order). Drag rows to change priority; dependencies are validated automatically.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--label)" }}>
                Nesting Template
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  style={{ height: 32, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, background: "var(--card)", outline: "none", cursor: "pointer" }}
                >
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.latestVersion}){t.isActive && t.status === "Published" ? " — Active" : ""}</option>)}
                </select>
              </label>
              <button className="pd-btn" onClick={runCalculate} style={{ display: "flex", alignItems: "center", gap: 6 }}><Calculator size={15} /> Recalculate</button>
              <EmployeeSearchBox
                employees={employees}
                value={empQuery}
                onChange={setEmpQuery}
                onSelect={(emp) => { setCalcEmp(emp); setEmpQuery(""); }}
              />
            </div>
            {calcResult && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Gross</strong> {inr(calcResult.gross)}</div>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Net</strong> {inr(calcResult.net)}</div>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Deductions</strong> −{inr(calcResult.deductionsTotal)}</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(() => {
                const sortedComps = [...blueprint.components].sort((a, b) => (a.logic.calculationPriority ?? 999) - (b.logic.calculationPriority ?? 999));
                const rankBy = new Map(sortedComps.map((c, i) => [c.id, i + 1]));
                return sortedComps.map((c) => {
                  const r = calcResult?.results?.[c.id];
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{rankBy.get(c.id)}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label} <span style={{ color: "var(--subtext)", fontWeight: 500 }}>({c.id})</span></div>
                        <div style={{ fontSize: 11.5, color: "var(--subtext)" }}>
                          {c.logic.type === "percentage" ? `${c.logic.pct || 0}% of ${c.logic.sourceField === "ctc" ? "CTC" : c.logic.sourceField}` : c.logic.type === "formula" ? `formula: ${c.logic.formula}` : `fixed: ${c.logic.value}`}
                          {c.logic.max ? ` · max ${c.logic.max.pct !== undefined ? `${c.logic.max.pct}% of ${c.logic.max.pctOf || "?"}` : (c.logic.max.value ?? c.logic.max.formula ?? "")} → ${c.logic.max.action || "none"}${c.logic.max.transferTo ? ` → ${c.logic.max.transferTo}` : ""}` : ""}
                          {c.logic.isBalancing ? " · balancing" : ""}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={c.logic.calculationPriority ?? 99}
                        onChange={(e) => mutateBlueprint((next) => {
                          const i2 = next.components.findIndex((x) => x.id === c.id);
                          next.components[i2].logic = { ...next.components[i2].logic, calculationPriority: Number(e.target.value) };
                        })}
                        style={{ width: 60, height: 30, textAlign: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5 }}
                      />
                      {r && <span style={{ fontFamily: "monospace", fontSize: 12 }}>{inr(r.final)}{r.excess ? ` (excess ${inr(r.excess)})` : ""}</span>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* TAX */}
        {activeView === "tax" && blueprint && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Tax Preview</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>
              Old vs New regime comparison, computed from the configured components. Tax rules are versioned config on the backend — not baked into the UI.
            </div>
            <button className="pd-btn" onClick={runTaxCompare} style={{ marginBottom: 12 }}><Calculator size={15} /> Recompute</button>
            {taxCompare && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 14 }}>
                <TaxCard title="Old Regime" breakdown={taxCompare.old} accent="#0f766e" />
                <TaxCard title="New Regime" breakdown={taxCompare.newTax} accent="#0891b2" />
              </div>
            )}
            {calcResult && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Component summary</div>
                <table className="pd-table">
                  <thead><tr><th>Component</th><th>Amount</th><th>Excess</th><th>Action</th></tr></thead>
                  <tbody>
                    {engSummary.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{inr(r.final)}</td>
                        <td>{r.excess ? inr(r.excess) : "—"}</td>
                        <td>{r.action || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* VERSIONS */}
        {activeView === "history" && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Version History</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {versions.length === 0 && <div className="pd-hint">No versions yet — save a draft first.</div>}
              {versions.map((v) => (
                <div key={v.id} className="pd-version">
                  <div style={{ fontWeight: 800, color: "var(--primary)" }}>v{v.version}</div>
                  <div style={{ flex: 1 }}>{v.changeSummary || "—"}</div>
                  <div style={{ color: "var(--subtext)", fontSize: 12 }}>{v.createdBy || "—"} · {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : ""}</div>
                  {v.status === "Published" && <span style={{ background: "var(--green-light,#f0fdf4)", color: "#16a34a", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Active</span>}
                  {v.status === "Archived" && <span style={{ background: "var(--background)", color: "var(--subtext)", padding: "2px 10px", borderRadius: 99, fontSize: 11 }}>Archived</span>}
                  <button className="pd-btn small" onClick={() => restorePayslipVersion(templateId, v.version).then(() => load(templateId))}>Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {calcEmp && <EmployeeSalaryModal employee={calcEmp} onClose={() => setCalcEmp(null)} />}

      {showNewTemplate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 22, width: "100%", maxWidth: 420 }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, margin: "0 0 4px" }}>Create Nesting Template</h3>
            <p style={{ fontSize: 12.5, color: "var(--subtext)", margin: "0 0 16px" }}>Pick the skill type — payslips are generated from this nesting template for employees whose skill type matches.</p>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--label)", marginBottom: 12 }}>
              Template name
              <input value={ntName} onChange={(e) => setNtName(e.target.value)} placeholder="e.g. Skilled Pay Structure" style={{ ...pdInputStyle, marginTop: 6 }} />
            </label>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--label)", marginBottom: 18 }}>
              Skill Type
              <select value={ntSkillType} onChange={(e) => setNtSkillType(e.target.value)} style={{ ...pdInputStyle, marginTop: 6, cursor: "pointer" }}>
                <option value="">Select Skill Type</option>
                {skillTypes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="pd-btn" onClick={() => { setShowNewTemplate(false); setNtName(""); setNtSkillType(""); }}>Cancel</button>
              <button className="pd-btn primary" onClick={handleNewTemplate} disabled={busy || !ntName.trim() || !ntSkillType}>
                {busy ? "Creating…" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function PayslipDesigner() {
  return <MainLayout><PayslipDesignerPanel /></MainLayout>;
}

/* ── Sub-components ──────────────────────────────────────────── */

/** Employee search bar with dropdown — same interaction as the
 *  Employee Payroll picker; selecting an employee opens their salary popup. */
function EmployeeSearchBox({ employees, value, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = value.trim().toLowerCase();
  const matches = (employees || []).filter((emp) =>
    !q || (emp.id || "").toLowerCase().includes(q) || `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q)
  ).slice(0, 50);

  return (
    <div ref={boxRef} style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
      <Search size={15} style={{ color: "var(--subtext)", position: "absolute", left: 12, top: 9, pointerEvents: "none" }} />
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search employee by name or ID…"
        style={{ width: "100%", height: 32, padding: "0 30px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, color: "var(--text)", background: "var(--card)", outline: "none" }}
      />
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Toggle employee list"
        style={{ position: "absolute", right: 4, top: 2, width: 28, height: 28, background: "none", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--subtext)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 38, left: 0, right: 0, zIndex: 30, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", maxHeight: 300, overflowY: "auto" }}>
          {matches.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 12.5, color: "var(--subtext)" }}>No employee found.</div>
          ) : (
            matches.map((emp) => (
              <button key={emp.id} type="button" onClick={() => { onSelect(emp); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: "var(--text)" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>
                  {(emp.firstName?.[0] || "?")}{(emp.lastName?.[0] || "")}
                </span>
                <span style={{ fontWeight: 600, flex: 1 }}>{emp.firstName} {emp.lastName}</span>
                <span style={{ color: "var(--subtext)", fontFamily: "monospace", fontSize: 11.5 }}>{emp.id}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Salary popup shown when an employee is selected in the Calculation Order
 *  card — gross, annual package, leave deduction, total deductions, net
 *  payroll plus earnings/deductions breakdown, same as Employee Payroll. */
function EmployeeSalaryModal({ employee, onClose }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setSummary(null);
    getEmployeePayrollSummary(employee.id, month, year)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err.message || "Could not load payroll summary"))
      .finally(() => setLoading(false));
  }, [employee.id, month, year]);

  const statusColor = { Draft: "#64748b", Processing: "#d97706", Approved: "#0284c7", Paid: "#16a34a", Failed: "#dc2626" };
  const statusBg = { Draft: "#f8fafc", Processing: "#fffbeb", Approved: "#f0f9ff", Paid: "#f0fdf4", Failed: "#fef2f2" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 22, width: "100%", maxWidth: 720, maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>
            {employee.firstName} {employee.lastName} <span style={{ color: "var(--subtext)", fontWeight: 500, fontSize: 13 }}>({employee.id})</span>
          </h3>
          <button onClick={onClose} className="pd-btn small">Close</button>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <p style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>{error}</p>
        ) : !summary ? (
          <p style={{ fontSize: 13, color: "var(--subtext)" }}>No summary found for this employee & period.</p>
        ) : (
          (() => {
            const { earnings, deductions } = summary;
            const earningGroups = summary.earningGroups?.length ? summary.earningGroups : [{ id: null, name: "Earnings", kind: "earning", rows: [] }];
            const deductionGroups = summary.deductionGroups?.length ? summary.deductionGroups : [{ id: null, name: "Deductions", kind: "deduction", rows: [] }];
            const flatRows = (obj) => Object.entries(obj || {})
              .filter(([k, v]) => k !== "total" && k !== "leaveDeduction" && Number(v) > 0)
              .map(([label, amount]) => ({ label: label.replace(/([A-Z])/g, " $1").trim(), amount: Number(amount) }));
            const fallbackEarnings = flatRows(earnings);
            const fallbackDeductions = flatRows(deductions);
            const earnedTotal = earningGroups.some((g) => g.rows.length)
              ? earningGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.amount, 0), 0)
              : fallbackEarnings.reduce((s, r) => s + r.amount, 0);
            const stat = (label, value, color = "var(--text)") => (
              <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "12px 14px", flex: "1 1 130px" }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>{label}</p>
                <p style={{ fontSize: 17, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1.2 }}>{value}</p>
              </div>
            );
            const detail = (label, entries, color, isDeduction, total, totalLabel, fallback) => {
              return (
                <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>{label}</p>
                  {entryGroups(label, entries, color, isDeduction, fallback)}
                  {isDeduction && summary.leaveDeduction > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ fontSize: 12.5, color: "var(--label)" }}>Leave Deduction (unpaid days)</span>
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--red)", fontFamily: "monospace" }}>−{inr(summary.leaveDeduction)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{totalLabel}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{inr(total)}</span>
                  </div>
                </div>
              );
            };
            const entryGroups = (label, entries, color, isDeduction, fallback) => {
              const groups = label === "Earnings" ? earningGroups : deductionGroups;
              return groups.map((g, gi) => {
                const rows = g.rows.length ? g.rows : fallback;
                return (
                  <div key={g.id || g.name} style={gi > 0 ? { marginTop: 10 } : undefined}>
                    {groups.length > 1 && <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", opacity: 0.85, marginBottom: 6 }}>{g.name}</p>}
                    {rows.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--subtext)" }}>No {label.toLowerCase()} in this period.</p>
                    ) : (
                      rows.map((row) => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12.5, color: "var(--label)" }}>{row.label}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 500, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{inr(row.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              });
            };
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 12.5, color: "var(--subtext)" }}>Payroll · {MONTHS_FULL_PD[month - 1]} {year}</span>
                  {summary.status && (
                    <span style={{ padding: "3px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, color: statusColor[summary.status] || "#64748b", background: statusBg[summary.status] || "#f8fafc" }}>{summary.status}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  {stat("Gross", inr(summary.gross))}
                  {stat("Annual Package", summary.annualSalary ? inr(summary.annualSalary) : "—", "var(--primary)")}
                  {stat("Leave Deduction", summary.leaveDeduction > 0 ? `−${inr(summary.leaveDeduction)}` : "—", summary.leaveDeduction > 0 ? "var(--amber)" : "var(--subtext)")}
                  {stat("Total Deductions", `−${inr((deductions || {}).total)}`, "var(--red)")}
                  {stat("Net Payroll", inr(summary.netPay), "var(--green)")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {detail("Earnings", earnings, "var(--green)", false, earnedTotal, "Total Earnings", fallbackEarnings)}
                  {detail("Deductions", deductions, "var(--red)", true, (deductions || {}).total, "Total Deductions", fallbackDeductions)}
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

const MONTHS_FULL_PD = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function NestCard({ nest, comps, catalog, allComponents, onChangeNest, onRemoveNest, onDropComp, onAddToNest, onUnassignComp, onDeleteComp, onUpdateComp }) {
  const [open, setOpen] = useState(nest.expandByDefault !== false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(nest.name);
  const [adding, setAdding] = useState("");
  const [threshOpen, setThreshOpen] = useState(null); // component id expanded
  const inNest = new Set(comps.map((c) => c.id.toLowerCase()));
  const alreadyAdded = new Set((allComponents || []).map((c) => c.id.toLowerCase()));
  const available = (catalog || []).filter((cat) => !alreadyAdded.has(cat.id.toLowerCase()) && !inNest.has(cat.id.toLowerCase()));
  return (
    <div
      className="pd-nest"
      style={{ marginLeft: nest.parentId ? 22 : 0 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
        if (data.source === "existing") onDropComp(data.id, nest.id);
      }}
    >
      <div className="pd-nest-header">
        <button className="pd-btn small" onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { onChangeNest({ name }); setEditing(false); }} autoFocus style={{ border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", fontSize: 12.5 }} />
        ) : (
          <span onDoubleClick={() => setEditing(true)}>{nest.name}</span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="pd-btn small" onClick={() => setEditing(true)}>Rename</button>
          <button className="pd-btn small danger" onClick={() => onRemoveNest(nest.id)}><Trash2 size={12} /></button>
        </span>
      </div>
      {open && (
        <div className="pd-nest-body">
          <div style={{ fontSize: 11, color: "var(--subtext)", marginBottom: 4 }}>
            {nest.autoAssign ? "Auto-assigned group" : "Manual group"} · {comps.length} component{comps.length === 1 ? "" : "s"} · display order {nest.displayOrder ?? 0}
          </div>
          {comps.map((c) => {
            const isThresh = threshOpen === c.id;
            return (
              <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 6, overflow: "hidden" }}>
                <div
                  className="pd-nest-comp"
                  style={{ marginTop: 0, border: "none", borderRadius: isThresh ? "4px 4px 0 0" : "var(--radius-sm)", background: isThresh ? "var(--primary-light)" : undefined }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "existing", id: c.id }))}
                >
                  <span>{c.label} <span style={{ color: "var(--subtext)" }}>({c.id})</span></span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {c.autoAssigned && <span style={{ fontSize: 10, color: "var(--primary)" }}>auto</span>}
                    {c.override?.manual && <span style={{ fontSize: 10, color: "var(--amber)" }}>override</span>}
                    {c.logic.max?.value !== undefined || c.logic.max?.pct !== undefined ? (
                      <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700 }}>max {c.logic.max.pct != null ? `${c.logic.max.pct}%` : `₹${c.logic.max.value}`}</span>
                    ) : null}
                    <button className="pd-btn small" onClick={() => setThreshOpen(isThresh ? null : c.id)}>
                      {isThresh ? "Close" : "Threshold"}
                    </button>
                    <button className="pd-btn small" title="Remove from this nest" onClick={() => onUnassignComp(c.id)}>Move out</button>
                    <button className="pd-btn small danger" title="Delete component" onClick={() => onDeleteComp(c.id)}><Trash2 size={12} /></button>
                  </span>
                </div>
                {isThresh && (
                  <NestThresholdEditor comp={c} onUpdateComp={onUpdateComp} />
                )}
              </div>
            );
          })}
          {!comps.length && <div className="pd-hint">No components yet — add one below or drag it here.</div>}

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              style={{ flex: 1, height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text)", background: "var(--card)" }}
            >
              <option value="">+ Add component…</option>
              {available.length === 0 && <option value="" disabled>Catalog empty</option>}
              {available.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label} ({cat.kind})</option>
              ))}
            </select>
            <button
              className="pd-btn small"
              disabled={!adding}
              onClick={() => { const cat = (catalog || []).find((c) => c.id === adding); if (cat) onAddToNest(cat, nest.id); setAdding(""); }}
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--subtext)", marginTop: 6 }}>
            "Threshold" edits the max rule per component — applied to every payslip created from this template.
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline threshold editor inside the Nesting Manager. */
function NestThresholdEditor({ comp, onUpdateComp }) {
  const t = comp.logic.max || {};
  const mode = t.pct !== undefined ? "percent" : t.formula ? "formula" : "amount";
  const set = (patch) => onUpdateComp(comp.id, { max: { ...t, ...patch, action: patch.action || t.action || "cap" } });
  return (
    <div style={{ padding: "8px 10px", background: "var(--card)", borderTop: "1px solid var(--border)" }}>
      <div className="pd-row" style={{ marginBottom: 6 }}>
        <div className="pd-field">
          <label>Type</label>
          <select value={mode} onChange={(e) => {
            const m = e.target.value;
            if (m === "percent") set({ pct: t.pct ?? 10, pctOf: t.pctOf || "ctc", value: undefined, formula: undefined });
            else if (m === "formula") set({ formula: t.formula || "basic * 0.5", pct: undefined, pctOf: undefined, value: undefined });
            else set({ value: t.value ?? 0, pct: undefined, pctOf: undefined, formula: undefined });
          }}
            style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
            <option value="amount">Amount (₹)</option>
            <option value="percent">Percent (% of field)</option>
            <option value="formula">Formula</option>
          </select>
        </div>
        <div className="pd-field">
          <label>Action</label>
          <select value={t.action || ""} onChange={(e) => set({ action: e.target.value })}
            style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
            <option value="">None</option>
            <option value="cap">Cap</option>
            <option value="transfer">Transfer excess</option>
            <option value="error">Error</option>
            <option value="set_zero">Set to zero</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
      </div>
      {mode === "amount" && (
        <div className="pd-field">
          <label>Max amount (₹)</label>
          <input type="number" value={t.value ?? ""} onChange={(e) => set({ value: e.target.value === "" ? undefined : Number(e.target.value) })}
            style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
        </div>
      )}
      {mode === "percent" && (
        <div className="pd-row">
          <div className="pd-field">
            <label>Percent %</label>
            <input type="number" value={t.pct ?? ""} onChange={(e) => set({ pct: Number(e.target.value) })}
              style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
          </div>
          <div className="pd-field">
            <label>Percent of</label>
            <input value={t.pctOf || ""} onChange={(e) => set({ pctOf: e.target.value })} placeholder="ctc"
              style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
          </div>
        </div>
      )}
      {mode === "formula" && (
        <div className="pd-field">
          <label>Formula (e.g. basic*0.5)</label>
          <input value={t.formula || ""} onChange={(e) => set({ formula: e.target.value })}
            style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
        </div>
      )}
      {t.action === "transfer" && (
        <div className="pd-field">
          <label>Transfer excess to</label>
          <input value={t.transferTo || ""} onChange={(e) => set({ transferTo: e.target.value })} placeholder="special_allowance"
            style={{ width: "100%", height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
        </div>
      )}
    </div>
  );
}

function TaxCard({ title, breakdown, accent }) {
  const rows = [
    ["Gross Income", inr(breakdown.grossIncome)],
    ["Exemptions", inr(breakdown.exemptions)],
    ["Deductions", inr(breakdown.deductions)],
    ["Taxable Income", inr(breakdown.taxableIncome)],
    ["Tax Before Rebate", inr(breakdown.taxBeforeRebate)],
    ["Rebate", inr(breakdown.rebate)],
    ["Cess", inr(breakdown.cess)],
    ["Surcharge", inr(breakdown.surcharge)],
    ["Annual Tax", inr(breakdown.annualTax)],
    ["Monthly Tax", inr(breakdown.monthlyTax)],
  ];
  return (
    <div style={{ border: `1px solid ${accent}33`, borderRadius: "var(--radius)", padding: 14 }}>
      <div style={{ fontWeight: 800, color: accent, marginBottom: 8 }}>{title}</div>
      <table className="pd-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td style={{ color: "var(--label)", fontSize: 12 }}>{k}</td><td style={{ textAlign: "right", fontFamily: "monospace" }}>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}