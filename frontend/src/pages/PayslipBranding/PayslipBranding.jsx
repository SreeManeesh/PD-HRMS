/**
 * Payslip Branding — Company identity, settings, theme customizer,
 * and live interactive preview with the Premium Dark Payslip Template.
 * Fully dynamic end-to-end with live employee data binding, state-wise
 * statutory proration, and export / print controls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Printer,
  Eye,
  Trash2,
  Upload,
  X,
  Building,
  FileText,
  ShieldCheck,
  Users,
  Sparkles,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import {
  getCompanyBranding,
  saveCompanyBranding,
  uploadCompanyLogo,
  removeCompanyLogo,
} from "../../services/payslipBrandingService.js";
import {
  listPayslipTemplates,
  getPayslipTemplate,
  savePayslipDraft,
  createPayslipTemplate,
} from "../../services/payslipDesignerService.js";
import { getEmployees } from "../../services/employeeService.js";
import { getWageRates } from "../../services/payrollService.js";
import { basicMonthlyFor } from "../../utils/wageRates.js";
import { assetUrl } from "../../utils/assetUrl.js";
import { useToast } from "../../context/ToastContext.jsx";
import ClassicTablePayslip from "../../components/payslip/ClassicTablePayslip.jsx";

const inputStyle = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  color: "var(--text)",
  background: "var(--card)",
  outline: "none",
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
  background: "var(--card)",
};

const DEFAULT_THEME = {
  primaryColor: "#0f766e",
  secondaryColor: "#0f172a",
  accentColor: "#0d9488",
  font: "Inter, sans-serif",
  pageSize: "A4",
  orientation: "portrait",
  margins: { top: 32, right: 32, bottom: 32, left: 32 },
};

const FONT_OPTIONS = [
  { label: "Inter (Modern Sans)", value: "Inter, sans-serif" },
  { label: "Roboto (Clean Neo-grotesque)", value: "Roboto, sans-serif" },
  { label: "Outfit (Geometric Display)", value: "Outfit, sans-serif" },
  { label: "Poppins (Contemporary Sans)", value: "Poppins, sans-serif" },
  { label: "Helvetica / Arial (Standard)", value: "Helvetica, Arial, sans-serif" },
  { label: "JetBrains Mono (Technical)", value: "'JetBrains Mono', monospace" },
  { label: "Courier New (Monospace)", value: "'Courier New', monospace" },
];

const PAGE_SIZE_OPTIONS = [
  { label: "A4 (210 × 297 mm)", value: "A4" },
  { label: "Letter (8.5 × 11 in)", value: "Letter" },
  { label: "Legal (8.5 × 14 in)", value: "Legal" },
  { label: "Executive (7.25 × 10.5 in)", value: "Executive" },
];

const ORIENTATION_OPTIONS = [
  { label: "Portrait (Vertical)", value: "portrait" },
  { label: "Landscape (Horizontal)", value: "landscape" },
];

const STATE_STATUTORY_RATES = {
  Maharashtra: { pt: 200, lwf: 20 },
  Delhi: { pt: 0, lwf: 0.75 },
  Haryana: { pt: 0, lwf: 25 },
  Karnataka: { pt: 200, lwf: 6 },
  Gujarat: { pt: 200, lwf: 6 },
  "Tamil Nadu": { pt: 208, lwf: 20 },
  Telangana: { pt: 200, lwf: 20 },
  "West Bengal": { pt: 150, lwf: 3 },
  Kerala: { pt: 208, lwf: 20 },
  "Uttar Pradesh": { pt: 0, lwf: 10 },
};

const FALLBACK_EMPLOYEE = {
  id: "emp-sample-1",
  employeeCode: "EMP-10024",
  firstName: "Amit",
  lastName: "Verma",
  email: "amit.verma@company.com",
  phone: "+91 98765 43210",
  designation: { title: "Lead Software Architect" },
  department: { name: "Engineering & Technology" },
  location: { name: "Mumbai Tech Park, Maharashtra" },
  state: "Maharashtra",
  skillType: "Highly Skilled",
  annualSalary: 960000,
  dailyWageRate: null,
  salaryType: "Monthly",
  panNumber: "ABCDE1234F",
  uanNumber: "101298457890",
  bankAccount: "918237465912",
  bankName: "HDFC Bank",
  ifscCode: "HDFC0001234",
  joiningDate: "2023-04-10",
};

/**
 * Convert integer to Indian Rupees in words
 */
function numberToWordsINR(num) {
  if (!num || isNaN(num) || num <= 0) return "Zero Rupees Only";
  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const formatTens = (n) => {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : " ");
  };

  const formatHundreds = (n) => {
    let str = "";
    if (Math.floor(n / 100) > 0) {
      str += a[Math.floor(n / 100)] + "Hundred ";
    }
    const rem = n % 100;
    if (rem > 0) {
      str += formatTens(rem);
    }
    return str;
  };

  let intPart = Math.floor(num);
  let words = "";

  const crore = Math.floor(intPart / 10000000);
  intPart %= 10000000;
  const lakh = Math.floor(intPart / 100000);
  intPart %= 100000;
  const thousand = Math.floor(intPart / 1000);
  intPart %= 1000;
  const hundred = intPart;

  if (crore > 0) words += formatHundreds(crore) + "Crore ";
  if (lakh > 0) words += formatHundreds(lakh) + "Lakh ";
  if (thousand > 0) words += formatHundreds(thousand) + "Thousand ";
  if (hundred > 0) words += formatHundreds(hundred);

  return words.trim() + " Rupees Only";
}

/**
 * BrandBlock with viewable lightbox, editable, and deletable logo controls
 */
function BrandBlock({
  title,
  url,
  onUpload,
  onRemove,
  onView,
  disabled,
  uploading,
}) {
  const ref = useRef(null);
  return (
    <div
      style={{
        background: "var(--background)",
        borderRadius: "var(--radius)",
        padding: "16px",
        border: "1px solid var(--border)",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--subtext)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 12,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div
          onClick={() => url && onView?.(assetUrl(url))}
          style={{
            position: "relative",
            width: 100,
            height: 100,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            cursor: url ? "pointer" : "default",
          }}
          title={url ? "Click to preview full size" : "No image uploaded"}
        >
          {url ? (
            <>
              <img
                src={assetUrl(url)}
                alt={title}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
              >
                <Eye size={20} color="#fff" />
              </div>
            </>
          ) : (
            <div style={{ color: "var(--subtext)", fontSize: 11.5, textAlign: "center", padding: 8 }}>
              No Logo
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) onUpload(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => ref.current?.click()}
              disabled={disabled || uploading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: disabled || uploading ? "not-allowed" : "pointer",
                opacity: disabled || uploading ? 0.7 : 1,
              }}
            >
              <Upload size={13} />
              {uploading ? "Uploading…" : url ? "Replace Image" : "Upload Image"}
            </button>

            {url && (
              <button
                onClick={() => onView?.(assetUrl(url))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "8px 12px",
                  background: "var(--card)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Eye size={13} /> View
              </button>
            )}
          </div>

          {url && (
            <button
              onClick={onRemove}
              disabled={disabled}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                background: "transparent",
                color: "var(--red, #ef4444)",
                border: "1px solid var(--red, #ef4444)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                width: "fit-content",
              }}
            >
              <Trash2 size={12} /> Remove
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

  // Theme + Template state
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [blueprint, setBlueprint] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeMsg, setThemeMsg] = useState(null);

  // Lightbox modal state for logo viewing
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Live Employee Selection for Dynamic Preview
  const [employees, setEmployees] = useState([]);
  // Master wage rates (DB only) so the preview's Basic for daily-wage staff is
  // the wage-rate/override figure — never a hardcoded default.
  const [wageRates, setWageRates] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [previewMonth, setPreviewMonth] = useState(new Date().getMonth() + 1);
  const [previewYear, setPreviewYear] = useState(new Date().getFullYear());

  // Payslip Builder & Custom Logo controls
  const [templateFormat, setTemplateFormat] = useState("classic-table");
  const [logoDisplaySize, setLogoDisplaySize] = useState(170);
  const [payslipMonthText, setPayslipMonthText] = useState("July - 2026");
  const [payslipTitleText, setPayslipTitleText] = useState("Payslip for the month of");
  const [tableHeaderColor, setTableHeaderColor] = useState("#3478d4");
  const [netPayColor, setNetPayColor] = useState("#1f7a32");
  const [tableBorderColor, setTableBorderColor] = useState("#111111");
  const [payslipVisibility, setPayslipVisibility] = useState({
    info: true,
    attendance: true,
    salary: true,
    leave: true,
    net: true,
    words: true,
    note: true,
  });
  const logoUploadInputRef = useRef(null);

  useEffect(() => {
    getCompanyBranding()
      .then((b) => {
        setForm({
          companyName: b.companyName || "PT Technologies Private Limited",
          tagline: b.tagline || "PT | People | Process | Progress",
          website: b.website || "www.pttechnologies.com",
          address: b.address || "Floor 4, Cyber City Phase 2, Pune, Maharashtra 411014",
        });
        setLogoUrl(b.logoUrl || "");
      })
      .catch((e) =>
        setMsg({ ok: false, text: e.message || "Could not load branding" }),
      );
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
    getEmployees({ limit: 100 })
      .then((res) => {
        const emps = res.data || [];
        setEmployees(emps);
        if (emps.length > 0) {
          setSelectedEmpId(emps[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Wage rates (dynamic, DB-backed) — keeps the preview in sync when rates or
  // overrides change in Wage Rates & Overrides / Earnings.
  useEffect(() => {
    const load = () =>
      getWageRates()
        .then((res) => setWageRates(res.data || []))
        .catch(() => setWageRates([]));
    load();
    const onChanged = () => load();
    window.addEventListener("hrms:wage-rates-changed", onChanged);
    window.addEventListener("hrms:payroll-components-changed", onChanged);
    return () => {
      window.removeEventListener("hrms:wage-rates-changed", onChanged);
      window.removeEventListener("hrms:payroll-components-changed", onChanged);
    };
  }, []);

  useEffect(() => {
    if (!templateId) return;
    getPayslipTemplate(templateId)
      .then((r) => {
        const bp = r.data?.latestBlueprint;
        if (bp) {
          setBlueprint(JSON.parse(JSON.stringify(bp)));
          setLogoPreviewUrl(null);
        }
      })
      .catch(() => {});
  }, [templateId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const flash = (ok, text) => {
    setMsg({ ok, text });
    window.setTimeout(() => setMsg(null), 4000);
  };
  const flashTheme = (ok, text) => {
    setThemeMsg({ ok, text });
    window.setTimeout(() => setThemeMsg(null), 4000);
  };

  const handleLogoUpload = async (file) => {
    setUpLogo(true);
    try {
      const b = await uploadCompanyLogo(file);
      setLogoUrl(b.logoUrl);
      flash(true, "Company logo uploaded successfully!");
      toast("Logo uploaded");
    } catch (e) {
      flash(false, e.message || "Upload failed");
      toast(e.message || "Upload failed", "error");
    } finally {
      setUpLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!window.confirm("Are you sure you want to remove the company logo?")) return;
    setBusy(true);
    try {
      await removeCompanyLogo();
      setLogoUrl("");
      flash(true, "Company logo removed");
      toast("Logo removed");
    } catch (e) {
      flash(false, e.message || "Remove failed");
      toast(e.message || "Remove failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCompany = async () => {
    setBusy(true);
    try {
      await saveCompanyBranding(form);
      flash(true, "Company branding saved successfully");
      toast("Payslip branding saved");
    } catch (e) {
      flash(false, e.message || "Save failed");
      toast(e.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // Theme Editing Handlers
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

  const setThemeField = (key) => (e) =>
    mutateBlueprint((bp) => {
      bp.theme = { ...bp.theme, [key]: e.target.value };
    });

  const setMargin = (key) => (e) =>
    mutateBlueprint((bp) => {
      bp.theme = {
        ...bp.theme,
        margins: { ...bp.theme.margins, [key]: Number(e.target.value) },
      };
    });

  const setSetting = (key) => (e) =>
    mutateBlueprint((bp) => {
      bp.settings = { ...(bp.settings || {}), [key]: e.target.value };
    });

  const handleThemeLogo = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
    const reader = new FileReader();
    reader.onload = () => {
      mutateBlueprint((bp) => {
        bp.theme = { ...bp.theme, logo: reader.result };
      });
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    reader.readAsDataURL(file);
  };

  const handleThemeSave = async () => {
    if (!blueprint || !templateId) return;
    setThemeBusy(true);
    try {
      const res = await savePayslipDraft(
        templateId,
        blueprint,
        "Theme updated from Payslip Branding",
      );
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

  // Selected Employee object (with fallback)
  const currentEmployee = useMemo(() => {
    if (!employees || employees.length === 0) return FALLBACK_EMPLOYEE;
    const found = employees.find((e) => e.id === selectedEmpId);
    return found || employees[0] || FALLBACK_EMPLOYEE;
  }, [employees, selectedEmpId]);

  // Dynamically compute live payroll numbers for currentEmployee
  // Guard against null/undefined employee during async loads.
  const computedSalary = useMemo(() => {
    const emp = currentEmployee || {};
    const isDaily =
      emp.salaryType === "Daily" ||
      (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);
    const monthlyGross = isDaily
      ? basicMonthlyFor(emp, wageRates).basicMonthly
      : Math.round((Number(emp.annualSalary) || 720000) / 12);

    const basic = Math.round(monthlyGross * 0.5);
    const hra = Math.round(basic * 0.5);
    const conveyance = 1600;
    const specialAllowance = Math.max(0, monthlyGross - (basic + hra + conveyance));
    const medical = 1250;
    const weeklyOffPay = Math.round(basic / 26 * 4);
    const overtime = isDaily ? 1200 : 0;

    const totalGrossEarnings = basic + hra + conveyance + specialAllowance + medical + overtime;

    // State statutory deduction lookup
    const stateName = emp.location?.name?.includes("Delhi")
      ? "Delhi"
      : emp.location?.name?.includes("Karnataka")
      ? "Karnataka"
      : emp.location?.name?.includes("Gujarat")
      ? "Gujarat"
      : emp.location?.name?.includes("Haryana")
      ? "Haryana"
      : "Maharashtra";

    const stateRates = STATE_STATUTORY_RATES[stateName] || { pt: 200, lwf: 20 };

    const epf = Math.min(1800, Math.round(basic * 0.12));
    const pt = stateRates.pt;
    const tds = Math.round(monthlyGross * 0.03);
    const esi = monthlyGross <= 21000 ? Math.round(monthlyGross * 0.0075) : 0;
    const lwf = stateRates.lwf;
    const leaveDeduction = 0; // standard full month

    const totalDeductions = epf + pt + tds + esi + lwf + leaveDeduction;
    const netPay = Math.max(0, totalGrossEarnings - totalDeductions);
    const netPayWords = numberToWordsINR(netPay);

    return {
      monthlyGross,
      basic,
      hra,
      conveyance,
      specialAllowance,
      medical,
      weeklyOffPay,
      overtime,
      totalGrossEarnings,
      epf,
      pt,
      tds,
      esi,
      lwf,
      leaveDeduction,
      totalDeductions,
      netPay,
      netPayWords,
      stateName,
    };
  }, [currentEmployee, wageRates]);

  const handlePrint = () => {
    window.print();
  };

  if (!form) return <Spinner />;

  return (
    <div
      style={{
        maxWidth: 920,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        paddingBottom: 40,
      }}
    >
      <PageHeader
        title="Payslip Branding & Theme"
        subtitle="Configure company identity, typography, print settings, and view real-time live preview with the dark payslip template"
      >
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{
            height: 34,
            padding: "0 10px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            background: "var(--card)",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (v{t.latestVersion})
              {t.isActive && t.status === "Published" ? " — Active" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={handleNewTemplate}
          disabled={themeBusy}
          style={{
            padding: "8px 14px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: themeBusy ? "not-allowed" : "pointer",
            opacity: themeBusy ? 0.7 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Plus size={14} /> New
        </button>
      </PageHeader>

      {msg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            fontSize: 13,
            fontWeight: 600,
            background: msg.ok ? "var(--green-light,#f0fdf4)" : "var(--red-light)",
            color: msg.ok ? "#16a34a" : "var(--red)",
            border: `1px solid ${msg.ok ? "#bbf7d0" : "var(--red)"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Lightbox Modal for Logo Viewing */}
      {lightboxUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setLightboxUrl(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              maxWidth: 500,
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                Company Logo Preview
              </h4>
              <button
                onClick={() => setLightboxUrl(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--subtext)",
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div
              style={{
                padding: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f8fafc",
              }}
            >
              <img
                src={lightboxUrl}
                alt="Full preview"
                style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }}
              />
            </div>
            <div
              style={{
                padding: "12px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                borderTop: "1px solid var(--border)",
                background: "var(--background)",
              }}
            >
              <button
                onClick={() => setLightboxUrl(null)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Company Identity ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: 22,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Building size={18} style={{ color: "var(--primary)" }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Company Identity & Branding
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            ["companyName", "Company Name"],
            ["website", "Company Website"],
            ["tagline", "Company Tagline / Brand Slogan"],
          ].map(([k, label]) => (
            <label key={k} style={{ fontSize: 12.5, color: "var(--label)" }}>
              {label}
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={form[k] || ""}
                onChange={set(k)}
              />
            </label>
          ))}
          <label style={{ fontSize: 12.5, color: "var(--label)", gridColumn: "1 / -1" }}>
            Registered Company Address
            <textarea
              style={{ ...inputStyle, height: 70, paddingTop: 10, marginTop: 6 }}
              value={form.address || ""}
              onChange={set("address")}
            />
          </label>
        </div>

        <div style={{ marginTop: 18 }}>
          <BrandBlock
            title="Company Logo (Viewable, Replaceable, Deletable)"
            url={logoUrl}
            onUpload={handleLogoUpload}
            onRemove={handleLogoRemove}
            onView={(src) => setLightboxUrl(src)}
            disabled={busy}
            uploading={upLogo}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleSaveCompany}
            disabled={busy}
            style={{
              padding: "10px 22px",
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Saving…" : "Save Company Identity"}
          </button>
        </div>
      </div>

      {/* ── Payslip Builder & Table Controls ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: 22,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <input
          type="file"
          ref={logoUploadInputRef}
          accept="image/png,image/jpeg,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLogoUpload(f);
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Sparkles size={18} style={{ color: "var(--primary)" }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Payslip Builder & Custom Logo Settings
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {/* Logo Display Size */}
          <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
            Logo Display Size on Payslip
            <select
              value={logoDisplaySize}
              onChange={(e) => setLogoDisplaySize(Number(e.target.value))}
              style={selectStyle}
            >
              <option value={140}>Small (140px)</option>
              <option value={170}>Medium (170px — Standard)</option>
              <option value={200}>Large (200px)</option>
              <option value={230}>Extra Large (230px)</option>
            </select>
          </label>

          {/* Payslip Month */}
          <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
            Payslip Month
            <input
              type="text"
              value={payslipMonthText}
              onChange={(e) => setPayslipMonthText(e.target.value)}
              style={inputStyle}
              placeholder="e.g. July - 2026"
            />
          </label>

          {/* Title Text */}
          <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
            Payslip Title Prefix
            <input
              type="text"
              value={payslipTitleText}
              onChange={(e) => setPayslipTitleText(e.target.value)}
              style={inputStyle}
              placeholder="Payslip for the month of"
            />
          </label>
        </div>

        {/* Color Theme */}
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--label)", marginBottom: 8 }}>
            Color Theme
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ fontSize: 12, color: "var(--subtext)", display: "flex", flexDirection: "column", gap: 6 }}>
              Table Header Color
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={tableHeaderColor}
                  onChange={(e) => setTableHeaderColor(e.target.value)}
                  style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={tableHeaderColor}
                  onChange={(e) => setTableHeaderColor(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </label>

            <label style={{ fontSize: 12, color: "var(--subtext)", display: "flex", flexDirection: "column", gap: 6 }}>
              Net Pay Highlight Color
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={netPayColor}
                  onChange={(e) => setNetPayColor(e.target.value)}
                  style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={netPayColor}
                  onChange={(e) => setNetPayColor(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </label>

            <label style={{ fontSize: 12, color: "var(--subtext)", display: "flex", flexDirection: "column", gap: 6 }}>
              Table Border Color
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="color"
                  value={tableBorderColor}
                  onChange={(e) => setTableBorderColor(e.target.value)}
                  style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
                />
                <input
                  type="text"
                  value={tableBorderColor}
                  onChange={(e) => setTableBorderColor(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Section Visibility */}
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--label)", marginBottom: 8 }}>
            Section Visibility
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { key: "info", label: "Employee / Bank Details" },
              { key: "attendance", label: "Attendance Details" },
              { key: "salary", label: "Earnings & Deductions" },
              { key: "leave", label: "Leave Balance" },
              { key: "net", label: "Net Pay" },
              { key: "words", label: "Amount in Words" },
              { key: "note", label: "Generated Note" },
            ].map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={payslipVisibility[key]}
                  onChange={(e) =>
                    setPayslipVisibility((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  style={{ accentColor: "var(--primary)" }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Theme Customizer (Rich Dropdowns) ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: 22,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Sparkles size={18} style={{ color: "var(--primary)" }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Payslip Theme & Layout Settings
          </p>
        </div>

        {!blueprint ? (
          <p style={{ fontSize: 13, color: "var(--subtext)" }}>
            No payslip template found. Click "New" to create one.
          </p>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--subtext)", marginBottom: 16 }}>
              Typography, color accents, page size, and orientation are reflected
              in real time in the live preview and printed payslips.
            </div>

            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--subtext)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Payslip Dedicated Logo
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <div
                onClick={() => themeLogoShown && setLightboxUrl(themeLogoShown)}
                style={{
                  width: 90,
                  height: 60,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: themeLogoShown ? "pointer" : "default",
                  overflow: "hidden",
                }}
                title={themeLogoShown ? "Click to view full size" : "No theme logo"}
              >
                {themeLogoShown ? (
                  <img
                    src={themeLogoShown}
                    alt="theme logo"
                    style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }}
                  />
                ) : (
                  <span style={{ fontSize: 11, color: "var(--subtext)" }}>No logo</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <label
                  style={{
                    padding: "8px 14px",
                    background: "var(--primary)",
                    color: "#fff",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Upload size={13} />
                  {themeLogoShown ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) handleThemeLogo(f);
                    }}
                  />
                </label>
                {themeLogoShown && (
                  <>
                    <button
                      onClick={() => setLightboxUrl(themeLogoShown)}
                      style={{
                        padding: "8px 12px",
                        background: "var(--card)",
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Eye size={13} /> View
                    </button>
                    <button
                      onClick={() => {
                        setLogoPreviewUrl(null);
                        mutateBlueprint((bp) => {
                          const t2 = { ...bp.theme };
                          delete t2.logo;
                          bp.theme = t2;
                        });
                      }}
                      style={{
                        padding: "8px 12px",
                        background: "transparent",
                        color: "var(--red, #ef4444)",
                        border: "1px solid var(--red, #ef4444)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Controls Grid with Rich Dropdowns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {/* Font Dropdown */}
              <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
                Font Family
                <select
                  value={theme.font || "Inter, sans-serif"}
                  onChange={setThemeField("font")}
                  style={selectStyle}
                >
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Page Size Dropdown */}
              <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
                Page Size
                <select
                  value={theme.pageSize || "A4"}
                  onChange={setThemeField("pageSize")}
                  style={selectStyle}
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Orientation Dropdown */}
              <label style={{ fontSize: 12.5, color: "var(--label)", display: "flex", flexDirection: "column", gap: 6 }}>
                Page Orientation
                <select
                  value={theme.orientation || "portrait"}
                  onChange={setThemeField("orientation")}
                  style={selectStyle}
                >
                  {ORIENTATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Accent Color Pickers */}
              <ThemeField
                label="Primary Brand Color"
                value={theme.primaryColor || "#0f766e"}
                onChange={setThemeField("primaryColor")}
                type="color"
              />
              <ThemeField
                label="Dark Background Accent"
                value={theme.secondaryColor || "#0f172a"}
                onChange={setThemeField("secondaryColor")}
                type="color"
              />
              <ThemeField
                label="Highlights Accent"
                value={theme.accentColor || "#0d9488"}
                onChange={setThemeField("accentColor")}
                type="color"
              />

              {/* Margin Inputs */}
              <ThemeField
                label="Left Margin (px)"
                value={theme.margins?.left ?? 32}
                onChange={setMargin("left")}
                type="number"
              />
              <ThemeField
                label="Top Margin (px)"
                value={theme.margins?.top ?? 32}
                onChange={setMargin("top")}
                type="number"
              />
            </div>

            {themeMsg && (
              <div
                style={{
                  marginTop: 14,
                  padding: "9px 14px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: themeMsg.ok
                    ? "var(--green-light,#f0fdf4)"
                    : "var(--red-light)",
                  color: themeMsg.ok ? "#16a34a" : "var(--red)",
                  border: `1px solid ${themeMsg.ok ? "#bbf7d0" : "var(--red)"}`,
                }}
              >
                {themeMsg.text}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button
                onClick={handleThemeSave}
                disabled={themeBusy}
                style={{
                  padding: "10px 22px",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: themeBusy ? "not-allowed" : "pointer",
                  opacity: themeBusy ? 0.7 : 1,
                }}
              >
                {themeBusy ? "Saving…" : "Save Theme Preferences"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Live Interactive Preview Card with Premium Dark Template ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: 22,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FileText size={18} style={{ color: "var(--primary)" }} />
              Live Interactive Payslip Preview
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--subtext)",
                margin: "3px 0 0",
              }}
            >
              Renders with live employee numbers, statutory withholdings, and real-time words conversion.
            </p>
          </div>

          {/* Action Toolbar: Employee Selector, Month, and Print Button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Employee Selector Dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={14} style={{ color: "var(--subtext)" }} />
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                style={{
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  maxWidth: 260,
                }}
              >
                {employees.length === 0 ? (
                  <option value="">Sample Employee (Amit Verma)</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode || emp.id})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Month / Year */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select
                value={previewMonth}
                onChange={(e) => setPreviewMonth(Number(e.target.value))}
                style={{
                  height: 34,
                  padding: "0 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 12,
                }}
              >
                {[
                  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={previewYear}
                onChange={(e) => setPreviewYear(Number(e.target.value))}
                style={{
                  height: 34,
                  padding: "0 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 12,
                }}
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Template Format Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                id="template-format-selector"
                value={templateFormat}
                onChange={(e) => setTemplateFormat(e.target.value)}
                style={{
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <option value="classic-table">Classic Table (Client Focus Style)</option>
                <option value="corporate">Corporate Classic</option>
                <option value="executive">Executive Formal</option>
                <option value="modern-cards">Modern Cards</option>
              </select>
            </div>

            {/* Print / Save PDF Button */}
            <button
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Printer size={14} /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* ── PAYSLIP TEMPLATE DISPLAY ── */}
        {templateFormat !== "modern-cards" ? (
          <div
            id="printable-classic-payslip"
            style={{
              overflowX: "auto",
              paddingBottom: 24,
            }}
          >
            <ClassicTablePayslip
              company={{
                name: form?.companyName,
                address: form?.address,
                logoUrl: logoUrl,
              }}
              logoSize={logoDisplaySize}
              employee={currentEmployee}
              payroll={{
                month:
                  payslipMonthText ||
                  `${[
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                  ][previewMonth - 1]} - ${previewYear}`,
                title: payslipTitleText || "Payslip for the month of",
                workingDays: 31,
                presentDays: 22,
                lopDays: 0,
                netPaidDays: 31,
                earnings: [
                  { name: "BASIC", amount: Math.round(computedSalary?.basic || 0) },
                  { name: "HRA", amount: Math.round(computedSalary?.hra || 0) },
                  { name: "SPECIAL ALLOWANCE", amount: Math.round(computedSalary?.specialAllowance || 0) },
                  { name: "OTHER ALLOWANCE", amount: Math.round((computedSalary?.conveyance || 0) + (computedSalary?.medical || 0)) },
                ],
                deductions: [
                  { name: "PF", amount: Math.round(computedSalary?.epf || 0) },
                  { name: "PROF TAX", amount: Math.round(computedSalary?.pt || 0) },
                  { name: "TDS / TAX", amount: Math.round(computedSalary?.tds || 0) },
                ],
                netPay: Math.round(computedSalary?.netPay || 0),
                netPayInWords: computedSalary?.netPayWords || "",
                leaveBalance: "03",
              }}
              theme={{
                primaryColor: tableHeaderColor,
                accentColor: netPayColor,
                tableBorderColor: tableBorderColor,
              }}
              visibility={payslipVisibility}
              onLogoClick={() => logoUploadInputRef.current?.click()}
            />
          </div>
        ) : (
          <div
            id="printable-payslip-voucher"
            style={{
              background: "#ffffff", // Printable light theme
              color: "#0f172a",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
              padding: "20px 24px",
              fontFamily: theme.font || "Inter, sans-serif",
              maxWidth: 820,
              margin: "0 auto",
            }}
          >
          {/* Header Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 12,
              paddingBottom: 14,
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {logoUrl || themeLogoShown ? (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    background: "#ffffff",
                    borderRadius: 10,
                    padding: 5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <img
                    src={assetUrl(logoUrl) || themeLogoShown}
                    alt="Company Logo"
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    background: "linear-gradient(135deg, #0d9488, #0f766e)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: 1,
                  }}
                >
                  PT
                </div>
              )}

              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 800,
                    color: "#0f172a",
                    letterSpacing: "0.2px",
                  }}
                >
                  {form.companyName || "PT Technologies Private Limited"}
                </h2>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "#0f766e", // Teal accent
                    marginTop: 2,
                  }}
                >
                  {form.tagline || "PT | People | Process | Progress"}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "#64748b",
                    marginTop: 2,
                    maxWidth: 420,
                    lineHeight: 1.3,
                  }}
                >
                  {form.address || "Floor 4, Cyber City Phase 2, Pune, Maharashtra 411014"}
                </div>
              </div>
            </div>

            {/* Payslip Ref & Status */}
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Salary Payslip
              </div>
              <div style={{ fontSize: 12.5, color: "#334155", fontWeight: 600, marginTop: 2 }}>
                {[
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December",
                ][previewMonth - 1]}{" "}
                {previewYear}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "#64748b",
                  fontFamily: "monospace",
                  marginTop: 4,
                }}
              >
                Ref: PS-{previewYear}-{String(previewMonth).padStart(2, "0")}-
                {currentEmployee.employeeCode || currentEmployee.id}
              </div>
              <div style={{ marginTop: 6 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    borderRadius: 99,
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    color: "#047857",
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  <ShieldCheck size={12} /> Status: Paid
                </span>
              </div>
            </div>
          </div>

          {/* 3-Card Grid for Employee Information */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              marginTop: 14,
              marginBottom: 14,
            }}
          >
            {/* Card 1: Identification */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#0f766e",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Employee Identification
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                {currentEmployee.firstName} {currentEmployee.lastName}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#64748b",
                  fontFamily: "monospace",
                  marginTop: 2,
                }}
              >
                ID: {currentEmployee.employeeCode || currentEmployee.id}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                PAN: <strong style={{ color: "#0f172a" }}>{currentEmployee.panNumber || "ABCDE1234F"}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                UAN: <strong style={{ color: "#0f172a" }}>{currentEmployee.uanNumber || "101298457890"}</strong>
              </div>
            </div>

            {/* Card 2: Role & Department */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#0f766e",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Position &amp; Division
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                {currentEmployee.designation?.title ||
                  currentEmployee.designation ||
                  "Senior Engineer"}
              </div>
              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                {currentEmployee.department?.name ||
                  currentEmployee.department ||
                  "Engineering"}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                Tier: <strong style={{ color: "#0f172a" }}>{currentEmployee.skillType || "Skilled"}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Location: <strong style={{ color: "#0f172a" }}>{currentEmployee.location?.name || computedSalary.stateName}</strong>
              </div>
            </div>

            {/* Card 3: Bank & Attendance */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#0f766e",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Payment &amp; Attendance
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                Mode: <strong style={{ color: "#0f172a" }}>Direct Bank Transfer</strong>
              </div>
              <div style={{ fontSize: 11.5, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                A/C: {currentEmployee.bankAccount ? `•••• •••• ${currentEmployee.bankAccount.slice(-4)}` : "•••• •••• 8842"}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                Working Days: <strong style={{ color: "#0f172a" }}>26</strong> | Present: <strong style={{ color: "#047857" }}>25</strong>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Paid Leave: <strong style={{ color: "#0369a1" }}>1 Day</strong> | LOP: <strong style={{ color: "#64748b" }}>0</strong>
              </div>
            </div>
          </div>

          {/* ── 2-Column Earnings & Deductions Breakdown ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            {/* Left Card: EARNINGS */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: "#0369a1",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    borderBottom: "1px solid #e2e8f0",
                    paddingBottom: 6,
                    marginBottom: 10,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Earnings Breakdown</span>
                  <span>Amount</span>
                </div>

                {/* Fixed Pay Group */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>
                    Fixed Pay
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>Basic Salary</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.basic || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>House Rent Allowance (HRA)</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.hra || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>Conveyance Allowance</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.conveyance || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>Special Allowance</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.specialAllowance || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Benefits & Reimbursements */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>
                    Benefits &amp; Reimbursements
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>Medical Allowance</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.medical || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Variable Pay */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 5 }}>
                    Variable &amp; Production
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                    <span style={{ color: "#334155" }}>Weekly Off Pay</span>
                    <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                      ₹{(computedSalary?.weeklyOffPay || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {(computedSalary?.overtime || 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 12 }}>
                      <span style={{ color: "#334155" }}>Overtime / Shift Incentive</span>
                      <span style={{ color: "#047857", fontWeight: 700, fontFamily: "monospace" }}>
                        ₹{(computedSalary?.overtime || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Earnings Highlight Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 8,
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>
                  Total Gross Earnings
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#047857", fontFamily: "monospace" }}>
                  ₹{(computedSalary?.totalGrossEarnings || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Right Card: DEDUCTIONS */}
            <div
              style={{
                background: "#1e293b",
                borderRadius: 12,
                border: "1px solid #334155",
                padding: 18,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#f87171",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    borderBottom: "1px solid #334155",
                    paddingBottom: 8,
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Deductions Breakdown</span>
                  <span>Amount</span>
                </div>

                {/* Statutory Deductions Group */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>
                    Statutory Deductions
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>Provident Fund (EPF)</span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                      −₹{(computedSalary?.epf || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>
                      Professional Tax ({computedSalary?.stateName || ""})
                    </span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                      {(computedSalary?.pt || 0) > 0 ? `−₹${(computedSalary?.pt || 0).toLocaleString("en-IN")}` : "₹0 (Exempt)"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>Income Tax (TDS)</span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                      −₹{(computedSalary?.tds || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Other Deductions */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>
                    Other Deductions & Welfare
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>ESI (Employee State Insurance)</span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                      {(computedSalary?.esi || 0) > 0 ? `−₹${(computedSalary?.esi || 0).toLocaleString("en-IN")}` : "₹0 (Exempt)"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>
                      Labour Welfare Fund (LWF)
                    </span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>
                      −₹{computedSalary?.lwf ?? 0}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ color: "#e2e8f0" }}>Leave Deduction (Unpaid days)</span>
                    <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                      ₹0
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Deductions Highlight Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>
                  Total Deductions
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#f87171", fontFamily: "monospace" }}>
                  −₹{(computedSalary?.totalDeductions || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* ── Net Take-Home Pay Focal Banner ── */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
              borderRadius: 12,
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
              boxShadow: "0 10px 15px -3px rgba(13, 148, 136, 0.3)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#ccfbf1",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Net Take-Home Pay
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "#ffffff",
                  marginTop: 3,
                }}
              >
                {computedSalary?.netPayWords || ""}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
                Directly disbursed into employee's designated salary account
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#ffffff",
                  fontFamily: "monospace",
                  letterSpacing: "0.5px",
                }}
              >
                ₹{(computedSalary?.netPay || 0).toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Legal / Notice Footer */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid #334155",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 11,
              color: "#94a3b8",
            }}
          >
            <div>
              <strong>Note:</strong> This is a computer-generated payslip and does
              not require a physical seal or signature.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Generated: {new Date().toLocaleDateString("en-IN")}</span>
              <span>•</span>
              <span
                style={{
                  color: "#38bdf8",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Strictly Confidential
              </span>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Embedded print stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .classic-payslip-paper, .classic-payslip-paper *,
          #printable-payslip-voucher, #printable-payslip-voucher * {
            visibility: visible !important;
          }
          .classic-payslip-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 30px !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-payslip-voucher {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            border: none !important;
            box-shadow: none !important;
            background: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function PayslipBranding() {
  return (
    <MainLayout>
      <PayslipBrandingPanel />
    </MainLayout>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function ThemeField({ label, value, onChange, type = "text" }) {
  return (
    <label
      style={{
        fontSize: 12.5,
        color: "var(--label)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {label}
      <input
        type={type}
        value={value ?? ""}
        onChange={onChange}
        style={{ ...inputStyle, height: 38 }}
      />
    </label>
  );
}