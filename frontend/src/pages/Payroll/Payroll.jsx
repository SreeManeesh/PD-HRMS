/**
 * Payroll Page — Module 7
 * Slide-button sections: Annual Payroll, Monthly Payroll, Employee Payroll, My Payslips.
 *
 * Annual Payroll  : periods (runs) table like before — click a period to reveal
 *                   that month's per-employee payroll details right there.
 * Monthly Payroll : day-by-day calculations for the selected month — click any
 *                   day to open that day's employees (like monthly payroll).
 * Employee Payroll: search bar to pick an employee; defaults to the manager.
 */

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import { Play, FileText, Users, Wallet, CalendarRange, Search, ChevronDown, ChevronRight } from "lucide-react";
import PayslipPreviewModal from "../../components/payslip/PayslipPreviewModal.jsx";
import { PayslipDistributionPanel } from "../PayslipDistribution/PayslipDistribution.jsx";
import { PayslipDesignerPanel } from "../PayslipDesigner/PayslipDesigner.jsx";
import { PayslipBrandingPanel } from "../PayslipBranding/PayslipBranding.jsx";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import ConfirmDialog from "../../components/shared/ConfirmDialog.jsx";
import { getPayrollRuns, getPayrollYears, getPayslips, getRunPayslips, createPayrollRun, runPayroll, approvePayrollRun, getEmployeePayrollSummary, getEmployeePayrollSummaries } from "../../services/payrollService.js";
import { getTaxSelection, setTaxSelection } from "../../services/payslipDesignerService.js";
import { getMyAttendance } from "../../services/attendanceService.js";
import { getEmployees } from "../../services/employeeService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const payrollStatusMeta = {
  Draft: { label: "Draft", color: "#64748b", bg: "#f8fafc" },
  Processing: { label: "Processing", color: "#d97706", bg: "#fffbeb" },
  Approved: { label: "Approved", color: "#0284c7", bg: "#f0f9ff" },
  Paid: { label: "Paid", color: "#16a34a", bg: "#f0fdf4" },
  Failed: { label: "Failed", color: "#dc2626", bg: "#fef2f2" },
};

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

function SlideTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--border)", marginBottom: "20px", flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: "10px 20px", background: "none", border: "none",
            borderBottom: active === t.id ? "2px solid var(--primary)" : "2px solid transparent",
            color: active === t.id ? "var(--primary)" : "var(--subtext)",
            fontWeight: active === t.id ? 700 : 500, fontSize: "13.5px", cursor: "pointer", marginBottom: "-1px",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
        {Icon && <Icon size={17} style={{ color: "var(--primary)" }} />} {title}
      </h2>
      {subtitle && <span style={{ fontSize: "12.5px", color: "var(--subtext)" }}>{subtitle}</span>}
    </div>
  );
}

function Stat({ label, value, color = "var(--text)", mono = true }) {
  return (
    <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 16px", flex: "1 1 140px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>{label}</p>
      <p style={{ fontSize: "19px", fontWeight: 800, color, fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.2 }}>{value}</p>
    </div>
  );
}

function Select({ value, onChange, children, width = "auto" }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ height: "38px", padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)", background: "var(--card)", outline: "none", cursor: "pointer", width }}
    >
      {children}
    </select>
  );
}

function MonthYearToolbar({ month, year, onMonth, onYear, years, search, onSearch, searchPlaceholder, searchSlot }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px", padding: "14px 16px", background: "var(--background)", borderRadius: "var(--radius)" }}>
      <Select value={month} onChange={(e) => onMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select value={year} onChange={(e) => onYear(Number(e.target.value))}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--label)" }}>{MONTHS_FULL[month - 1]} {year}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", minWidth: "240px", flex: "1 1 260px", position: "relative" }}>
        {searchSlot ? (
          searchSlot
        ) : (
          <>
            <Search size={15} style={{ color: "var(--subtext)" }} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder || "Search…"}
              style={{ flex: 1, height: "38px", padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)", background: "var(--card)", outline: "none" }}
            />
          </>
        )}
      </div>
    </div>
  );
}

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
  const matches = employees.filter((emp) =>
    !q || (emp.id || "").toLowerCase().includes(q) || `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(q)
  );

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1 }}>
      <Search size={15} style={{ color: "var(--subtext)", position: "absolute", left: "12px", top: "12px", pointerEvents: "none" }} />
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search employee by name or ID…"
        style={{ width: "100%", height: "38px", padding: "0 40px 0 34px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)", background: "var(--card)", outline: "none" }}
      />
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Toggle employee list"
        style={{ position: "absolute", right: "4px", top: "4px", width: "30px", height: "30px", background: "none", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--subtext)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "44px", left: 0, right: 0, zIndex: 30, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)", maxHeight: "300px", overflowY: "auto" }}>
          {matches.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "13px", color: "var(--subtext)" }}>No employee found.</div>
          ) : (
            matches.map((emp) => (
              <button key={emp.id} type="button" onClick={() => { onSelect(emp.id); onChange(""); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 16px", background: emp.id === value ? "var(--primary-light)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontSize: "13.5px", color: "var(--text)" }}>
                <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                  {(emp.firstName?.[0] || "?")}{(emp.lastName?.[0] || "")}
                </span>
                <span style={{ fontWeight: 600, flex: 1 }}>{emp.firstName} {emp.lastName}</span>
                <span style={{ color: "var(--subtext)", fontFamily: "monospace", fontSize: "12px" }}>{emp.id} · {emp.designation || "—"}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Payroll() {
  const { user, permissions } = useAuth();
  const toast = useToast();
  const now = new Date();
  const isStaff = user.role !== "EMPLOYEE";
  const canApprove = Array.isArray(permissions) && permissions.includes("payroll:approve");
  const [runs, setRuns]         = useState([]);
  const [dataYears, setDataYears] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [taxRegime, setTaxRegime] = useState("");
  const [savingRegime, setSavingRegime] = useState(false);
  const [regimeMsg, setRegimeMsg] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeRun, setActiveRun] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [approveRun, setApproveRun] = useState(null); // run awaiting four-eyes approve
  const [approving, setApproving] = useState(false);
  const [previewId, setPreviewId] = useState(null); // payslip id shown in the payslip preview modal
  const [activeTab, setActiveTab] = useState("annual");
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [year, setYear]         = useState(now.getFullYear());
  const [annualSearch, setAnnualSearch] = useState("");
  const [monthlySearch, setMonthlySearch] = useState("");
  // Bumped after a Run/Approve so the monthly batched summaries + payroll totals
  // re-fetch reflecting the newly processed (or paid) run.
  const [refreshKey, setRefreshKey] = useState(0);

  // Annual: expanded period's per-employee payroll rows.
  const [expandedRun, setExpandedRun] = useState(null); // { month, year }
  const [yearRows, setYearRows] = useState([]);
  const [yearLoading, setYearLoading] = useState(false);
  const [yearError, setYearError] = useState("");

  // Monthly: day-by-day attendance + employees for a selected day.
  const [dayMap, setDayMap] = useState({});
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState("");
  const [selectedDay, setSelectedDay] = useState(null); // ISO date
  const [monthPayMap, setMonthPayMap] = useState({});    // empId -> monthly summary

  // Employee payroll: search + default to manager.
  const [empSearch, setEmpSearch] = useState("");
  const [activeEmpId, setActiveEmpId] = useState("");

  useEffect(() => {
    setLoading(true);
    // Each call resolves independently so a failure (e.g. employees list) can
    // never blank the whole dashboard — Employee Payroll keeps working even if
    // runs or payslips error out and vice versa.
    Promise.all([
      getPayrollRuns().catch(() => ({ data: [] })),
      getPayrollYears().catch(() => ({ data: [] })),
      getPayslips(user.id).catch(() => ({ data: [] })),
      getEmployees({ limit: 5000 }).catch(() => ({ data: [] })),
    ])
      .then(([runRes, yearRes, slipRes, empRes]) => {
        setRuns(runRes.data);
        setDataYears(yearRes.data || []);
        setPayslips(slipRes.data);
        const empList = empRes.data || [];
        setEmployees(empList);
        const first = runRes.data?.[0];
        if (first) { setMonth(first.month); setYear(first.year); }
        // Employees always see their OWN payroll; staff default to their manager.
        if (!isStaff) {
          setActiveEmpId((cur) => cur || user.id);
        } else {
          const me = empList.find((e) => e.id === user.id);
          const managerId = (me && me.managerId) || user.id;
          setActiveEmpId((cur) => cur || managerId);
        }
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  // Load the employee's saved tax regime (OLD/NEW) for the payslip year.
  useEffect(() => {
    if (!user.id) return;
    getTaxSelection({ employeeId: user.id, year: taxYear })
      .then((res) => setTaxRegime(res.data?.regime || ""))
      .catch(() => setTaxRegime(""));
  }, [user.id, taxYear]);

  const handleSaveRegime = async (regime) => {
    setSavingRegime(true);
    setRegimeMsg(null);
    try {
      await setTaxSelection({ employeeId: user.id, regime, year: taxYear });
      setTaxRegime(regime);
      setRegimeMsg({ ok: true, text: `Tax regime set to ${regime === "OLD" ? "Old" : "New"} for FY ${taxYear}.` });
    } catch (e) {
      setRegimeMsg({ ok: false, text: e.message || "Could not update tax regime" });
    } finally {
      setSavingRegime(false);
    }
  };

  const handleRunPayroll = async () => {
    if (!activeRun) return;
    setRunning(true);
    try {
      // Run from the Monthly tab may target a run that doesn't exist yet —
      // create the Draft run for that month, then process it in one action.
      let runId = activeRun.id;
      if (!runId) {
        const created = await createPayrollRun(month, year);
        runId = created.data?.id;
        if (!runId) throw new Error("Could not create the payroll run for this month");
        setRuns((prev) => [...prev, created.data]);
      }
      await runPayroll(runId);
      // Re-fetch runs so the annual table + monthly header reflect the fresh
      // Processing status & totals instead of a locally-stamped stub.
      const res = await getPayrollRuns().catch(() => ({ data: [] }));
      setRuns(res.data || []);
      setRefreshKey((k) => k + 1);
      setRegimeMsg({ ok: true, text: `Payroll run ${activeRun.period} processed for ${activeRun.totalEmployees || 0} employees.` });
      toast(`Payroll processed for ${activeRun.period} — awaiting approval`);
    } catch (e) {
      setRegimeMsg({ ok: false, text: e.response?.data?.message || e.message || "Could not process the payroll run" });
    } finally {
      setRunning(false);
      setShowConfirm(false);
      setActiveRun(null);
    }
  };

  const handleApprovePayroll = async () => {
    if (!approveRun) return;
    setApproving(true);
    try {
      await approvePayrollRun(approveRun.id);
      setRuns((prev) => prev.map((r) => (r.id === approveRun.id ? { ...r, status: "Paid" } : r)));
      setApproveRun(null);
      toast(`Payroll run ${approveRun.period} approved & paid`);
    } catch (e) {
      setRegimeMsg({ ok: false, text: e.response?.data?.message || e.message || "Could not approve payroll run" });
    } finally {
      setApproving(false);
    }
  };

  const YEARS = [...new Set([...runs.map((r) => r.year), ...dataYears, now.getFullYear(), year])].sort((a, b) => b - a);

  // ═══ Annual Payroll: load per-employee rows when a period is expanded ═══
  useEffect(() => {
    if (!expandedRun) { setYearRows([]); return; }
    setYearLoading(true);
    setYearError("");
    const { month: m, year: y } = expandedRun;
    const runStatus = runs.find((r) => r.month === m && r.year === y)?.status;

    // Processed runs (Processing/Paid) use the STORED payslips — those are the
    // authoritative amounts actually generated/paid. Only Draft runs (no slips
    // yet) are computed live from attendance.
    if (runStatus && runStatus !== "Draft") {
      getRunPayslips(`PR-${y}-${pad2(m)}`)
        .then((res) => {
          const slips = res.data || [];
          const byEmp = {};
          slips.forEach((slip) => {
            const att = slip.attendance || {};
            byEmp[slip.employeeId] = {
              employeeId: slip.employeeId,
              employeeName: slip.employeeName,
              workingDays: att.workingDays ?? 0,
              leaveDays: att.unpaidLeaveDays ?? 0,
              presentDays: att.presentDays ?? 0,
              // Full monthly package gross + leave included in deductions — the
              // same figures the summary panel shows (gross − total = net pay).
              gross: slip.gross ?? (slip.earnings?.total ?? 0),
              deductions: { total: (slip.deductions?.total ?? 0) + (slip.leaveDeduction ?? 0) },
              netPay: slip.netPay ?? 0,
              status: runStatus,
            };
          });
          // Include every active employee (complete total); anyone without a
          // stored slip shows a zero/Not Processed row so none are hidden.
          const rows = employees.map((emp) => byEmp[emp.id] || {
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
            workingDays: 0,
            leaveDays: 0,
            presentDays: 0,
            gross: 0,
            deductions: { total: 0 },
            netPay: 0,
            status: "Not Processed",
          });
          setYearRows(rows);
        })
        .catch((err) => setYearError(err.message || "Could not load payroll run payslips"))
        .finally(() => setYearLoading(false));
      return;
    }

    if (!employees.length) { setYearLoading(false); setYearRows([]); return; }
    // Draft runs have no stored slips yet — fetch all summaries in ONE batched
    // request instead of N per-employee calls, then line them up with the
    // known employee roster (anyone missing falls back to a zero row).
    getEmployeePayrollSummaries(m, y)
      .then((res) => {
        const rows = (res.data || []).map((summary) => ({
          ...summary,
          employeeId: summary.employeeId,
        }));
        const byCode = Object.fromEntries(rows.map((r) => [r.employeeId, r]));
        const aligned = employees.map((emp) => byCode[emp.id] || {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
          workingDays: 0,
          leaveDays: 0,
          presentDays: 0,
          gross: 0,
          deductions: { total: 0 },
          netPay: 0,
          status: "Not Processed",
        });
        setYearRows(aligned);
      })
      .catch((err) => setYearError(err.message || "Could not load employee details"))
      .finally(() => setYearLoading(false));
  }, [expandedRun, employees, runs, user.id]);

  const expandedPeriod = expandedRun ? `${MONTHS_FULL[expandedRun.month - 1]} ${expandedRun.year}` : "";

  // ═══ Monthly Payroll: aggregate attendance + payroll summaries for the month ═══
  useEffect(() => {
    if (!employees.length) { setDayMap({}); setMonthPayMap({}); return; }
    setDayLoading(true);
    setDayError("");
    setSelectedDay(null);
    // Payroll summaries load in ONE batched request; attendance stays
    // per-employee so the day-grid keeps fresh punch data.
    Promise.all([
      getEmployeePayrollSummaries(month, year).then((res) => res.data || []).catch(() => []),
      Promise.all(employees.map((emp) =>
        getMyAttendance({ employeeId: emp.id, month, year })
          .then((res) => res.data || [])
          .catch(() => [])
      )),
    ])
      .then(([summaries, attByEmp]) => {
        const payByCode = Object.fromEntries((summaries || []).map((s) => [s.employeeId, s]));
        const map = {};
        const payMap = {};
        employees.forEach((emp, i) => {
          const pay = payByCode[emp.id];
          if (pay) payMap[emp.id] = pay;
          (attByEmp[i] || []).forEach((r) => {
            const date = String(r.date).slice(0, 10);
            const slot = map[date] || (map[date] = { present: 0, wfh: 0, late: 0, leave: 0, absent: 0, total: 0, records: [] });
            slot.total += 1;
            const status = r.status || "Present";
            if (status === "Present") slot.present += 1;
            else if (status === "WFH") slot.wfh += 1;
            else if (status === "Late") slot.late += 1;
            else if (status === "Leave") slot.leave += 1;
            else if (status === "Absent") slot.absent += 1;
            // Holiday/Weekend/other statuses are counted in total but not in
            // the present/absent buckets.
            slot.records.push(r);
          });
        });
        setDayMap(map);
        setMonthPayMap(payMap);
      })
      .catch((err) => setDayError(err.message || "Could not load daily attendance"))
      .finally(() => setDayLoading(false));
  }, [employees, month, year, user.id, refreshKey]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayRows = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const date = isoDate(year, month, d);
    const wk = WEEKDAYS[new Date(year, month - 1, d).getDay()];
    const slot = dayMap[date] || { present: 0, wfh: 0, late: 0, leave: 0, absent: 0, total: 0, records: [] };
    return { date, day: d, weekday: wk, ...slot };
  });

  const selectedDayRecords = selectedDay ? (dayMap[selectedDay]?.records || []) : [];

  // Day-wise salary for the selected day: for each tracked employee, derive
  // per-day gross/deductions/net from the monthly summary (prorated by working
  // days) and join with that day's attendance record.
  const ATTENDANCE_META = {
    Present: { label: "Present", color: "#16a34a", bg: "#f0fdf4" },
    WFH:     { label: "WFH",     color: "#0284c7", bg: "#f0f9ff" },
    Late:    { label: "Late",    color: "#d97706", bg: "#fffbeb" },
    Leave:   { label: "Leave",   color: "#7c3aed", bg: "#f5f3ff" },
    Absent:  { label: "Absent",  color: "#dc2626", bg: "#fef2f2" },
  };
  const selectedDayRows = selectedDay
    ? employees.map((emp) => {
        const summary = monthPayMap[emp.id];
        const rec = selectedDayRecords.find((r) => r.employeeId === emp.id) || null;
        const workingDays = summary?.workingDays ?? 1;
        const dayGross = summary ? Math.round(summary.gross / workingDays) : null;
        const dayDeductions = summary ? Math.round(summary.deductions.total / workingDays) : null;
        const dayNet = summary && dayGross != null && dayDeductions != null ? dayGross - dayDeductions : null;
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
          status: rec ? rec.status : null,
          checkIn: rec?.checkIn || "—",
          checkOut: rec?.checkOut || "—",
          hoursWorked: rec?.hoursWorked || 0,
          dayGross,
          dayDeductions,
          dayNet,
        };
      })
    : [];

  const monthlyQuery = monthlySearch.trim().toLowerCase();

  const filteredDayEmpRows = selectedDayRows.filter((r) => {
    const q = monthlyQuery;
    return !q || (r.employeeName || "").toLowerCase().includes(q) || (r.employeeId || "").toLowerCase().includes(q);
  });

  const annualQuery = annualSearch.trim().toLowerCase();
  const annualEmpVisible = yearRows.filter((row) =>
    !annualQuery ||
    (row.employeeName || "").toLowerCase().includes(annualQuery) ||
    (row.employeeId || "").toLowerCase().includes(annualQuery)
  );

  const filteredDayRows = dayRows.filter((r) =>
    !monthlyQuery ||
    r.date.includes(monthlyQuery) ||
    r.weekday.toLowerCase().includes(monthlyQuery)
  );

  if (loading) return <MainLayout><Spinner /></MainLayout>;

  // Employees only see Employee Payroll + My Payslips; admin/HR/manager see all.
  const tabs = isStaff
    ? [
        { id: "annual",    label: "Annual Payroll"   },
        { id: "monthly",   label: "Monthly Payroll"  },
        { id: "employee",  label: "Employee Payroll" },
        { id: "payslips",  label: "My Payslips"      },
        { id: "distribution", label: "Payslip Distribution" },
        { id: "designer",  label: "Nesting Manager" },
        { id: "branding",  label: "Payslip Branding" },
      ]
    : [
        { id: "employee",  label: "Employee Payroll" },
        { id: "payslips",  label: "My Payslips"      },
];
  const effectiveTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id || "employee";

  return (
    <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "26px" }}>
        <PageHeader title="Payroll" subtitle="Annual payroll, monthly payroll, per-employee payroll and payslips" />

        <SlideTabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} />

        {/* ═══ Annual Payroll ═══ */}
        {effectiveTab === "annual" && (
          <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "20px" }}>
            <SectionTitle icon={CalendarRange} title="Annual Payroll" subtitle="Pick a year, then click a month to reveal that month's per-employee payroll" />

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, background: "var(--card)", outline: "none", cursor: "pointer" }}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{ fontSize: 12.5, color: "var(--subtext)" }}>12 months of {year}</span>
              <input value={annualSearch} onChange={(e) => setAnnualSearch(e.target.value)} placeholder="Search employee…"
                style={{ marginLeft: "auto", height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, color: "var(--text)", background: "var(--card)", outline: "none", minWidth: 220 }} />
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["","#","Month","Year","Employees","Net Payroll","Status","Action"].map((h) => (
                      <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, i) => {
                    const mo = i + 1;
                    const run = runs.find((r) => r.year === year && r.month === mo);
                    const meta = run ? (payrollStatusMeta[run.status] || payrollStatusMeta.Draft) : null;
                    const isActive = expandedRun && expandedRun.year === year && expandedRun.month === mo;
                    return (
                      <tr
                        key={m}
                        onClick={() => setExpandedRun((cur) => (cur && cur.year === year && cur.month === mo ? null : { month: mo, year }))}
                        style={{
                          borderBottom: i < MONTHS.length - 1 ? "1px solid var(--border)" : "none",
                          cursor: "pointer",
                          background: isActive ? "var(--primary-light)" : "transparent",
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--background)"; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "13px 18px", width: 24 }}>
                          {isActive ? <ChevronDown size={16} style={{ color: "var(--primary)", verticalAlign: "middle" }} /> : <ChevronRight size={16} style={{ color: "var(--subtext)", verticalAlign: "middle" }} />}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "12.5px", color: "var(--subtext)", fontFamily: "monospace" }}>{String(mo).padStart(2, "0")}</td>
                        <td style={{ padding: "13px 18px", fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{m}</td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--label)" }}>{year}</td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--label)" }}>{run ? run.totalEmployees : "—"}</td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)", fontFamily: "monospace" }}>{run ? fmt(run.netPayroll) : "—"}</td>
                        <td style={{ padding: "13px 18px" }}>
                          {run && meta ? <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} /> : <span style={{ fontSize: 12, color: "var(--subtext)" }}>No run</span>}
                        </td>
<td style={{ padding: "13px 18px" }}>
  {run?.status === "Draft" && (
    <button onClick={(e) => { e.stopPropagation(); setActiveRun(run); setShowConfirm(true); }}
      style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", padding: "4px 10px", cursor: "pointer" }}>Run</button>
  )}
  {run?.status === "Processing" && canApprove && (
    <button onClick={(e) => { e.stopPropagation(); setApproveRun(run); }}
      style={{ fontSize: 11.5, fontWeight: 700, color: "var(--amber)", background: "var(--amber-light)", border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", padding: "4px 10px", cursor: "pointer" }}>Approve</button>
  )}
  {run?.status === "Processing" && !canApprove && <span style={{ fontSize: 11.5, color: "var(--subtext)" }}>Awaiting approval</span>}
  {run?.status === "Paid" && (
    <span style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700 }}>Paid</span>
  )}
  {!run && <span style={{ fontSize: 11.5, color: "var(--subtext)" }}>Future</span>}
</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {expandedRun && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18 }}>
                <SectionTitle icon={Users} title={`${expandedPeriod} — Employee Details`} subtitle="Per-employee payroll for the selected month" />
                {(() => {
                  const run = runs.find((r) => r.year === expandedRun.year && r.month === expandedRun.month);
                  if (!run) return null;
                  return (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                      {run.status === "Draft" && (
                        <button onClick={() => { setActiveRun(run); setShowConfirm(true); }}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <Play size={13} /> Run Payroll
                        </button>
                      )}
                      {run.status === "Processing" && canApprove && (
                        <button onClick={() => setApproveRun(run)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", background: "var(--amber-light)", color: "var(--amber)", border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <CheckCircle2 size={13} /> Approve & Pay
                        </button>
                      )}
                      {run.status === "Paid" && (
                        <button onClick={() => setActiveTab("payslips")}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", background: "var(--green-light)", color: "var(--green)", border: "1px solid var(--green)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          <Wallet size={13} /> View Payslips
                        </button>
                      )}
                    </div>
                  );
                })()}

                {yearLoading ? (
                  <Spinner />
                ) : yearError ? (
                  <p style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>{yearError}</p>
                ) : annualEmpVisible.length === 0 ? (
                  <EmptyState title="No employee data" subtitle="No computed payroll found for this period." />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                          {["Employee","Working Days","Present Days","Leave Days","Gross","Deductions","Net Pay","Status"].map((h) => (
                            <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {annualEmpVisible.map((row, idx) => (
                          <tr key={row.employeeId} style={{ borderBottom: idx < annualEmpVisible.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{row.employeeName} <span style={{ color: "var(--subtext)", fontWeight: 500 }}>({row.employeeId})</span></td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)" }}>{row.workingDays ?? "—"}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)" }}>{row.presentDays ?? "—"}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: row.leaveDays > 0 ? "var(--amber)" : "var(--subtext)" }}>{row.leaveDays ?? 0}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)", fontFamily: "monospace" }}>{fmt(row.gross)}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--red)", fontFamily: "monospace" }}>−{fmt(row.deductions?.total)}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", fontWeight: 700, color: "var(--green)", fontFamily: "monospace" }}>{fmt(row.netPay)}</td>
                            <td style={{ padding: "13px 18px" }}>
                              <StatusBadge {...(payrollStatusMeta[row.status] || { label: row.status, color: "#64748b", bg: "#f8fafc" })} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ═══ Monthly Payroll ═══ */}
        {effectiveTab === "monthly" && (
          <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <SectionTitle icon={Wallet} title="Monthly Payroll" subtitle={`Day-by-day calculations for ${MONTHS_FULL[month - 1]} ${year} — click any day to see its employees`} />
              {(() => {
                const run = runs.find((r) => r.month === month && r.year === year);
                if (run?.status === "Draft") {
                  return (
                    <button onClick={() => { setActiveRun({ id: run.id, period: run.period, totalEmployees: run.totalEmployees || employees.length }); setShowConfirm(true); }}
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px", whiteSpace: "nowrap" }}>
                      <Play size={13} /> Run Payroll
                    </button>
                  );
                }
                if (run?.status === "Processing" && canApprove) {
                  return (
                    <button onClick={() => setApproveRun(run)}
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)", background: "var(--amber-light)", border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px", whiteSpace: "nowrap" }}>
                      <CheckCircle2 size={13} /> Approve & Pay
                    </button>
                  );
                }
                if (run?.status === "Processing") {
                  return <StatusBadge label="Awaiting approval" color="#d97706" bg="#fffbeb" />;
                }
                if (run?.status === "Paid") {
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                      <StatusBadge label="Paid" color="#16a34a" bg="#f0fdf4" />
                    </div>
                  );
                }
                if (!run) {
                  return (
                    <button onClick={() => { setActiveRun({ id: null, period: `${MONTHS_FULL[month - 1]} ${year}`, totalEmployees: employees.length }); setShowConfirm(true); }}
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", background: "var(--primary-light)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px", whiteSpace: "nowrap" }}>
                      <Play size={13} /> Run Payroll
                    </button>
                  );
                }
                return null;
              })()}
            </div>

            <MonthYearToolbar
              month={month} year={year} onMonth={setMonth} onYear={setYear} years={YEARS}
              search={monthlySearch} onSearch={setMonthlySearch}
              searchPlaceholder="Search day, weekday…"
            />

            {dayLoading ? (
              <Spinner />
            ) : dayError ? (
              <p style={{ fontSize: "13px", color: "var(--red)", fontWeight: 600 }}>{dayError}</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
                  <Stat label="Working day records" value={`${dayLoading ? 0 : Object.keys(dayMap).length} days`} color="var(--text)" mono={false} />
                  <Stat label="Present" value={dayRows.reduce((s, r) => s + r.present, 0)} color="var(--green)" mono={false} />
                  <Stat label="WFH" value={dayRows.reduce((s, r) => s + r.wfh, 0)} color="var(--primary)" mono={false} />
                  <Stat label="Late" value={dayRows.reduce((s, r) => s + r.late, 0)} color="var(--amber)" mono={false} />
                  <Stat label="Leave" value={dayRows.reduce((s, r) => s + r.leave, 0)} color="var(--purple, #7c3aed)" mono={false} />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                        {["","Date","Day","Present","WFH","Late","Leave","Absent","Total","Action"].map((h) => (
                          <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDayRows.map((row, i) => {
                        const isSelected = selectedDay === row.date;
                        return (
                          <tr key={row.date} onClick={() => setSelectedDay(isSelected ? null : row.date)}
                            style={{
                              borderBottom: i < filteredDayRows.length - 1 ? "1px solid var(--border)" : "none",
                              cursor: "pointer",
                              background: isSelected ? "var(--primary-light)" : "transparent",
                              transition: "background 0.12s",
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--background)"; }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ padding: "13px 18px", width: "24px" }}>
                              {isSelected ? <ChevronDown size={16} style={{ color: "var(--primary)", verticalAlign: "middle" }} /> : <ChevronRight size={16} style={{ color: "var(--subtext)", verticalAlign: "middle" }} />}
                            </td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", fontWeight: 600, color: "var(--text)", fontFamily: "monospace" }}>{row.date}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13px", color: "var(--label)" }}>{row.weekday}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--green)", fontWeight: 600 }}>{row.present}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--primary)", fontWeight: 600 }}>{row.wfh}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--amber)", fontWeight: 600 }}>{row.late}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--purple, #7c3aed)", fontWeight: 600 }}>{row.leave}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--red)", fontWeight: 600 }}>{row.absent}</td>
                            <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)" }}>{row.total}</td>
                            <td style={{ padding: "13px 18px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--primary)", background: "var(--primary-light)", padding: "3px 12px", borderRadius: "99px" }}>{isSelected ? "Viewing" : "View Salary"}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedDay && (
                  <div style={{ marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "18px" }}>
                    <SectionTitle icon={Users} title={`${selectedDay} — Employee Salary`} subtitle="Day-wise salary computed from each employee's monthly summary prorated by working days" />
                    {filteredDayEmpRows.length === 0 ? (
                      <EmptyState title="No employee data" subtitle="No employees or payroll data found for this day." />
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                              {["Employee","ID","Status","Check In","Check Out","Gross","Deductions","Net Pay"].map((h) => (
                                <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDayEmpRows.map((row, idx) => {
                              const meta = row.status ? (ATTENDANCE_META[row.status] || { label: row.status, color: "#64748b", bg: "#f8fafc" }) : null;
                              return (
                                <tr key={row.employeeId} style={{ borderBottom: idx < filteredDayEmpRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{row.employeeName}</td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--subtext)", fontFamily: "monospace" }}>{row.employeeId}</td>
                                  <td style={{ padding: "13px 18px" }}>
                                    {meta ? <StatusBadge {...meta} /> : <span style={{ fontSize: "12px", color: "var(--subtext)" }}>No record</span>}
                                  </td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", color: row.checkIn !== "—" ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>{row.checkIn}</td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", color: row.checkOut !== "—" ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>{row.checkOut}</td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", color: row.dayGross != null ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>{row.dayGross != null ? fmt(row.dayGross) : "—"}</td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", color: row.dayDeductions != null ? "var(--red)" : "var(--subtext)", fontFamily: "monospace" }}>{row.dayDeductions != null ? `−${fmt(row.dayDeductions)}` : "—"}</td>
                                  <td style={{ padding: "13px 18px", fontSize: "13.5px", fontWeight: 700, color: row.dayNet != null ? "var(--green)" : "var(--subtext)", fontFamily: "monospace" }}>{row.dayNet != null ? fmt(row.dayNet) : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ═══ Employee Payroll ═══ */}
        {effectiveTab === "employee" && (
          <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "20px" }}>
            <SectionTitle icon={Users} title="Employee Payroll" subtitle={isStaff ? `Calculated for ${MONTHS_FULL[month - 1]} ${year}` : `Your payroll for ${MONTHS_FULL[month - 1]} ${year}`} />

            {isStaff ? (
              <MonthYearToolbar
                month={month} year={year} onMonth={setMonth} onYear={setYear} years={YEARS}
                searchSlot={
                  <EmployeeSearchBox
                    employees={employees}
                    value={empSearch}
                    onChange={setEmpSearch}
                    onSelect={(id) => setActiveEmpId(id)}
                  />
                }
              />
            ) : (
              <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "6px" }}>
                Showing your own payroll for {MONTHS_FULL[month - 1]} {year}.
              </p>
            )}

            {activeEmpId ? (
              <EmployeeSummary employeeId={activeEmpId} month={month} year={year} />
            ) : (
              <EmptyState title="Select an employee" subtitle="Use the search bar dropdown to choose an employee." />
            )}
          </section>
        )}

        {/* ═══ My Payslips ═══ */}
        {effectiveTab === "payslips" && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <SectionTitle icon={FileText} title="My Payslips" />
            </div>

            {/* Tax regime selection — used when this payslip is generated */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: "16px" }}>
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Tax regime</p>
                <p style={{ fontSize: "12.5px", color: "var(--label)", margin: 0 }}>Choose Old or New regime — the admin uses this when generating your payslip.</p>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  style={{ height: "34px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--card)", outline: "none", cursor: "pointer" }}
                >
                  {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
                {["OLD", "NEW"].map((r) => (
                  <button
                    key={r}
                    disabled={savingRegime}
                    onClick={() => handleSaveRegime(r)}
                    style={{
                      padding: "7px 16px", borderRadius: "99px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
                      background: taxRegime === r ? "var(--primary)" : "var(--card)",
                      color: taxRegime === r ? "#fff" : "var(--text)",
                      border: taxRegime === r ? "1px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  >
                    {r === "OLD" ? "Old Regime" : "New Regime"}
                  </button>
                ))}
              </div>
            </div>
            {regimeMsg && (
              <div style={{ marginBottom: "12px", padding: "9px 14px", borderRadius: "var(--radius-sm)", fontSize: "12.5px", fontWeight: 600, background: regimeMsg.ok ? "var(--green-light,#f0fdf4)" : "var(--red-light)", color: regimeMsg.ok ? "#16a34a" : "var(--red)", border: `1px solid ${regimeMsg.ok ? "#bbf7d0" : "var(--red)"}` }}>
                {regimeMsg.text}
              </div>
            )}
            {payslips.length === 0 ? (
              <EmptyState title="No payslips yet" subtitle="Payslips appear once a payroll run is approved." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {payslips.map((slip) => (
                  <div key={slip.id} style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{slip.period}</h3>
                        <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginTop: "2px" }}>
                          {slip.paidOn
                            ? `Paid on ${new Date(slip.paidOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                            : "Paid"}{slip.paymentMode ? ` · ${slip.paymentMode}` : ""}
                        </p>
                        {slip.leaveDeduction > 0 && (
                          <p style={{ fontSize: "12.5px", color: "var(--amber)", marginTop: "2px" }}>
                            Leave without pay: {slip.attendance?.unpaidLeaveDays ?? 0} day{(slip.attendance?.unpaidLeaveDays ?? 0) === 1 ? "" : "s"} —
                            ₹{new Intl.NumberFormat("en-IN").format(slip.leaveDeduction)} deducted from your full monthly gross of ₹{new Intl.NumberFormat("en-IN").format(slip.gross)}.
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Net Pay</p>
                          <p style={{ fontSize: "24px", fontWeight: 800, color: "var(--green)", fontFamily: "monospace" }}>{fmt(slip.netPay)}</p>
                        </div>
                        <button
                          onClick={() => setPreviewId(slip.id)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                        >
                          <Eye size={13} /> Preview
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      {[
                        { label: "Earnings", entries: slip.earnings, color: "var(--green)", isDeduction: false },
                        { label: "Deductions", entries: slip.deductions, color: "var(--red)", isDeduction: true },
                      ].map(({ label, entries, color, isDeduction }) => (
                        <div key={label} style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "12px" }}>{label}</p>
                          {Object.entries(entries).filter(([k, v]) => k !== "total" && v > 0).map(([key, val]) => (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "var(--label)", textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, " $1").trim()}</span>
                              <span style={{ fontSize: "12.5px", fontWeight: 500, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{fmt(val)}</span>
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid var(--border)", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Total {label}</span>
                            <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{fmt(entries.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ═══ Payslip Distribution ═══ */}
        {effectiveTab === "distribution" && <PayslipDistributionPanel />}

        {/* ═══ Nesting Manager ═══ */}
        {effectiveTab === "designer" && <PayslipDesignerPanel />}

        {/* ═══ Payslip Branding ═══ */}
        {effectiveTab === "branding" && <PayslipBrandingPanel />}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Run Payroll"
        message={`This will process payroll for ${activeRun?.totalEmployees ?? 0} employees for ${activeRun?.period}. This action requires a second approver before disbursement. Proceed?`}
        confirmLabel={running ? "Processing…" : "Yes, Run Payroll"}
        onConfirm={handleRunPayroll}
        onCancel={() => { setShowConfirm(false); setActiveRun(null); }}
      />

      <ConfirmDialog
        isOpen={!!approveRun}
        title="Approve Payroll"
        message={approveRun
          ? `Approve ${approveRun.totalEmployees ?? 0} payslips for ${approveRun.period} (${approveRun.netPayroll ? fmt(approveRun.netPayroll) : ""})? This marks the run as Paid and commits it to disbursement — the final four-eyes sign-off.`
          : ""}
        confirmLabel={approving ? "Approving…" : "Yes, Approve & Pay"}
        onConfirm={handleApprovePayroll}
        onCancel={() => { setApproveRun(null); }}
      />

      {previewId && <PayslipPreviewModal key={previewId} payslipId={previewId} onClose={() => setPreviewId(null)} />}
    </MainLayout>
  );
}

function EmployeeSummary({ employeeId, month, year }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setSummary(null);
    getEmployeePayrollSummary(employeeId, month, year)
      .then((res) => setSummary(res.data))
      .catch((err) => { setError(err.message || "Could not load payroll summary"); setSummary(null); })
      .finally(() => setLoading(false));
  }, [employeeId, month, year]);

  if (loading) return <Spinner />;
  if (error) return <p style={{ fontSize: "13px", color: "var(--red)", fontWeight: 600 }}>{error}</p>;
  if (!summary) return <EmptyState title="No payroll data" subtitle="No summary found for this employee & period." />;

  const earningGroups = summary.earningGroups && summary.earningGroups.length
    ? summary.earningGroups
    : [{ id: null, name: "Earnings", kind: "earning", rows: [] }];
  const deductionGroups = summary.deductionGroups && summary.deductionGroups.length
    ? summary.deductionGroups
    : [{ id: null, name: "Deductions", kind: "deduction", rows: [] }];

  // Flat rows derived from the raw amounts, used when a group has no mapped
  // rows so individual items (PF, PT, IT, HI; basic, HRA…) always render.
  const flatRows = (obj) =>
    Object.entries(obj || {})
      .filter(([k, v]) => k !== "total" && k !== "leaveDeduction" && Number(v) > 0)
      .map(([label, amount]) => ({ label: label.replace(/([A-Z])/g, " $1").trim(), amount: Number(amount) }));
  const fallbackEarnings = flatRows(summary.earnings);
  const fallbackDeductions = flatRows(summary.deductions);

  const earnedTotal = earningGroups.some((g) => g.rows.length)
    ? earningGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.amount, 0), 0)
    : fallbackEarnings.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{summary.employeeName} <span style={{ color: "var(--subtext)", fontWeight: 500 }}>({summary.employeeId})</span></h3>
        <StatusBadge {...(payrollStatusMeta[summary.status] || { label: summary.status, color: "#64748b", bg: "#f8fafc" })} />
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
        <Stat label="Gross" value={fmt(summary.gross)} />
        <Stat label="Annual Package" value={summary.annualSalary ? fmt(summary.annualSalary) : "—"} color="var(--primary)" />
        <Stat label="Present Days" value={`${summary.presentDays ?? 0} / ${summary.workingDays ?? "—"}`} color="var(--green)" />
        <Stat label="Leave Deduction" value={summary.leaveDeduction > 0 ? `−${fmt(summary.leaveDeduction)}` : "—"} color={summary.leaveDeduction > 0 ? "var(--amber)" : "var(--subtext)"} />
        <Stat label="Total Deductions" value={`−${fmt(summary.deductions.total)}`} color="var(--red)" />
        <Stat label="Net Payroll" value={fmt(summary.netPay)} color="var(--green)" />
      </div>

      <p style={{ fontSize: "12px", color: "var(--subtext)", marginBottom: "16px" }}>
        {summary.presentDays > 0 || summary.paidLeaveDays > 0
          ? `${summary.presentDays ?? 0} present + ${summary.paidLeaveDays ?? 0} paid leave of ${summary.workingDays ?? 0} working days were paid this period${summary.leaveDays > 0 ? ` — ${summary.leaveDays} unpaid (LOP) day${summary.leaveDays === 1 ? "" : "s"} deducted ₹${new Intl.NumberFormat("en-IN").format(summary.leaveDeduction)}` : "."}`
          : `No attendance recorded this period — ${summary.workingDays ?? 0} working days, full month salary applies.`}
      </p>

      {/* Earnings / Deductions grouped by the payslip blueprint's nesting */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {[
          { label: "Earnings", groups: earningGroups, color: "var(--green)", isDeduction: false, total: earnedTotal, totalLabel: "Total Earnings", fallback: fallbackEarnings },
          { label: "Deductions", groups: deductionGroups, color: "var(--red)", isDeduction: true, total: summary.deductions.total, totalLabel: "Total Deductions", fallback: fallbackDeductions },
        ].map(({ label, groups, color, isDeduction, total, totalLabel, fallback }) => (
          <div key={label} style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "12px" }}>{label}</p>
            {groups.map((g, gi) => {
              const rows = g.rows.length ? g.rows : fallback;
              return (
                <div key={g.id || g.name} style={gi > 0 ? { marginTop: "14px" } : undefined}>
                  <p style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text)", opacity: 0.85, marginBottom: "6px" }}>{g.name}</p>
                  {rows.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--subtext)" }}>No {label.toLowerCase()} in this period.</p>
                  ) : (
                    rows.map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "12.5px", color: "var(--label)" }}>{row.label}</span>
                        <span style={{ fontSize: "12.5px", fontWeight: 500, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{fmt(row.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
            {isDeduction && summary.leaveDeduction > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
                <span style={{ fontSize: "12.5px", color: "var(--label)" }}>Leave Deduction (unpaid days)</span>
                <span style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--red)", fontFamily: "monospace" }}>−{fmt(summary.leaveDeduction)}</span>
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: "10px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{totalLabel}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "monospace" }}>{isDeduction ? "−" : ""}{fmt(total)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}