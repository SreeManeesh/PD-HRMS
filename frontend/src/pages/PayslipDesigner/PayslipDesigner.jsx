/**
 * Smart Payslip Designer — three-area visual editor.
 *
 *  LEFT   : component library (drag onto canvas)
 *  CENTER : A4 canvas with grid, drag/resize/select/duplicate/delete
 *  RIGHT  : context-sensitive properties (UI + logic + threshold + tax)
 *
 * Plus: Field Picker (visual variable binding), Nesting Manager, Calculation
 * Flow, Theme, Tax Preview, Live HTML preview, and Publish/Version history.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Trash2, Copy, MousePointer2, Save, Rocket, Undo2, Layers,
  SlidersHorizontal, Palette, Calculator, FileText, FolderTree, CheckCircle2,
  ChevronDown, ChevronRight, LayoutGrid,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import ConfirmDialog from "../../components/shared/ConfirmDialog.jsx";
import {
  listPayslipTemplates, createPayslipTemplate, getPayslipTemplate, savePayslipDraft,
  listPayslipVersions, publishPayslipTemplate, restorePayslipVersion,
  getComponentCatalog, getAutoConfig,
  calculateBlueprint, compareTaxForBlueprint,
  validateBlueprint,
} from "../../services/payslipDesignerService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { getCompanyBranding } from "../../services/payslipBrandingService.js";
import { FIELD_TREE, inr } from "./format.js";
import "./PayslipDesigner.css";

const CANVAS_W = 780;
const CANVAS_H = 1020;

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  secondaryColor: "#0d1b2a",
  accentColor: "#0891b2",
  font: "Helvetica",
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
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
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState("design");

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
  const [companyBranding, setCompanyBranding] = useState(null);

  useEffect(() => {
    let active = true;
    getCompanyBranding()
      .then((b) => { if (active) setCompanyBranding(b); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const [calcResult, setCalcResult] = useState(null);
  const [taxCompare, setTaxCompare] = useState(null);
  const [validation, setValidation] = useState(null);
  const [versions, setVersions] = useState([]);
  const [showConfirmPublish, setShowConfirmPublish] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState([]);
  const [redoCursor, setRedoCursor] = useState(0);
  const [canvasScale, setCanvasScale] = useState(0.62);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);

  const dragRef = useRef(null);

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
        settings: { companyName: "Proteccio HRMS" },
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
        setTemplates(res.data || []);
        if (res.data?.length && !templateId) {
          setTemplateId(res.data[0].id);
        }
      })
      .catch((e) => setError(e.message || "Could not load templates"))
      .finally(() => setLoadingTemplates(false));
    getComponentCatalog().then((r) => setCatalog(r.data || [])).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!templateId) return;
    load(templateId);
  }, [templateId, load]);

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

  const packs = useMemo(() => {
    const byType = { earning: [], deduction: [], employer: [], reimbursement: [] };
    for (const c of catalog) {
      if (byType[c.kind]) byType[c.kind].push(c);
    }
    return byType;
  }, [catalog]);

  const scaleBox = (b) => ({
    x: b.x * canvasScale,
    y: b.y * canvasScale,
    w: b.w * canvasScale,
    h: b.h * canvasScale,
  });

  const onDropCanvas = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
    if (data.source === "library" || data.source === "catalog") {
      const rect = e.currentTarget.getBoundingClientRect();
      const b = blueprint?.components.length || 0;
      const newComp = {
        id: uid(),
        label: data.label || "Component",
        kind: data.kind || "earning",
        logic: data.logic ? JSON.parse(JSON.stringify(data.logic)) : { type: "fixed", value: 0, calculationPriority: 20 },
        ui: {
          x: Math.max(0, Math.round((e.clientX - rect.left) / canvasScale - 60)),
          y: Math.max(0, Math.round((e.clientY - rect.top) / canvasScale)),
          w: 60,
          h: 24,
        },
        nestId: data.defaultNestId || null,
        displayOrder: b,
        visible: true,
      };
      mutateBlueprint((next) => {
        next.components = [...next.components, newComp];
      });
      setSelectedId(newComp.id);
    }
  };

  const onDragOverCanvas = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeaveCanvas = () => setDragOver(false);

  const selectComp = (id) => {
    setSelectedId(id);
    setActiveView("design");
  };

  const removeComp = (id) => {
    const existed = blueprint?.components.some((c) => c.id === id);
    mutateBlueprint((next) => {
      next.components = next.components.filter((c) => c.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
    if (existed) toast("Component removed");
  };

  const duplicateComp = (id) => {
    mutateBlueprint((next) => {
      const src = next.components.find((c) => c.id === id);
      if (!src) return;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid();
      copy.ui.y += 30;
      next.components = [...next.components, copy];
    });
    toast("Component duplicated");
  };

  const selectedComp = blueprint?.components.find((c) => c.id === selectedId) || null;

  const updateSelected = (patch) => {
    mutateBlueprint((next) => {
      const i = next.components.findIndex((c) => c.id === selectedId);
      if (i >= 0) next.components[i] = { ...next.components[i], ...patch };
    });
  };

  const updateSelectedLogic = (patch) => {
    mutateBlueprint((next) => {
      const i = next.components.findIndex((c) => c.id === selectedId);
      if (i >= 0) next.components[i] = {
        ...next.components[i],
        logic: { ...(next.components[i].logic || {}), ...patch },
      };
    });
  };

  const moveActiveComp = (dx, dy) => {
    if (!selectedId) return;
    setBlueprint((prev) => {
      const next = cloneBlueprint(prev);
      const i = next.components.findIndex((c) => c.id === selectedId);
      if (i >= 0) {
        next.components[i].ui.x = Math.max(0, next.components[i].ui.x + dx);
        next.components[i].ui.y = Math.max(0, next.components[i].ui.y + dy);
      }
      return next;
    });
  };

  const onPointerMoveComp = (e, id) => {
    if (!dragRef.current || dragRef.current.id !== id || !dragRef.current.start) return;
    const cur = { x: e.clientX, y: e.clientY };
    const start = dragRef.current.start;
    const dx = (cur.x - start.x) / canvasScale;
    const dy = (cur.y - start.y) / canvasScale;
    setBlueprint((prev) => {
      const next = cloneBlueprint(prev);
      const i = next.components.findIndex((c) => c.id === id);
      if (i >= 0) {
        next.components[i].ui.x = Math.max(0, (next.components[i].ui.x || 0) + dx);
        next.components[i].ui.y = Math.max(0, (next.components[i].ui.y || 0) + dy);
      }
      return next;
    });
    dragRef.current.start = cur;
  };

  const onPointerDownComp = (e, id) => {
    e.stopPropagation();
    selectComp(id);
    dragRef.current = { id, start: { x: e.clientX, y: e.clientY } };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointerup", up);
  };

  const onCanvasClick = () => {
    if (!dragRef.current) setSelectedId(null);
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
    } else if (activeView === "preview") {
      runCalculate();
    }
  }, [activeView, runTaxCompare, runCalculate]);

  // Recalculate whenever the blueprint changes so the live preview/tax
  // stay in sync with design edits (colours, logo, components, order).
  useEffect(() => {
    if (!blueprint) return;
    if (activeView === "design" || activeView === "preview" || activeView === "calcflow" || activeView === "tax" || activeView === "nest") {
      const t = window.setTimeout(() => { runCalculate(); }, 250);
      return () => window.clearTimeout(t);
    }
  }, [blueprint, activeView, runCalculate]);

  const handleSave = async () => {
    if (!blueprint) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await savePayslipDraft(templateId, blueprint, "Draft saved from designer");
      setNotice(`Saved as v${res.data.version}`);
      toast("Draft saved");
      load(templateId);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setShowConfirmPublish(false);
    setBusy(true);
    try {
      const res = await publishPayslipTemplate(templateId);
      setNotice(`Published as active v${res.data.version}`);
      toast("Template published");
      load(templateId);
    } catch (e) {
      setError(e.message || "Publish failed");
    } finally {
      setBusy(false);
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

  const autoArrange = () => {
    if (!blueprint) return;
    mutateBlueprint((next) => {
      const W = 60, H = 24, STEP_X = 72, STEP_Y = 30, ROWS_PER_COL = 10, X0 = 20, Y0 = 10;
      const ordered = [...next.components].sort((a, b) =>
        (a.logic.calculationPriority ?? 999) - (b.logic.calculationPriority ?? 999)
      );
      const idx = new Map(ordered.map((c, i) => [c.id.toLowerCase(), i]));
      next.components = next.components.map((c) => {
        const i = idx.get(c.id.toLowerCase());
        if (i === undefined) return c;
        const col = Math.floor(i / ROWS_PER_COL);
        const row = i % ROWS_PER_COL;
        return { ...c, ui: { ...c.ui, x: X0 + col * STEP_X, y: Y0 + row * STEP_Y, w: W, h: H } };
      });
    });
    setNotice("Layout auto-arranged into a clean, non-overlapping grid");
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

  const liveHtml = useMemo(() => {
    if (!blueprint) return "";
    const t = blueprint.theme || DEFAULT_THEME;
    const grouped = (blueprint.nests || []).map((n) => ({
      nest: n,
      comps: blueprint.components.filter((c) => c.nestId === n.id && c.visible !== false),
    })).filter((g) => g.comps.length);
    const nestedComps = grouped.flatMap((g) => g.comps);
    const allVisible = blueprint.components.filter((c) => c.visible !== false);
    const val = (id) => {
      const r = calcResult?.results?.[id];
      return r ? inr(r.final) : "—";
    };
    const sec = (title, comps, color) => {
      if (!comps.length) return "";
      return `<div style="margin-top:14px">
        <div style="font-weight:800;color:${color};border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:6px">${title}</div>
        ${comps.map((c) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px"><span>${c.label}</span><span>${val(c.id)}</span></div>`).join("")}
      </div>`;
    };
    const earnings = allVisible.filter((c) => (c.kind === "earning" || c.kind === "reimbursement") && (!c.nestId || nestedComps.includes(c)));
    const deductions = allVisible.filter((c) => c.kind === "deduction" && (!c.nestId || nestedComps.includes(c)));
    return `<div class="pd-preview-sheet" style="font-family:${t.font};color:#0e1e2c;max-width:640px;margin:0 auto">
      <div style="background:${t.primaryColor};color:#fff;border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:12px">
        ${blueprint.theme.logo ? `<img src="${blueprint.theme.logo}" alt="logo" style="max-height:44px;max-width:90px;object-fit:contain;background:#fff;border-radius:4px;padding:2px" />` : ""}
        <div>
          <h2 style="margin:0;font-size:16px">${companyBranding?.companyName || blueprint.settings?.companyName || "Company"}</h2>
          <div style="opacity:.85;font-size:12px">Salary Payslip · FY ${blueprint.financialYear}</div>
        </div>
      </div>
      ${sec("Earnings", earnings, t.primaryColor)}
      ${sec("Deductions", deductions, "#dc2626")}
      <div style="display:flex;justify-content:space-between;border-top:2px solid ${t.primaryColor};margin-top:14px;padding-top:8px;font-weight:800;font-size:14px">
        <span>Net Pay</span><span>${calcResult ? inr(calcResult.net) : "—"}</span>
      </div>
    </div>`;
  }, [blueprint, calcResult, companyBranding?.companyName]);

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
        <PageHeader title="Payslip Designer" subtitle="Design payslips visually — everything is JSON-driven and configurable">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.latestVersion})</option>)}
          </select>
          <button
            className="pd-btn"
            onClick={async () => {
              const name = prompt("Template name", "New Payslip Template");
              if (name) {
                const r = await createPayslipTemplate({ name });
                setTemplateId(r.data.id);
                load(r.data.id);
              }
            }}
          >
            <Plus size={15} /> New
          </button>
        </PageHeader>

        {error && <div className="pd-error">{error}</div>}
        {notice && <div style={{ fontSize: "12.5px", color: "#16a34a", fontWeight: 600 }}>{notice}</div>}

        <div className="pd-toolbar">
          <button className="pd-btn" onClick={undo} disabled={redoCursor === 0}><Undo2 size={15} /> Undo</button>
          <button className="pd-btn" onClick={redo} disabled={redoCursor >= history.length - 1}>Redo</button>
          <button className="pd-btn" onClick={handleAutoConfig} disabled={busy}><Layers size={15} /> Auto-Configure</button>
          <button className="pd-btn" onClick={autoArrange} disabled={busy}><LayoutGrid size={15} /> Auto-arrange</button>
          <button className="pd-btn" onClick={runValidation}><CheckCircle2 size={15} /> Validate</button>
          <button className="pd-btn" onClick={handleSave} disabled={saving || !canWrite}>{saving ? "Saving…" : (<><Save size={15} /> Save Draft</>)}</button>
          <button className="pd-btn primary" onClick={() => setShowConfirmPublish(true)} disabled={!canWrite || busy}><Rocket size={15} /> Publish</button>
        </div>

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
            { id: "design", label: "Design", icon: MousePointer2 },
            { id: "nest", label: "Nesting", icon: FolderTree },
            { id: "calcflow", label: "Calc Flow", icon: Calculator },
            { id: "theme", label: "Theme", icon: Palette },
            { id: "tax", label: "Tax", icon: SlidersHorizontal },
            { id: "preview", label: "Preview", icon: FileText },
            { id: "history", label: "Versions", icon: Layers },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`pd-tab ${activeView === t.id ? "active" : ""}`} onClick={() => setActiveView(t.id)}>
                <Icon size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />{t.label}
              </button>
            );
          })}
        </div>

        {busy && <Spinner />}

        {/* DESIGN VIEW — 3 AREAS */}
        {activeView === "design" && blueprint && (
          <div className="pd-layout">
            <aside className="pd-panel">
              <div className="pd-panel-header">Component Library</div>
              <div className="pd-library">
                <div className="pd-library-group">
                  <div className="pd-library-group-title">Basic</div>
                  <div className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "library", type: "static_text", label: "Static Text", kind: "earning", logic: { type: "fixed", value: 0, calculationPriority: 10 } }))}>Static Text</div>
                  <div className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "library", type: "dynamic_field", label: "Dynamic Field", kind: "earning", logic: { type: "formula", formula: "0", calculationPriority: 10 } }))}>Dynamic Field</div>
                  <div className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "library", type: "divider", label: "Divider", kind: "earning", logic: { type: "fixed", value: 0, calculationPriority: 10 } }))}>Divider</div>
                  <div className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "library", type: "table", label: "Table", kind: "earning", logic: { type: "fixed", value: 0, calculationPriority: 10 } }))}>Table</div>
                </div>
                <div className="pd-library-group">
                  <div className="pd-library-group-title">Earnings</div>
                  {(packs.earning || []).map((c) => (
                    <div key={c.id} className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "catalog", ...c }))}>{c.label}</div>
                  ))}
                  {!packs.earning?.length && <div className="pd-hint">Click Auto-Configure to load these.</div>}
                </div>
                <div className="pd-library-group">
                  <div className="pd-library-group-title">Deductions</div>
                  {(packs.deduction || []).map((c) => (
                    <div key={c.id} className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "catalog", ...c }))}>{c.label}</div>
                  ))}
                </div>
                <div className="pd-library-group">
                  <div className="pd-library-group-title">Employer</div>
                  {(packs.employer || []).map((c) => (
                    <div key={c.id} className="pd-lib-item" draggable onDragStart={(e) => e.dataTransfer.setData("application/json", JSON.stringify({ source: "catalog", ...c }))}>{c.label}</div>
                  ))}
                </div>
              </div>
            </aside>

            <div
              className="pd-canvas-wrap"
              style={{ background: dragOver ? "var(--primary-light)" : "var(--background)" }}
              onDragOver={onDragOverCanvas}
              onDragLeave={onDragLeaveCanvas}
            >
              <div
                className="pd-page"
                style={{
                  width: CANVAS_W * canvasScale,
                  height: CANVAS_H * canvasScale,
                  background: dragOver ? "#f0fdfa" : "#fff",
                }}
                onDrop={onDropCanvas}
                onClick={onCanvasClick}
              >
                {!blueprint.components.length && (
                  <div className="pd-empty-canvas">
                    <MousePointer2 size={28} />
                    <span>Drag components from the left onto the canvas</span>
                  </div>
                )}
                {blueprint.components.filter((c) => c.visible !== false).map((c) => {
                  const s = scaleBox(c.ui);
                  const isSel = selectedId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`pd-comp ${isSel ? "selected" : ""}`}
                      style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
                      onPointerDown={(e) => onPointerDownComp(e, c.id)}
                      onPointerMove={(e) => onPointerMoveComp(e, c.id)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="pd-comp-header">
                        {c.label}
                        <span className="pd-comp-actions">
                          <button className="pd-btn small" onClick={() => duplicateComp(c.id)}><Copy size={11} /></button>
                          <button className="pd-btn small danger" onClick={() => removeComp(c.id)}><Trash2 size={11} /></button>
                        </span>
                      </div>
                      <div className="pd-comp-body">
                        {c.dataBinding?.source
                          ? c.dataBinding.source
                          : c.logic.type === "percentage"
                            ? `${c.logic.pct || 0}% of ${c.logic.sourceField === "ctc" ? "CTC" : c.logic.sourceField || "—"}`
                            : c.logic.formula || (c.logic.value ?? 0)}
                      </div>
                      {isSel && (
                        <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: 9, color: "var(--primary)", background: "var(--primary-light)", padding: "1px 4px", borderRadius: 2 }}>
                          {c.ui.x},{c.ui.y} · {c.logic.calculationPriority ?? 20}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, fontSize: 12, color: "var(--subtext)" }}>
                <button className="pd-btn small" onClick={() => setCanvasScale(0.45)}>Fit page</button>
                <button className="pd-btn small" onClick={() => setCanvasScale(0.75)}>Zoom</button>
                <span>A4 · Grid 20px · Snap to grid · Drag to move · Click to select</span>
              </div>
            </div>

            <aside className="pd-panel">
              <div className="pd-panel-header">Properties</div>
              <div className="pd-props">
                {!selectedComp ? (
                  <div className="pd-hint">Select a component on the canvas to edit its properties.</div>
                ) : (
                  <PropertyEditor
                    comp={selectedComp}
                    nests={blueprint.nests}
                    onChange={updateSelected}
                    onLogic={updateSelectedLogic}
                    onRemove={() => removeComp(selectedComp.id)}
                    onDuplicate={() => duplicateComp(selectedComp.id)}
                    onMove={moveActiveComp}
                  />
                )}
              </div>
            </aside>
          </div>
        )}

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
            <button className="pd-btn" onClick={() => setShowNewComp((s) => !s)}><Plus size={15} /> New Component</button>
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
            <button className="pd-btn" onClick={() => {
              const n = prompt("Nest name");
              if (n) { mutateBlueprint((next) => { next.nests = [...next.nests, { id: uid(), name: n, displayOrder: (next.nests.length + 1) * 10 }]; }); toast("Nest created"); }
            }}><Plus size={15} /> New Nest</button>
          </div>
        )}

        {/* CALC FLOW */}
        {activeView === "calcflow" && blueprint && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Calculation Order</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>
              Payroll is computed in dependency order (not canvas order). Drag rows to change priority; dependencies are validated automatically.
            </div>
            <button className="pd-btn" onClick={runCalculate} style={{ marginBottom: 12 }}><Calculator size={15} /> Recalculate</button>
            {calcResult && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Gross</strong> {inr(calcResult.gross)}</div>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Net</strong> {inr(calcResult.net)}</div>
                <div style={{ background: "var(--background)", padding: "10px 14px", borderRadius: "var(--radius)" }}><strong>Deductions</strong> −{inr(calcResult.deductionsTotal)}</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...blueprint.components].sort((a, b) => (a.logic.calculationPriority ?? 999) - (b.logic.calculationPriority ?? 999)).map((c, i) => {
                const r = calcResult?.results?.[c.id];
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{i + 1}</span>
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
              })}
            </div>
          </div>
        )}

        {/* THEME */}
        {activeView === "theme" && blueprint && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Theme</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>Global colors, fonts, logo, page size and margins apply automatically to every component bound to theme variables.</div>
            <div className="pd-field" style={{ maxWidth: 420 }}>
              <label>Company logo (upload from your computer)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {(blueprint.theme.logo || logoPreviewUrl) && (
                  <div style={{ width: 90, height: 60, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                    <img src={logoPreviewUrl || blueprint.theme.logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                )}
                <label className="pd-btn" style={{ cursor: "pointer" }}>
                  <Plus size={14} /> {blueprint.theme.logo || logoPreviewUrl ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      setLogoPreviewUrl(url);
                      const reader = new FileReader();
                      reader.onload = () => {
                        mutateBlueprint((next) => { next.theme.logo = reader.result; });
                        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {(blueprint.theme.logo || logoPreviewUrl) && (
                  <button className="pd-btn danger" onClick={() => { setLogoPreviewUrl(null); mutateBlueprint((next) => { delete next.theme.logo; }); }}>Remove</button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <ThemeField label="Primary color" value={blueprint.theme.primaryColor} onChange={(v) => mutateBlueprint((next) => { next.theme.primaryColor = v; })} type="color" />
              <ThemeField label="Secondary color" value={blueprint.theme.secondaryColor} onChange={(v) => mutateBlueprint((next) => { next.theme.secondaryColor = v; })} type="color" />
              <ThemeField label="Accent color" value={blueprint.theme.accentColor} onChange={(v) => mutateBlueprint((next) => { next.theme.accentColor = v; })} type="color" />
              <ThemeField label="Font" value={blueprint.theme.font} onChange={(v) => mutateBlueprint((next) => { next.theme.font = v; })} />
              <ThemeField label="Page size" value={blueprint.theme.pageSize} onChange={(v) => mutateBlueprint((next) => { next.theme.pageSize = v; })} />
              <ThemeField label="Orientation" value={blueprint.theme.orientation} onChange={(v) => mutateBlueprint((next) => { next.theme.orientation = v; })} />
              <ThemeField label="Left margin" value={blueprint.theme.margins.left} onChange={(v) => mutateBlueprint((next) => { next.theme.margins.left = Number(v); })} type="number" />
              <ThemeField label="Top margin" value={blueprint.theme.margins.top} onChange={(v) => mutateBlueprint((next) => { next.theme.margins.top = Number(v); })} type="number" />
            </div>
            <h4 style={{ marginTop: 20 }}>Company</h4>
            <ThemeField label="Company name" value={blueprint.settings?.companyName} onChange={(v) => mutateBlueprint((next) => { next.settings = { ...next.settings, companyName: v }; })} />
            <ThemeField label="Employee count (eligibility)" value={blueprint.settings?.companyEmployeeCount ?? 50} onChange={(v) => mutateBlueprint((next) => { next.settings = { ...next.settings, companyEmployeeCount: Number(v) }; })} type="number" />
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

        {/* PREVIEW */}
        {activeView === "preview" && (
          <div className="pd-sec">
            <h3 style={{ fontWeight: 800, marginTop: 0 }}>Live Preview</h3>
            <div className="pd-hint" style={{ marginBottom: 12 }}>
              Renders live from the current design state (colors, logo, components, order) — refresh while you edit. PDF is generated on demand (toolbar button).
            </div>
            <div className="pd-preview-frame" dangerouslySetInnerHTML={{ __html: liveHtml || `<div class="pd-hint">Add components to the canvas to see the live payslip.</div>` }} />
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

      <ConfirmDialog
        isOpen={showConfirmPublish}
        title="Publish payslip template"
        message="Publishing creates an immutable active version used by payroll processing. The blueprint is validated first. Proceed?"
        confirmLabel="Publish version"
        onConfirm={handlePublish}
        onCancel={() => setShowConfirmPublish(false)}
      />
    </>
  );
}

export default function PayslipDesigner() {
  return <MainLayout><PayslipDesignerPanel /></MainLayout>;
}

/* ── Sub-components ──────────────────────────────────────────── */

function ThemeField({ label, value, onChange, type = "text" }) {
  return (
    <div className="pd-field">
      <label>{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

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

/* Property editor for the selected component */
function PropertyEditor({ comp, nests, onChange, onLogic, onRemove, onDuplicate, onMove }) {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const kindColor = { earning: "var(--green)", deduction: "var(--red)", employer: "var(--primary)", reimbursement: "#7c3aed" }[comp.kind] || "var(--text)";
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{comp.label}</div>
          <div style={{ fontSize: 11, color: "var(--subtext)" }}>{comp.id} · <span style={{ color: kindColor }}>{comp.kind}</span> · {comp.logic.type}</div>
        </div>
        <span style={{ display: "flex", gap: 4 }}>
          <button className="pd-btn small" onClick={onDuplicate}><Copy size={11} /></button>
          <button className="pd-btn small danger" onClick={onRemove}><Trash2 size={11} /></button>
        </span>
      </div>

      <div className="pd-row" style={{ marginBottom: 8 }}>
        <div><button className="pd-btn small" onClick={() => onMove(0, -10)}>▲</button></div>
        <div><button className="pd-btn small" onClick={() => onMove(0, 10)}>▼</button></div>
        <div><button className="pd-btn small" onClick={() => onMove(-10, 0)}>◀</button></div>
        <div><button className="pd-btn small" onClick={() => onMove(10, 0)}>▶</button></div>
      </div>

      <h4>Identity</h4>
      <div className="pd-field"><label>Label</label><input value={comp.label} onChange={(e) => onChange({ label: e.target.value })} /></div>
      <div className="pd-field">
        <label>Nest / group</label>
        <select value={comp.nestId || ""} onChange={(e) => onChange({ nestId: e.target.value || null })}>
          <option value="">(unassigned)</option>
          {nests.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>

      <h4>Data binding</h4>
      <div className="pd-field" style={{ position: "relative" }}>
        <label>Field source <button className="pd-btn small" onClick={() => setShowFieldPicker((s) => !s)} style={{ marginLeft: 6 }}>Pick field</button></label>
        <input value={comp.dataBinding?.source || ""} onChange={(e) => onChange({ dataBinding: { ...comp.dataBinding, source: e.target.value } })} placeholder="employee.name" />
        {showFieldPicker && (
          <div style={{ position: "absolute", top: 52, left: 0, right: 0, zIndex: 40, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", maxHeight: 300, overflowY: "auto" }}>
            {FIELD_TREE.map((g) => (
              <div key={g.group}>
                <div style={{ padding: "6px 12px 2px", fontSize: 10.5, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>{g.group}</div>
                {g.fields.map((f) => (
                  <button
                    key={f.source}
                    className="pd-btn"
                    style={{ display: "flex", width: "100%", justifyContent: "space-between", border: "none", borderBottom: "1px solid var(--border)", borderRadius: 0 }}
                    onClick={() => { onChange({ dataBinding: { ...comp.dataBinding, source: f.source } }); setShowFieldPicker(false); }}
                  >
                    <span>{f.label}</span><span style={{ color: "var(--subtext)", fontFamily: "monospace", fontSize: 10 }}>{f.source}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <h4>Calculation logic</h4>
      <div className="pd-field">
        <label>Type</label>
        <select value={comp.logic.type} onChange={(e) => onLogic({ type: e.target.value })}>
          <option value="fixed">Fixed amount</option>
          <option value="percentage">Percentage of field</option>
          <option value="formula">Formula</option>
        </select>
      </div>
      {comp.logic.type === "fixed" && (
        <div className="pd-field">
          <label>Fixed amount (₹)</label>
          <input type="number" value={comp.logic.value ?? 0} onChange={(e) => onLogic({ value: Number(e.target.value) })} />
        </div>
      )}
      {comp.logic.type === "percentage" && (
        <>
          <div className="pd-field">
            <label>Percentage %</label>
            <input type="number" value={comp.logic.pct ?? 0} onChange={(e) => onLogic({ pct: Number(e.target.value) })} />
          </div>
          <div className="pd-field">
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--label)", marginBottom: 4 }}>Source field (of)</label>
            <select
              value={comp.logic.sourceField || "ctc"}
              onChange={(e) => onLogic({ sourceField: e.target.value })}
              style={{ height: 34, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, background: "var(--card)", outline: "none", cursor: "pointer" }}
            >
              {["basic", "hra", "conveyance", "medical", "performance_bonus", "other", "ctc", "monthlyGross", "gross"].map((s) => (
                <option key={s} value={s}>{s === "ctc" ? "ctc (monthly CTC)" : s === "monthlyGross" ? "monthlyGross (CTC)" : s}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {comp.logic.type === "formula" && (
        <div className="pd-field">
          <label>Formula (safe syntax, e.g. basic*0.5 or MIN(basic*0.5,15000))</label>
          <textarea rows={2} value={comp.logic.formula || ""} onChange={(e) => onLogic({ formula: e.target.value })} />
        </div>
      )}
      <div className="pd-row">
        <div className="pd-field">
          <label>Priority</label>
          <input type="number" value={comp.logic.calculationPriority ?? 20} onChange={(e) => onLogic({ calculationPriority: Number(e.target.value) })} />
        </div>
        <div className="pd-field">
          <label>Balancing</label>
          <select value={comp.logic.isBalancing ? "yes" : "no"} onChange={(e) => onLogic({ isBalancing: e.target.value === "yes" })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      <h4>Maximum threshold</h4>
      <div className="pd-field">
        <label>Threshold type</label>
        <select
          value={comp.logic.max?.pct !== undefined ? "percent" : comp.logic.max?.formula ? "formula" : "amount"}
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === "percent") onLogic({ max: { ...(comp.logic.max || {}), pct: comp.logic.max?.pct ?? 10, pctOf: comp.logic.max?.pctOf || "ctc", value: undefined, formula: undefined, action: comp.logic.max?.action || "cap" } });
            else if (mode === "formula") onLogic({ max: { ...(comp.logic.max || {}), pct: undefined, pctOf: undefined, formula: comp.logic.max?.formula || "basic * 0.5", value: undefined, action: comp.logic.max?.action || "cap" } });
            else onLogic({ max: { ...(comp.logic.max || {}), value: comp.logic.max?.value ?? 0, pct: undefined, pctOf: undefined, formula: undefined, action: comp.logic.max?.action || "cap" } });
          }}
        >
          <option value="amount">Amount (₹)</option>
          <option value="percent">Percentage (% of a field)</option>
          <option value="formula">Formula</option>
        </select>
      </div>
      <div className="pd-row">
        {comp.logic.max?.pct !== undefined ? (
          <>
            <div className="pd-field">
              <label>Max percent %</label>
              <input type="number" value={comp.logic.max.pct} onChange={(e) => onLogic({ max: { ...comp.logic.max, pct: Number(e.target.value), action: comp.logic.max.action || "cap" } })} />
            </div>
            <div className="pd-field">
              <label>Percent of field</label>
              <input value={comp.logic.max.pctOf || ""} onChange={(e) => onLogic({ max: { ...comp.logic.max, pctOf: e.target.value, action: comp.logic.max.action || "cap" } })} placeholder="ctc" />
            </div>
          </>
        ) : comp.logic.max?.formula ? (
          <div className="pd-field">
            <label>Max formula (e.g. basic*0.5, MIN(basic*0.5, 15000))</label>
            <textarea rows={2} value={comp.logic.max.formula} onChange={(e) => onLogic({ max: { ...comp.logic.max, formula: e.target.value, action: comp.logic.max.action || "cap" } })} />
          </div>
        ) : (
          <div className="pd-field">
            <label>Max value (₹)</label>
            <input type="number" value={comp.logic.max?.value ?? ""} onChange={(e) => onLogic({ max: { ...(comp.logic.max || {}), value: e.target.value === "" ? undefined : Number(e.target.value), action: comp.logic.max?.action || "cap" } })} />
          </div>
        )}
        <div className="pd-field">
          <label>Action</label>
          <select value={comp.logic.max?.action || ""} onChange={(e) => onLogic({ max: { ...(comp.logic.max || {}), action: e.target.value } })}>
            <option value="">None</option>
            <option value="cap">Cap</option>
            <option value="transfer">Transfer excess</option>
            <option value="error">Error</option>
            <option value="set_zero">Set to zero</option>
            <option value="ignore">Ignore</option>
          </select>
        </div>
      </div>
      {comp.logic.max?.action === "transfer" && (
        <div className="pd-field">
          <label>Transfer excess to component</label>
          <input value={comp.logic.max.transferTo || ""} onChange={(e) => onLogic({ max: { ...comp.logic.max, transferTo: e.target.value } })} placeholder="special_allowance" />
        </div>
      )}

      <h4>Visibility</h4>
      <div className="pd-field">
        <label>Visible</label>
        <select value={comp.visible === false ? "no" : "yes"} onChange={(e) => onChange({ visible: e.target.value === "yes" })}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      <div className="pd-row" style={{ marginTop: 8 }}>
        <div><button className="pd-btn" onClick={() => onChange({ ui: { ...comp.ui, x: 20, y: 20 } })}>Reset position</button></div>
      </div>
    </>
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