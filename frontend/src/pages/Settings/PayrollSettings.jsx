/**
 * Payslip Settings — company-wide attendance & pay rules that the payroll
 * engine uses to build payslips. These replace the old hardcoded rates:
 * every value here was previously a fixed constant in the backend. Saving
 * writes to /api/company/payroll-config and takes effect on the next payroll
 * run (existing paid runs keep their stored amounts).
 */
import { useEffect, useMemo, useState } from "react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import {
  getPayrollConfig,
  updatePayrollConfig,
} from "../../services/payrollService.js";
import { useToast } from "../../context/ToastContext.jsx";

const DEFAULTS = {
  shiftStartMinutes: 540,
  shiftEndMinutes: 1080,
  weeklyOffDays: [],
  epfEmployerRate: 0.13,
  esiEmployerRate: 0.0325,
  esiGrossCeiling: 21000,
  gratuityRate: 0.0481,
  overtimeMultiplier: 1.5,
  weeklyOffWorkedMultiplier: 2.0,
  holidayWorkedMultiplier: 2.0,
  nightShiftAllowance: 100,
  nightOtMultiplier: 2.0,
  weeklyOffOtMultiplier: 2.0,
  holidayOtMultiplier: 2.0,
  minOtMinutesThreshold: 30,
  maxOtHoursMonthly: 60,
  basicSalaryFactor: 0.5,
  hraFactor: 0.2,
  conveyanceAllowance: 400,
  medicalAllowance: 250,
  providentFundRate: 0.12,
  professionalTax: 200,
  incomeTaxRate: 0.05,
  healthInsurance: 180,
  defaultTaxRegime: "NEW",
};

const inp = {
  width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", fontSize: 14, color: "var(--text)",
  background: "var(--card)", outline: "none", boxSizing: "border-box",
};

const card = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
  padding: "20px", marginBottom: 20,
};

const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--subtext)", marginBottom: 6 };
const sectionTitle = {
  fontSize: 13.5, fontWeight: 700, color: "var(--text)", textTransform: "uppercase",
  letterSpacing: 0.5, marginBottom: 16,
};

function Field({ label: l, value, onChange, suffix, step = "any", min, type = "number" }) {
  return (
    <div>
      <label style={label}>{l}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type={type}
          value={value === null || value === undefined ? "" : value}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          style={inp}
        />
        {suffix && <span style={{ fontSize: 12, color: "var(--subtext)", minWidth: 24 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children, cols = 3 }) {
  return (
    <div style={card}>
      <p style={sectionTitle}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

const r10 = (n) => Math.round(n / 10) * 10;

function previewSplit(cfg, annual) {
  const monthly = Math.max(Number(annual) || 0, 0) / 12;
  const basic = r10(monthly * cfg.basicSalaryFactor);
  const hra = r10(monthly * cfg.hraFactor);
  const conv = cfg.conveyanceAllowance || 0;
  const med = cfg.medicalAllowance || 0;
  const other = Math.max(0, r10(monthly - basic - hra - conv - med));
  const pf = r10(basic * cfg.providentFundRate);
  const it = r10(monthly * cfg.incomeTaxRate);
  return { basic, hra, conv, med, other, gross: basic + hra + conv + med + other, pf, pt: cfg.professionalTax || 0, it, hi: cfg.healthInsurance || 0 };
}

const toTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const fromTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return NaN;
  return Math.min(23, Math.max(0, parseInt(m[1], 10))) * 60 + Math.min(59, parseInt(m[2], 10));
};

export default function PayrollSettings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [annual, setAnnual] = useState(300000);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    getPayrollConfig()
      .then((res) => {
        const c = res.data ?? res;
        setCfg(c);
        setForm({ ...DEFAULTS, ...c });
      })
      .catch((e) => toast(e.message || "Could not load pay settings", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const preview = useMemo(() => (form ? previewSplit(form, annual) : null), [form, annual]);

  const save = async () => {
    if (!form) return;
    const payload = { ...form, weeklyOffDays: [...(form.weeklyOffDays || [])] };
    setBusy(true);
    try {
      const res = await updatePayrollConfig(payload);
      const c = res.data ?? res;
      setForm({ ...DEFAULTS, ...c });
      toast("Pay settings saved - applies to the next payroll run");
    } catch (e) {
      toast(e.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await updatePayrollConfig({ ...DEFAULTS });
      const c = res.data ?? res;
      setForm({ ...DEFAULTS, ...c });
      toast("Restored built-in defaults");
    } catch (e) {
      toast(e.message || "Reset failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const inr = (n) => "\u20B9" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

  if (loading) {
    return (
      <MainLayout>
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spinner /></div>
      </MainLayout>
    );
  }

  if (!form) {
    return (
      <MainLayout>
        <PageHeader title="Payslip Settings" subtitle="Company-wide pay & attendance rules" />
        <p style={{ color: "var(--red)" }}>Could not load pay settings.</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader title="Payslip Settings" subtitle={"Company-wide pay & attendance rules used to build payslips (company: " + (cfg?.companyName || "-") + ")"} />

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 640px", minWidth: 320 }}>
          {/* Salary split */}
          <Section title="Monthly Salary Split (employee pay) - % of monthly CTC">
            <Field label="Basic Salary %" value={form.basicSalaryFactor * 100} suffix="%" onChange={(v) => upd("basicSalaryFactor")(Number(v) / 100)} />
            <Field label="HRA %" value={form.hraFactor * 100} suffix="%" onChange={(v) => upd("hraFactor")(Number(v) / 100)} />
            <Field label="Conveyance Allowance" value={form.conveyanceAllowance} suffix="INR/mo" onChange={upd("conveyanceAllowance")} />
            <Field label="Medical Allowance" value={form.medicalAllowance} suffix="INR/mo" onChange={upd("medicalAllowance")} />
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={{ fontSize: 12, color: "var(--subtext)" }}>
                Balance falls into Other Allowances automatically. Applies only to employees without a saved salary structure.
              </p>
            </div>
          </Section>

          {/* Deductions */}
          <Section title="Employee Deductions (monthly, per payslip)">
            <Field label="PF / EPF (Employee)" value={form.providentFundRate * 100} suffix="%" onChange={(v) => upd("providentFundRate")(Number(v) / 100)} />
            <Field label="Professional Tax" value={form.professionalTax} suffix="INR/mo" onChange={upd("professionalTax")} />
            <Field label="Income Tax (flat)" value={form.incomeTaxRate * 100} suffix="%" onChange={(v) => upd("incomeTaxRate")(Number(v) / 100)} />
            <Field label="Health Insurance" value={form.healthInsurance} suffix="INR/mo" onChange={upd("healthInsurance")} />
          </Section>

          {/* Employer */}
          <Section title="Employer Contributions">
            <Field label="EPF (Employer)" value={form.epfEmployerRate * 100} suffix="%" onChange={(v) => upd("epfEmployerRate")(Number(v) / 100)} />
            <Field label="ESI (Employer)" value={form.esiEmployerRate * 100} suffix="%" onChange={(v) => upd("esiEmployerRate")(Number(v) / 100)} />
            <Field label="ESI Gross Ceiling" value={form.esiGrossCeiling} suffix="INR" onChange={upd("esiGrossCeiling")} />
            <Field label="Gratuity" value={form.gratuityRate * 100} suffix="%" onChange={(v) => upd("gratuityRate")(Number(v) / 100)} />
          </Section>

          {/* Overtime & Shift Differentials (Scenario 5 & 7) */}
          <Section title="Overtime & Differential Rates (Scenario 5 & 7)">
            <Field label="Normal-Day OT Rate" value={form.overtimeMultiplier} suffix="x" onChange={upd("overtimeMultiplier")} />
            <Field label="Weekly-Off OT Rate" value={form.weeklyOffOtMultiplier} suffix="x" onChange={upd("weeklyOffOtMultiplier")} />
            <Field label="Holiday OT Rate" value={form.holidayOtMultiplier} suffix="x" onChange={upd("holidayOtMultiplier")} />
            <Field label="Night OT Rate" value={form.nightOtMultiplier} suffix="x" onChange={upd("nightOtMultiplier")} />
            <Field label="Night Shift Allowance (Per Shift)" value={form.nightShiftAllowance} suffix="INR/shift" onChange={upd("nightShiftAllowance")} />
            <Field label="Minimum OT Threshold" value={form.minOtMinutesThreshold} suffix="minutes" onChange={upd("minOtMinutesThreshold")} />
            <Field label="Maximum OT Hours (Monthly Cap)" value={form.maxOtHoursMonthly} suffix="hrs/mo" onChange={upd("maxOtHoursMonthly")} />
          </Section>

          {/* Attendance */}
          <Section title="Attendance & Working Week">
            <Field label="Shift Start" value={toTime(form.shiftStartMinutes)} type="time" onChange={(v) => upd("shiftStartMinutes")(fromTime(v) || form.shiftStartMinutes)} />
            <Field label="Shift End" value={toTime(form.shiftEndMinutes)} type="time" onChange={(v) => upd("shiftEndMinutes")(fromTime(v) || form.shiftEndMinutes)} />
            <div>
              <label style={label}>Weekly Off Days</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                  <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={(form.weeklyOffDays || []).includes(i)}
                      onChange={(e) => {
                        const cur = form.weeklyOffDays || [];
                        upd("weeklyOffDays")(e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i));
                      }}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={label}>Default Tax Regime</label>
              <select value={form.defaultTaxRegime} onChange={(e) => upd("defaultTaxRegime")(e.target.value)} style={inp}>
                <option value="NEW">New Regime</option>
                <option value="OLD">Old Regime</option>
              </select>
            </div>
          </Section>

          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <button
              onClick={save}
              disabled={busy}
              style={{ padding: "10px 22px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              {busy ? "Saving..." : "Save Settings"}
            </button>
            <button
              onClick={reset}
              disabled={busy}
              style={{ padding: "10px 18px", background: "transparent", color: "var(--subtext)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Restore Defaults
            </button>
          </div>
        </div>

        {/* Live preview */}
        {preview && (
          <div style={{ flex: "0 0 360px", minWidth: 300, position: "sticky", top: 90 }}>
            <div style={card}>
              <p style={sectionTitle}>Live Payslip Preview</p>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Yearly Salary (INR)</label>
                <input type="number" value={annual} onChange={(e) => setAnnual(e.target.value)} style={inp} />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[
                    ["Basic Salary", preview.basic], ["HRA", preview.hra],
                    ["Conveyance", preview.conv], ["Medical", preview.med],
                    ["Other Allowances", preview.other],
                    ["Monthly Gross", preview.gross],
                    ["- PF (Employee)", "-" + preview.pf], ["- Professional Tax", "-" + preview.pt],
                    ["- Income Tax", "-" + preview.it], ["- Health Insurance", "-" + preview.hi],
                  ].map(([k, v], i, arr) => {
                    const bold = i === 5 || i === arr.length - 1;
                    const shot = i === arr.length - 1 ? "Net Pay" : k;
                    return (
                      <tr key={k} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 0", color: bold ? "var(--text)" : "var(--subtext)", fontWeight: bold ? 700 : 400 }}>
                          {shot}
                        </td>
                        <td style={{ padding: "7px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: bold ? "var(--text)" : "var(--subtext)" }}>
                          {inr(v)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: "var(--subtext)", marginTop: 12 }}>
                Same formula the backend uses. Employee annual salaries come from Employee records (CTC), not the attendance file.
              </p>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}