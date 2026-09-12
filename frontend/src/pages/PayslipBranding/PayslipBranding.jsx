/**
 * Payslip Branding — company settings used on every generated payslip.
 * Hosts the company identity (name/logo/website) plus the payslip THEME
 * (colors, fonts, page, branding logo) and a live PREVIEW — the theme &
 * preview controls that used to live in the payslip designer.
 * HR/Admin only (backend enforced).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import {
  getCompanyBranding, saveCompanyBranding,
  uploadCompanyLogo, removeCompanyLogo,
} from "../../services/payslipBrandingService.js";
import {
  listPayslipTemplates, getPayslipTemplate, savePayslipDraft, calculateBlueprint, createPayslipTemplate,
} from "../../services/payslipDesignerService.js";
import { inr } from "../PayslipDesigner/format.js";
import { assetUrl } from "../../utils/assetUrl.js";
import { useToast } from "../../context/ToastContext.jsx";

const inputStyle = {
  width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", fontSize: 14, color: "var(--text)", background: "var(--card)", outline: "none",
};

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  secondaryColor: "#0d1b2a",
  accentColor: "#0891b2",
  font: "Helvetica",
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
};

function BrandBlock({ title, url, onUpload, onRemove, disabled, uploading }) {
  const ref = useRef(null);
  return (
    <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>{title}</p>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {url ? (
          <img src={assetUrl(url)} alt={title} style={{ width: 96, height: 96, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }} />
        ) : (
          <div style={{ width: 96, height: 96, border: "1px dashed var(--border)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--subtext)", fontSize: 12 }}>No image</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ""; }} />
          <button
            onClick={() => ref.current?.click()}
            disabled={disabled || uploading}
            style={{ padding: "8px 14px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            {uploading ? "Uploading…" : url ? "Replace Image" : "Upload Image"}
          </button>
          {url && (
            <button onClick={onRemove} disabled={disabled} style={{ padding: "8px 14px", background: "transparent", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PayslipBrandingPanel() {
  const [form, setForm] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [upLogo, setUpLogo] = useState(false);
  const [msg, setMsg] = useState(null);
  const toast = useToast();

  // ── Theme + preview (moved from the payslip designer) ──
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [calcResult, setCalcResult] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeMsg, setThemeMsg] = useState(null);

  useEffect(() => {
    getCompanyBranding()
      .then((b) => {
        setForm({
          companyName: b.companyName || "", tagline: b.tagline || "", website: b.website || "",
          address: b.address || "",
        });
        setLogoUrl(b.logoUrl || "");
      })
      .catch((e) => setMsg({ ok: false, text: e.message || "Could not load branding" }));
  }, []);

  useEffect(() => {
    listPayslipTemplates()
      .then((res) => {
        const list = res.data || [];
        setTemplates(list);
        const active = list.find((t) => t.isActive && t.status === "Published");
        const pick = active || list[0];
        if (pick) setTemplateId(pick.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateId) return;
    getPayslipTemplate(templateId)
      .then((r) => {
        const bp = r.data?.latestBlueprint;
        if (bp) {
          setBlueprint(JSON.parse(JSON.stringify(bp)));
          setLogoPreviewUrl(null);
          setCalcResult(null);
        }
      })
      .catch(() => {});
  }, [templateId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const flash = (ok, text) => { setMsg({ ok, text }); window.setTimeout(() => setMsg(null), 4000); };
  const flashTheme = (ok, text) => { setThemeMsg({ ok, text }); window.setTimeout(() => setThemeMsg(null), 4000); };

  const handleLogoUpload = async (file) => {
    setUpLogo(true);
    try { const b = await uploadCompanyLogo(file); setLogoUrl(b.logoUrl); flash(true, "Logo uploaded"); toast("Logo uploaded"); }
    catch (e) { flash(false, e.message || "Upload failed"); toast(e.message || "Upload failed", "error"); }
    finally { setUpLogo(false); }
  };
  const handleLogoRemove = async () => {
    setBusy(true);
    try { await removeCompanyLogo(); setLogoUrl(""); flash(true, "Logo removed"); toast("Logo removed"); }
    catch (e) { flash(false, e.message || "Remove failed"); toast(e.message || "Remove failed", "error"); }
    finally { setBusy(false); }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveCompanyBranding(form);
      flash(true, "Branding saved");
      toast("Payslip branding saved");
    } catch (e) {
      flash(false, e.message || "Save failed");
      toast(e.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Theme editing ────────────────────────────────────────────────────────
  const theme = blueprint?.theme || DEFAULT_THEME;
  const settings = blueprint?.settings || {};

  const mutateBlueprint = (fn) => {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  };
  const setThemeField = (key) => (e) => mutateBlueprint((bp) => { bp.theme = { ...bp.theme, [key]: e.target.value }; });
  const setMargin = (key) => (e) => mutateBlueprint((bp) => { bp.theme = { ...bp.theme, margins: { ...bp.theme.margins, [key]: Number(e.target.value) } }; });
  const setSetting = (key) => (e) => mutateBlueprint((bp) => { bp.settings = { ...(bp.settings || {}), [key]: e.target.value }; });
  const setSettingNum = (key) => (e) => mutateBlueprint((bp) => { bp.settings = { ...(bp.settings || {}), [key]: Number(e.target.value) }; });

  const handleThemeLogo = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
    const reader = new FileReader();
    reader.onload = () => {
      mutateBlueprint((bp) => { bp.theme = { ...bp.theme, logo: reader.result }; });
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    reader.readAsDataURL(file);
  };

  const handleThemeSave = async () => {
    if (!blueprint || !templateId) return;
    setThemeBusy(true);
    try {
      const res = await savePayslipDraft(templateId, blueprint, "Theme updated from Payslip Branding");
      flashTheme(true, `Theme saved (v${res.data?.version ?? "?"})`);
      toast("Payslip theme saved");
    } catch (e) {
      flashTheme(false, e.message || "Save failed");
      toast(e.message || "Save failed", "error");
    } finally {
      setThemeBusy(false);
    }
  };

  const handleNewTemplate = async () => {
    const name = prompt("Template name", "New Payslip Template");
    if (!name) return;
    setThemeBusy(true);
    try {
      const r = await createPayslipTemplate({ name });
      const list = await listPayslipTemplates();
      setTemplates(list.data || []);
      setTemplateId(r.data.id);
      toast("Payslip template created");
    } catch (e) {
      flashTheme(false, e.message || "Could not create template");
      toast(e.message || "Could not create template", "error");
    } finally {
      setThemeBusy(false);
    }
  };

  const themeLogoShown = logoPreviewUrl || theme.logo;

  // Recalculate whenever the theme/blueprint changes so the preview stays live.
  useEffect(() => {
    if (!blueprint) return;
    const t = window.setTimeout(() => {
      calculateBlueprint(blueprint, { basic: 40000, monthlyGross: 60000, annualSalary: 720000 })
        .then((r) => setCalcResult(r.data))
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(t);
  }, [blueprint]);

  // ── Live preview (moved from the payslip designer) ──
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
    return `<div style="font-family:${t.font};color:#0e1e2c;max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px">
      <div style="background:${t.primaryColor};color:#fff;border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:12px">
        ${logoUrl ? `<img src="${assetUrl(logoUrl)}" alt="logo" style="max-height:44px;max-width:90px;object-fit:contain;background:#fff;border-radius:4px;padding:2px" />` : (t.logo ? `<img src="${t.logo}" alt="logo" style="max-height:44px;max-width:90px;object-fit:contain;background:#fff;border-radius:4px;padding:2px" />` : "")}
        <div>
          <h2 style="margin:0;font-size:16px">${form?.companyName || settings.companyName || "Company"}</h2>
          <div style="opacity:.85;font-size:12px">${form?.tagline || `Salary Payslip · FY ${blueprint.financialYear || new Date().getFullYear()}`}</div>
        </div>
      </div>
      ${sec("Earnings", earnings, t.primaryColor)}
      ${sec("Deductions", deductions, "#dc2626")}
      <div style="display:flex;justify-content:space-between;border-top:2px solid ${t.primaryColor};margin-top:14px;padding-top:8px;font-weight:800;font-size:14px">
        <span>Net Pay</span><span>${calcResult ? inr(calcResult.net) : "—"}</span>
      </div>
    </div>`;
  }, [blueprint, calcResult, logoUrl, form?.companyName, form?.tagline]);

  if (!form) return <Spinner />;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="Payslip Branding" subtitle="Company identity, payslip theme and live preview used on every generated payslip">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, background: "var(--card)", outline: "none", cursor: "pointer" }}
        >
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.latestVersion}){t.isActive && t.status === "Published" ? " — Active" : ""}</option>)}
        </select>
        <button onClick={handleNewTemplate} disabled={themeBusy} style={{ padding: "8px 14px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: themeBusy ? "not-allowed" : "pointer", opacity: themeBusy ? 0.7 : 1 }}>
          <Plus size={14} style={{ verticalAlign: "middle", marginRight: 4 }} /> New
        </button>
      </PageHeader>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, background: msg.ok ? "var(--green-light,#f0fdf4)" : "var(--red-light)", color: msg.ok ? "#16a34a" : "var(--red)", border: `1px solid ${msg.ok ? "#bbf7d0" : "var(--red)"}` }}>
          {msg.text}
        </div>
      )}

      {/* ── Company ── */}
      <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 22 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Company</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[["companyName", "Company Name"], ["website", "Company Website"], ["tagline", "Company Tagline"]].map(([k, label]) => (
            <label key={k} style={{ fontSize: 12.5, color: "var(--label)" }}>
              {label}
              <input style={{ ...inputStyle, marginTop: 6 }} value={form[k]} onChange={set(k)} />
            </label>
          ))}
          <label style={{ fontSize: 12.5, color: "var(--label)", gridColumn: "1 / -1" }}>
            Company Address
            <textarea style={{ ...inputStyle, height: 70, paddingTop: 10 }} value={form.address} onChange={set("address")} />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <BrandBlock title="Company Logo (PNG / JPG / JPEG / SVG)" url={logoUrl} onUpload={handleLogoUpload} onRemove={handleLogoRemove} disabled={busy} uploading={upLogo} />
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={handleSave} disabled={busy} style={{ padding: "10px 22px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {busy ? "Saving…" : "Save Company"}
          </button>
        </div>
      </div>

      {/* ── Theme (moved from the payslip designer) ── */}
      <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: 0 }}>Theme</p>
        </div>

        {!blueprint ? (
          <p style={{ fontSize: 13, color: "var(--subtext)" }}>No payslip template found. Click "New" to create one.</p>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--label)", marginBottom: 12 }}>
              Colors, fonts, page size and margins apply automatically to the generated payslip.
            </div>

            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Payslip logo</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {themeLogoShown ? (
                <img src={logoPreviewUrl || theme.logo} alt="logo" style={{ width: 90, height: 60, objectFit: "contain", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
              ) : (
                <div style={{ width: 90, height: 60, border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--subtext)", fontSize: 11 }}>No logo</div>
              )}
              <label style={{ padding: "8px 14px", background: "var(--primary)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {themeLogoShown ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleThemeLogo(f); }} />
              </label>
              {themeLogoShown && (
                <button onClick={() => { setLogoPreviewUrl(null); mutateBlueprint((bp) => { const t2 = { ...bp.theme }; delete t2.logo; bp.theme = t2; }); }} style={{ padding: "8px 14px", background: "transparent", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Remove</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <ThemeField label="Primary color" value={theme.primaryColor} onChange={setThemeField("primaryColor")} type="color" />
              <ThemeField label="Secondary color" value={theme.secondaryColor} onChange={setThemeField("secondaryColor")} type="color" />
              <ThemeField label="Accent color" value={theme.accentColor} onChange={setThemeField("accentColor")} type="color" />
              <ThemeField label="Font" value={theme.font} onChange={setThemeField("font")} />
              <ThemeField label="Page size" value={theme.pageSize} onChange={setThemeField("pageSize")} />
              <ThemeField label="Orientation" value={theme.orientation} onChange={setThemeField("orientation")} />
              <ThemeField label="Left margin" value={theme.margins.left} onChange={setMargin("left")} type="number" />
              <ThemeField label="Top margin" value={theme.margins.top} onChange={setMargin("top")} type="number" />
            </div>

            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 18, marginBottom: 8 }}>Company</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              <ThemeField label="Company name" value={settings.companyName} onChange={setSetting("companyName")} />
              <ThemeField label="Employee count (eligibility)" value={settings.companyEmployeeCount ?? 50} onChange={setSettingNum("companyEmployeeCount")} type="number" />
            </div>

            {themeMsg && (
              <div style={{ marginTop: 12, padding: "9px 14px", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, background: themeMsg.ok ? "var(--green-light,#f0fdf4)" : "var(--red-light)", color: themeMsg.ok ? "#16a34a" : "var(--red)", border: `1px solid ${themeMsg.ok ? "#bbf7d0" : "var(--red)"}` }}>
                {themeMsg.text}
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <button onClick={handleThemeSave} disabled={themeBusy} style={{ padding: "10px 22px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontWeight: 700, cursor: themeBusy ? "not-allowed" : "pointer", opacity: themeBusy ? 0.7 : 1 }}>
                {themeBusy ? "Saving…" : "Save Theme"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Preview (moved from the payslip designer) ── */}
      <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 22 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Live Preview</p>
        <div style={{ fontSize: 12.5, color: "var(--subtext)", marginBottom: 14 }}>
          Renders live from the current theme and nesting (colors, logo, components, order).
        </div>
        {!blueprint ? (
          <p style={{ fontSize: 13, color: "var(--subtext)" }}>Load a payslip template to preview it here.</p>
        ) : (
          <div style={{ background: "var(--background)", padding: 18, borderRadius: "var(--radius)", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: liveHtml || `<div style="font-size:13px;color:var(--subtext)">Add components to a nest to see the live payslip.</div>` }} />
        )}
      </div>
    </div>
  );
}

export default function PayslipBranding() {
  return <MainLayout><PayslipBrandingPanel /></MainLayout>;
}

/* ── Sub-components ──────────────────────────────────────────── */

function ThemeField({ label, value, onChange, type = "text" }) {
  return (
    <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
      {label}
      <input type={type} value={value ?? ""} onChange={onChange} style={{ ...inputStyle, height: 38 }} />
    </label>
  );
}