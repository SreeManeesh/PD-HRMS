import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Play,
  RefreshCw,
  Download,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  getEmployeePayrollSummaries,
  runPayrollForSkillGroup,
  runPayrollForIndividualEmployee,
} from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import { INDIAN_STATES } from "./WageRatesPanel";
import EmployeeSalaryBreakdown from "./EmployeeSalaryBreakdown";

const CATEGORIES = ["All Categories", "SKILLED", "SEMISKILLED", "UNSKILLED"];

export default function BlueCollarPayrollPanel({
  initialMonth = new Date().getMonth() + 1,
  initialYear = new Date().getFullYear(),
  years = [2024, 2025, 2026],
  title = "Workforce Payroll Calculations",
  subtitle = "Comprehensive Indian statutory payroll table (20 columns) dynamically computed from verified attendance, state minimum wages, PF, ESIC, PT, and LWF.",
  onViewEmployeeSlip,
}) {
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);

  useEffect(() => {
    if (initialMonth) setMonth(initialMonth);
  }, [initialMonth]);

  useEffect(() => {
    if (initialYear) setYear(initialYear);
  }, [initialYear]);

  const [stateFilter, setStateFilter] = useState("All States (Default)");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningEmpId, setRunningEmpId] = useState(null);
  const [records, setRecords] = useState([]);
  const [selectedEmpForBreakdown, setSelectedEmpForBreakdown] = useState(null);

  // Sorting state
  const [sortKey, setSortKey] = useState("srNo");
  const [sortDir, setSortDir] = useState("asc");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getEmployeePayrollSummaries(month, year);
      const rows = res.data || [];
      // Map data with normalized properties for the 20 columns
      const normalized = rows.map((r, index) => {
        const gross = Number(r.gross || 0);
        const basic = Number(r.basic || 0);
        const hra = Number(r.hra || 0);
        const conv = Number(r.conv || 0);
        const med = Number(r.med || 0);
        const cca = Number(r.cca || 0);
        const special = Number(r.special || 0);

        const pf = Number(r.pf || r.deductions?.providentFund || 0);
        const esic = Number(r.esic || r.deductions?.healthInsurance || 0);
        const pt = Number(r.pt || r.deductions?.professionalTax || 0);
        const lwf = Number(r.lwf || r.deductions?.lwf || 20);
        const deductions = Number(r.totalDeductions || r.deductions?.total || (pf + esic + pt + lwf));
        const net = Number(r.net || r.netPay || (gross - deductions));

        const salaryType = r.salaryType || r.rawRecord?.summary?.salaryType || (Number(r.annualSalary) > 0 ? "Monthly" : "Daily");
        const fixedMonthlySalary = Number(r.fixedMonthlySalary || (salaryType === "Monthly" ? (r.annualSalary ? r.annualSalary / 12 : 24000) : 0));
        const dailySalaryRate = Number(r.dailySalaryRate || r.dailyRate || r.dailyWageRate || (fixedMonthlySalary > 0 ? fixedMonthlySalary / 30 : 900));
        const lopDays = Number(r.lopDays != null ? r.lopDays : (r.leaveDays || 0));
        const lopDeduction = Number(r.lopDeduction != null ? r.lopDeduction : (r.leaveDeduction || (salaryType === "Monthly" ? lopDays * dailySalaryRate : 0)));
        const grossPayableSalary = Number(r.grossPayableSalary || (salaryType === "Monthly" ? Math.max(fixedMonthlySalary - lopDeduction, 0) : gross));

        const overtime = Number(r.overtime || r.earnings?.overtime || 0);
        const overtimeHours = Number(r.overtimeHours || r.rawRecord?.summary?.overtimeHours || (overtime > 0 ? Math.round(overtime / ((dailySalaryRate / 8) * 1.5)) : 0));
        const attendanceBonus = Number(
          r.attendanceBonus ||
          r.earnings?.attendanceBonus ||
          r.earnings?.attendance_bonus ||
          r.earnings?.ATT_BONUS ||
          r.earnings?.performanceBonus ||
          0
        );
        const nightShiftCount = Number(r.nightShiftCount || r.rawRecord?.summary?.nightShiftCount || 0);
        const nightShiftAllowance = Number(
          r.nightShiftAllowance ||
          r.earnings?.nightShiftAllowance ||
          r.earnings?.NIGHT_ALLOW ||
          r.earnings?.night_shift_allowance ||
          0
        );
        const productionUnits = Number(r.productionUnits || r.rawRecord?.summary?.productionUnits || 0);
        const productionIncentive = Number(
          r.productionIncentive ||
          r.earnings?.productionIncentive ||
          r.earnings?.PROD_INC ||
          r.earnings?.production_incentive ||
          0
        );

        return {
          srNo: index + 1,
          id: r.id || r.employeeId,
          employeeId: r.employeeId || r.id,
          employeeName: r.employeeName || "Worker",
          category: (r.category || r.skillType || "SKILLED").toUpperCase().replace(/\s+/g, ""),
          skillType: r.skillType || "Skilled",
          salaryType,
          fixedMonthlySalary,
          dailySalaryRate,
          lopDays,
          lopDeduction,
          grossPayableSalary,
          overtime,
          overtimeHours,
          attendanceBonus,
          nightShiftCount,
          nightShiftAllowance,
          productionUnits,
          productionIncentive,
          gender: r.gender || "M",
          doj: r.doj || "2024-01-01",
          state: r.state || "All States (Default)",
          days: Number(r.days != null ? r.days : (r.workingDays || 26)),
          basic,
          hra,
          conv,
          med,
          cca,
          special,
          gross,
          pf,
          esic,
          pt,
          lwf,
          deductions,
          net,
          status: r.status || "Draft",
          rawRecord: r,
        };
      });
      setRecords(normalized);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load blue-collar payroll data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, year]);

  const handleRunAllPayroll = async () => {
    setRunning(true);
    try {
      const res = await runPayrollForSkillGroup({
        skillType: categoryFilter !== "All Categories" ? categoryFilter : "ALL",
        month,
        year,
      });
      toast(`Successfully computed payroll for ${res.data?.processedCount ?? records.length} workers!`);
      loadData();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to run payroll", "error");
    } finally {
      setRunning(false);
    }
  };

  const handleRunIndividual = async (empId, empName) => {
    setRunningEmpId(empId);
    try {
      await runPayrollForIndividualEmployee({
        employeeId: empId,
        month,
        year,
      });
      toast(`Payroll calculated for ${empName}`);
      loadData();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to run worker payroll", "error");
    } finally {
      setRunningEmpId(null);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // State filter
      if (stateFilter && stateFilter !== "All States (Default)") {
        if (!r.state || !r.state.toLowerCase().includes(stateFilter.toLowerCase())) {
          // If employee state doesn't match and not Central
          return false;
        }
      }
      // Category filter
      if (categoryFilter && categoryFilter !== "All Categories") {
        if (r.category !== categoryFilter) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.employeeName.toLowerCase().includes(q);
        const matchesId = r.employeeId.toLowerCase().includes(q);
        const matchesCat = r.category.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesCat) return false;
      }
      return true;
    });
  }, [records, stateFilter, categoryFilter, searchQuery]);

  // Sorted records
  const sortedRecords = useMemo(() => {
    const list = [...filteredRecords];
    list.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (sortKey === "doj") {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = (valB || "").toLowerCase();
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRecords, sortKey, sortDir]);

  // Aggregate totals
  const totals = useMemo(() => {
    return sortedRecords.reduce(
      (acc, r) => ({
        days: acc.days + r.days,
        basic: acc.basic + r.basic,
        hra: acc.hra + r.hra,
        conv: acc.conv + r.conv,
        med: acc.med + r.med,
        cca: acc.cca + r.cca,
        special: acc.special + r.special,
        gross: acc.gross + r.gross,
        pf: acc.pf + r.pf,
        esic: acc.esic + r.esic,
        pt: acc.pt + r.pt,
        lwf: acc.lwf + r.lwf,
        deductions: acc.deductions + r.deductions,
        net: acc.net + r.net,
      }),
      {
        days: 0,
        basic: 0,
        hra: 0,
        conv: 0,
        med: 0,
        cca: 0,
        special: 0,
        gross: 0,
        pf: 0,
        esic: 0,
        pt: 0,
        lwf: 0,
        deductions: 0,
        net: 0,
      }
    );
  }, [sortedRecords]);

  // Export to Excel / CSV
  const handleExportToExcel = () => {
    if (sortedRecords.length === 0) {
      toast("No records to export", "error");
      return;
    }

    const headers = [
      "SR NO",
      "EMP ID",
      "NAME",
      "CATEGORY",
      "GENDER",
      "DOJ",
      "DAYS",
      "BASIC",
      "HRA",
      "CONV",
      "MED",
      "CCA",
      "SPECIAL",
      "GROSS",
      "PF",
      "ESIC",
      "PT",
      "LWF",
      "DEDUCTIONS",
      "NET",
    ];

    const rows = sortedRecords.map((r, idx) => [
      idx + 1,
      `"${r.employeeId}"`,
      `"${r.employeeName}"`,
      `"${r.category}"`,
      `"${r.gender}"`,
      `"${r.doj}"`,
      r.days,
      r.basic,
      r.hra,
      r.conv,
      r.med,
      r.cca,
      r.special,
      r.gross,
      r.pf,
      r.esic,
      r.pt,
      r.lwf,
      r.deductions,
      r.net,
    ]);

    // Summary Row
    rows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      totals.days,
      totals.basic,
      totals.hra,
      totals.conv,
      totals.med,
      totals.cca,
      totals.special,
      totals.gross,
      totals.pf,
      totals.esic,
      totals.pt,
      totals.lwf,
      totals.deductions,
      totals.net,
    ]);

    const csvString = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `blue_collar_payroll_${month}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast("Payroll table exported to Excel (.csv)");
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={11} style={{ color: "var(--subtext)", opacity: 0.5, marginLeft: 4 }} />;
    }
    return sortDir === "asc" ? (
      <ArrowUp size={12} style={{ color: "var(--primary)", marginLeft: 4 }} />
    ) : (
      <ArrowDown size={12} style={{ color: "var(--primary)", marginLeft: 4 }} />
    );
  };

  const fmtInr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Top Header Controls ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ fontSize: "19px", fontWeight: 800, color: "var(--text)", margin: 0 }}>
                {title}
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  background: "var(--primary-light)",
                  color: "var(--primary)",
                  padding: "3px 9px",
                  borderRadius: "99px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ShieldCheck size={12} /> Attendance-Driven Live Engine
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--subtext)", margin: "4px 0 0" }}>
              {subtitle}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={handleRunAllPayroll}
              disabled={running || loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 18px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: running || loading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
              }}
            >
              {running ? <Spinner size={14} /> : <Play size={14} />} Run Payroll
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh attendance and recalculate"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 14px",
                background: "var(--background)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>

            <button
              onClick={handleExportToExcel}
              disabled={sortedRecords.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 16px",
                background: "#047857",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: sortedRecords.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <Download size={14} /> Export to Excel
            </button>
          </div>
        </div>

        {/* Toolbar: Month, Year, State, Category, Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            padding: "12px 14px",
            background: "var(--background)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Month & Year */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--subtext)" }}>Period:</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{
                height: "34px",
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {[
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
              ].map((mName, idx) => (
                <option key={mName} value={idx + 1}>{mName}</option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{
                height: "34px",
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Indian States Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--subtext)" }}>State:</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{
                height: "34px",
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--subtext)" }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                height: "34px",
                padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginLeft: "auto",
              flex: "1 1 200px",
              maxWidth: "320px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0 10px",
              height: "34px",
            }}
          >
            <Search size={14} style={{ color: "var(--subtext)" }} />
            <input
              type="text"
              placeholder="Search by worker name, ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text)",
                fontSize: "13px",
                width: "100%",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 4 Metric Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        {/* EMPLOYEES */}
        <div
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(59, 130, 246, 0.12)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              EMPLOYEES
            </span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", marginTop: "2px", fontFamily: "monospace" }}>
              {sortedRecords.length}
            </div>
          </div>
        </div>

        {/* TOTAL GROSS */}
        <div
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowUpRight size={22} />
          </div>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              TOTAL GROSS
            </span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", marginTop: "2px", fontFamily: "monospace" }}>
              {fmtInr(totals.gross)}
            </div>
          </div>
        </div>

        {/* TOTAL DEDUCTIONS */}
        <div
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.12)",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowDownRight size={22} />
          </div>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              TOTAL DEDUCTIONS
            </span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#dc2626", marginTop: "2px", fontFamily: "monospace" }}>
              −{fmtInr(totals.deductions)}
            </div>
          </div>
        </div>

        {/* TOTAL NET PAYOUT */}
        <div
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.18)",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wallet size={22} />
          </div>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              TOTAL NET PAYOUT
            </span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#16a34a", marginTop: "2px", fontFamily: "monospace" }}>
              {fmtInr(totals.net)}
            </div>
          </div>
        </div>
      </div>

      {/* ── 20-Column Table ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "16px 20px 24px",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <Spinner />
        ) : sortedRecords.length === 0 ? (
          <EmptyState
            title="No blue-collar records found"
            subtitle="Upload attendance punches or adjust month/year and state filters."
          />
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "680px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1600px", fontSize: "12.5px" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--background)",
                    borderBottom: "2px solid var(--border)",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                  }}
                >
                  {[
                    { key: "srNo", label: "SR NO", align: "center" },
                    { key: "employeeId", label: "EMP ID", align: "left" },
                    { key: "employeeName", label: "NAME", align: "left" },
                    { key: "category", label: "CATEGORY", align: "left" },
                    { key: "gender", label: "GENDER", align: "center" },
                    { key: "doj", label: "DOJ", align: "left" },
                    { key: "days", label: "DAYS", align: "right" },
                    { key: "basic", label: "BASIC", align: "right" },
                    { key: "hra", label: "HRA", align: "right" },
                    { key: "conv", label: "CONV", align: "right" },
                    { key: "med", label: "MED", align: "right" },
                    { key: "cca", label: "CCA", align: "right" },
                    { key: "special", label: "SPECIAL", align: "right" },
                    { key: "gross", label: "GROSS", align: "right" },
                    { key: "pf", label: "PF", align: "right" },
                    { key: "esic", label: "ESIC", align: "right" },
                    { key: "pt", label: "PT", align: "right" },
                    { key: "lwf", label: "LWF", align: "right" },
                    { key: "deductions", label: "DEDUCTIONS", align: "right" },
                    { key: "net", label: "NET", align: "right" },
                    { key: "action", label: "ACTION", align: "center" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.key !== "action" && handleSort(col.key)}
                      style={{
                        padding: "10px 12px",
                        textAlign: col.align,
                        fontSize: "11px",
                        fontWeight: 700,
                        color: sortKey === col.key ? "var(--primary)" : "var(--subtext)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        whiteSpace: "nowrap",
                        cursor: col.key !== "action" ? "pointer" : "default",
                        userSelect: "none",
                        background: "var(--background)",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
                        }}
                      >
                        {col.label}
                        {col.key !== "action" && renderSortIndicator(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {sortedRecords.map((r, idx) => {
                  const isEven = idx % 2 === 0;
                  const isRunningThis = runningEmpId === r.employeeId;

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isEven ? "transparent" : "rgba(0,0,0,0.015)",
                        transition: "background 0.1s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--background)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isEven ? "transparent" : "rgba(0,0,0,0.015)";
                      }}
                    >
                      {/* 1. SR NO */}
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--subtext)", fontWeight: 600 }}>
                        {idx + 1}
                      </td>

                      {/* 2. EMP ID */}
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
                        {r.employeeId}
                      </td>

                      {/* 3. NAME */}
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                        {r.employeeName}
                      </td>

                      {/* 4. CATEGORY & PAY TYPE */}
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: "4px",
                              background:
                                r.category === "SKILLED"
                                  ? "#ecfdf5"
                                  : r.category === "SEMISKILLED"
                                  ? "#eff6ff"
                                  : "#fef3c7",
                              color:
                                r.category === "SKILLED"
                                  ? "#059669"
                                  : r.category === "SEMISKILLED"
                                  ? "#2563eb"
                                  : "#d97706",
                              border: `1px solid ${
                                r.category === "SKILLED"
                                  ? "#a7f3d0"
                                  : r.category === "SEMISKILLED"
                                  ? "#bfdbfe"
                                  : "#fde68a"
                              }`,
                            }}
                          >
                            {r.category}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: "3px",
                              background: r.salaryType === "Monthly" ? "#f5f3ff" : "#f0f9ff",
                              color: r.salaryType === "Monthly" ? "#7c3aed" : "#0284c7",
                              border: `1px solid ${r.salaryType === "Monthly" ? "#ddd6fe" : "#bae6fd"}`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.salaryType === "Monthly"
                              ? `Monthly (₹${Math.round(r.fixedMonthlySalary).toLocaleString("en-IN")}/mo)`
                              : `Daily (₹${Math.round(r.dailySalaryRate).toLocaleString("en-IN")}/day)`}
                          </span>
                        </div>
                      </td>

                      {/* 5. GENDER */}
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "var(--label)" }}>
                        {r.gender}
                      </td>

                      {/* 6. DOJ */}
                      <td style={{ padding: "10px 12px", color: "var(--subtext)", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                        {r.doj}
                      </td>

                      {/* 7. DAYS (Attendance-derived payable days + LOP deduction indicator + Overtime indicator) */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span>{r.days}</span>
                          {r.lopDays > 0 && (
                            <span
                              style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`${r.lopDays} days LOP (Deduction: ₹${Math.round(r.lopDeduction).toLocaleString("en-IN")})`}
                            >
                              {r.lopDays} LOP (−₹{Math.round(r.lopDeduction).toLocaleString("en-IN")})
                            </span>
                          )}
                          {r.overtimeHours > 0 && (
                            <span
                              style={{ fontSize: "10px", color: "#ea580c", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`${r.overtimeHours} hrs Overtime (+₹${Math.round(r.overtime).toLocaleString("en-IN")})`}
                            >
                              +{r.overtimeHours}h OT (+₹{Math.round(r.overtime).toLocaleString("en-IN")})
                            </span>
                          )}
                          {r.nightShiftCount > 0 && (
                            <span
                              style={{ fontSize: "10px", color: "#7c3aed", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`${r.nightShiftCount} Night Shifts (+₹${Math.round(r.nightShiftAllowance).toLocaleString("en-IN")})`}
                            >
                              +{r.nightShiftCount} Nights (+₹{Math.round(r.nightShiftAllowance).toLocaleString("en-IN")})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 8. BASIC */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--text)" }}>
                        {r.basic.toLocaleString("en-IN")}
                      </td>

                      {/* 9. HRA */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--subtext)" }}>
                        {r.hra.toLocaleString("en-IN")}
                      </td>

                      {/* 10. CONV */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--subtext)" }}>
                        {r.conv.toLocaleString("en-IN")}
                      </td>

                      {/* 11. MED */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--subtext)" }}>
                        {r.med.toLocaleString("en-IN")}
                      </td>

                      {/* 12. CCA */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--subtext)" }}>
                        {r.cca.toLocaleString("en-IN")}
                      </td>

                      {/* 13. SPECIAL */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--subtext)" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span>{r.special.toLocaleString("en-IN")}</span>
                          {r.attendanceBonus > 0 && (
                            <span
                              style={{ fontSize: "10px", color: "#059669", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`Attendance Bonus (+₹${Math.round(r.attendanceBonus).toLocaleString("en-IN")})`}
                            >
                              +₹{Math.round(r.attendanceBonus).toLocaleString("en-IN")} Bonus
                            </span>
                          )}
                          {r.productionUnits > 0 && (
                            <span
                              style={{ fontSize: "10px", color: "#2563eb", fontWeight: 700, whiteSpace: "nowrap" }}
                              title={`Production Incentive: ${r.productionUnits} units (+₹${Math.round(r.productionIncentive).toLocaleString("en-IN")})`}
                            >
                              +{r.productionUnits} Units (+₹{Math.round(r.productionIncentive).toLocaleString("en-IN")})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 14. GROSS */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>
                        {r.gross.toLocaleString("en-IN")}
                      </td>

                      {/* 15. PF */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--red)" }}>
                        {r.pf.toLocaleString("en-IN")}
                      </td>

                      {/* 16. ESIC */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--red)" }}>
                        {r.esic.toLocaleString("en-IN")}
                      </td>

                      {/* 17. PT */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--red)" }}>
                        {r.pt.toLocaleString("en-IN")}
                      </td>

                      {/* 18. LWF */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "var(--red)" }}>
                        {r.lwf.toLocaleString("en-IN")}
                      </td>

                      {/* 19. DEDUCTIONS */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "var(--red)" }}>
                        {r.deductions.toLocaleString("en-IN")}
                      </td>

                      {/* 20. NET */}
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontFamily: "monospace", color: "var(--green)" }}>
                        {r.net.toLocaleString("en-IN")}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={() => handleRunIndividual(r.employeeId, r.employeeName)}
                            disabled={isRunningThis}
                            title="Recalculate worker live payroll"
                            style={{
                              padding: "4px 8px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: "var(--primary-light)",
                              color: "var(--primary)",
                              border: "1px solid var(--primary)",
                              borderRadius: "var(--radius-sm)",
                              cursor: isRunningThis ? "not-allowed" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            {isRunningThis ? <Spinner size={10} /> : <Play size={10} />} Run
                          </button>

                          <button
                            onClick={() => setSelectedEmpForBreakdown(r.employeeId)}
                            title="View detailed payslip breakdown"
                            style={{
                              padding: "4px 6px",
                              background: "transparent",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              color: "var(--subtext)",
                              cursor: "pointer",
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Table Summary Footer Row ── */}
              <tfoot>
                <tr
                  style={{
                    background: "var(--background)",
                    borderTop: "2px solid var(--border)",
                    fontWeight: 800,
                    fontFamily: "monospace",
                    fontSize: "12.5px",
                    position: "sticky",
                    bottom: 0,
                    zIndex: 10,
                  }}
                >
                  <td colSpan={6} style={{ padding: "12px 14px", textAlign: "left", letterSpacing: "1px", color: "var(--text)" }}>
                    TOTAL ({sortedRecords.length} WORKERS)
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--text)" }}>
                    {totals.days}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--text)" }}>
                    {totals.basic.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--subtext)" }}>
                    {totals.hra.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--subtext)" }}>
                    {totals.conv.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--subtext)" }}>
                    {totals.med.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--subtext)" }}>
                    {totals.cca.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--subtext)" }}>
                    {totals.special.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--text)" }}>
                    {totals.gross.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--red)" }}>
                    {totals.pf.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--red)" }}>
                    {totals.esic.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--red)" }}>
                    {totals.pt.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--red)" }}>
                    {totals.lwf.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--red)" }}>
                    {totals.deductions.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--green)", fontSize: "13.5px" }}>
                    {totals.net.toLocaleString("en-IN")}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Individual Breakdown Modal ── */}
      {selectedEmpForBreakdown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-xl)",
              width: "100%",
              maxWidth: "840px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text)", margin: 0 }}>
                Worker Attendance & Itemized Salary Slip
              </h3>
              <button
                onClick={() => setSelectedEmpForBreakdown(null)}
                style={{
                  padding: "6px 12px",
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: "12.5px",
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>

            <EmployeeSalaryBreakdown
              employeeId={selectedEmpForBreakdown}
              month={month}
              year={year}
            />
          </div>
        </div>
      )}
    </section>
  );
}
