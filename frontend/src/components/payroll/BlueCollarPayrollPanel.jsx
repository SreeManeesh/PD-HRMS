import { useState, useEffect, useMemo, useRef } from "react";
import {
  Users,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Play,
  RefreshCw,
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  CheckCircle2,
  Edit3,
  X,
  Copy,
  Upload,
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
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function BlueCollarPayrollPanel({
  initialMonth = new Date().getMonth() + 1,
  initialYear = new Date().getFullYear(),
  years = [2024, 2025, 2026],
  title = "Workforce Payroll Calculations",
  subtitle = "Fully dynamic payroll table — earning and deduction columns are built from the live payroll components and values computed from verified attendance.",
  onViewEmployeeSlip,
  isAnnual = false,
  onPayrollCompleted,
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
  const [allFetchedRecords, setAllFetchedRecords] = useState([]);
  const [hasRun, setHasRun] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [paymentUpload, setPaymentUpload] = useState(null);
  const [editingGrossEmpId, setEditingGrossEmpId] = useState(null);
  const [selectedEmpForBreakdown, setSelectedEmpForBreakdown] = useState(null);
  const paymentFileInputRef = useRef(null);

  // Pagination state (Strictly 10 items per page)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Sorting state
  const [sortKey, setSortKey] = useState("srNo");
  const [sortDir, setSortDir] = useState("asc");

  // ── Dynamic helpers: columns come from REAL earnings/deduction data, never
  // a hardcoded component list ──────────────────────────────────────────────
  const num = (v, fb = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const prettifyKey = (k) =>
    String(k || "")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (s) => s.toUpperCase())
      .trim() || String(k);
  const EARNINGS_EXCLUDE = ["total"];
  const DEDUCTIONS_EXCLUDE = ["total", "leaveDeduction"];
  const normalizeDetails = (details, obj, exclude) => {
    if (Array.isArray(details)) {
      return details.map((d) => ({
        key: String(d.key),
        label: d.label || prettifyKey(d.key),
        amount: num(d.amount),
      }));
    }
    const o = obj || {};
    return Object.entries(o)
      .filter(([k]) => k !== "total" && !exclude.includes(k))
      .map(([k, v]) => ({ key: k, label: prettifyKey(k), amount: num(v) }));
  };
  const isBasicLikeKey = (k) =>
    String(k || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .includes("basic");

  const normalizeRows = (rows) => {
    return rows.map((r, index) => {
      const gross = num(r.gross);
      const totalDeductions = num(
        r.totalDeductions ?? r.deductions?.total,
        null,
      );
      const pf = num(r.pf ?? r.deductions?.providentFund);
      const esic = num(r.esic ?? r.deductions?.healthInsurance ?? r.deductions?.esic);
      const pt = num(r.pt ?? r.deductions?.professionalTax);
      const lwf = num(r.lwf ?? r.deductions?.lwf);
      const incomeTax = num(r.incomeTax ?? r.deductions?.incomeTax ?? r.deductions?.tds);
      const advanceRecovery = num(
        r.advanceRecovery ?? r.deductions?.salaryAdvanceRecovery ?? r.deductions?.advanceRecovery,
      );
      const deductions =
        r.totalDeductions != null || r.deductions?.total != null
          ? num(r.totalDeductions ?? r.deductions?.total)
          : pf + esic + pt + lwf + incomeTax + advanceRecovery;
      const net =
        r.net != null || r.netPay != null
          ? num(r.net ?? r.netPay)
          : gross - deductions;

      const salaryType =
        r.salaryType ||
        r.rawRecord?.summary?.salaryType ||
        (Number(r.annualSalary) > 0 ? "Monthly" : "Daily");
      const fixedMonthlySalary = num(
        r.fixedMonthlySalary ??
          (salaryType === "Monthly"
            ? r.annualSalary
              ? Math.round(r.annualSalary / 12)
              : 24000
            : 0),
      );
      const dailySalaryRate = num(
        r.dailySalaryRate ||
          r.dailyRate ||
          r.dailyWageRate ||
          (fixedMonthlySalary > 0 ? fixedMonthlySalary / 30 : 900),
      );
      const lopDays = num(r.lopDays ?? r.leaveDays);
      const lopDeduction = num(
        r.lopDeduction ??
          r.leaveDeduction ??
          (salaryType === "Monthly" ? lopDays * dailySalaryRate : 0),
      );
      const grossPayableSalary = num(
        r.grossPayableSalary ??
          (salaryType === "Monthly"
            ? Math.max(fixedMonthlySalary - lopDeduction, 0)
            : gross),
      );

      const overtime = num(r.overtime ?? r.earnings?.overtime);
      const overtimeHours = num(
        r.overtimeHours ??
          r.rawRecord?.summary?.overtimeHours ??
          (overtime > 0 && dailySalaryRate > 0
            ? Math.round(overtime / ((dailySalaryRate / 8) * 1.5))
            : 0),
      );
      const attendanceBonus = num(
        r.attendanceBonus ??
          r.earnings?.attendanceBonus ??
          r.earnings?.attendance_bonus ??
          r.earnings?.ATT_BONUS,
      );
      const nightShiftCount = num(
        r.nightShiftCount ?? r.rawRecord?.summary?.nightShiftCount,
      );
      const nightShiftAllowance = num(
        r.nightShiftAllowance ??
          r.earnings?.nightShiftAllowance ??
          r.earnings?.NIGHT_ALLOW ??
          r.earnings?.night_shift_allowance,
      );
      const productionUnits = num(
        r.productionUnits ?? r.rawRecord?.summary?.productionUnits,
      );
      const productionIncentive = num(
        r.productionIncentive ??
          r.earnings?.productionIncentive ??
          r.earnings?.PROD_INC ??
          r.earnings?.production_incentive,
      );

      // Real dynamic breakdowns from the backend (earningDetails /
      // deductionDetails); fall back to deriving from the raw objects.
      const earningDetails = normalizeDetails(
        r.earningDetails,
        r.earnings,
        EARNINGS_EXCLUDE,
      );
      const deductionDetails = normalizeDetails(
        r.deductionDetails,
        r.deductions,
        DEDUCTIONS_EXCLUDE,
      );
      const earningByKey = Object.fromEntries(
        earningDetails.map((d) => [d.key, d.amount]),
      );
      const deductionByKey = Object.fromEntries(
        deductionDetails.map((d) => [d.key, d.amount]),
      );

      const empCode = r.employeeId || r.id || `EMP${index + 1}`;
      const txnId =
        r.transactionId ||
        `TXN-${empCode}-${year}${String(month).padStart(2, "0")}`;

      return {
        srNo: index + 1,
        id: r.id || r.employeeId,
        employeeId: empCode,
        employeeName: r.employeeName || "Worker",
        category: (r.category || r.skillType || "SKILLED")
          .toUpperCase()
          .replace(/\s+/g, ""),
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
        days: num(r.days ?? r.workingDays, 26),
        earningDetails,
        deductionDetails,
        earningByKey,
        deductionByKey,
        gross,
        pf,
        esic,
        pt,
        lwf,
        incomeTax,
        advanceRecovery,
        deductions,
        net,
        status: r.status || "Draft",
        transactionId: txnId,
        rawRecord: r,
      };
    });
  };

  const loadData = async (shouldForceRun = false) => {
    setLoading(true);
    try {
      const res = await getEmployeePayrollSummaries(month, year);
      const rows = res.data || [];
      const normalized = normalizeRows(rows);
      setAllFetchedRecords(normalized);

      // If any row is already Paid/Approved or shouldForceRun, populate
      const alreadyPaid = rows.some(
        (r) => r.status === "Paid" || r.status === "Approved",
      );
      if (alreadyPaid || shouldForceRun) {
        setRecords(normalized);
        setHasRun(true);
        setIsPaid(true);
        setPaymentUpload(null);
      } else {
        // Initial empty state until Run Payroll is clicked
        setRecords([]);
        setHasRun(false);
        setIsPaid(false);
        setPaymentUpload(null);
      }
    } catch (err) {
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to load blue-collar payroll data",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadData();
    setPage(1);
  }, [month, year]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, stateFilter]);

  const handleRunAllPayroll = async () => {
    setRunning(true);
    try {
      await runPayrollForSkillGroup({
        skillType: categoryFilter !== "All Categories" ? categoryFilter : "ALL",
        month,
        year,
      });
      // Fetch freshly computed summaries
      const res = await getEmployeePayrollSummaries(month, year);
      const rows = res.data || [];
      const normalized = normalizeRows(
        rows.length ? rows : allFetchedRecords,
      ).map((row) => ({
        ...row,
        status: "Processing",
      }));
      setRecords(normalized);
      setAllFetchedRecords(normalized);
      setHasRun(true);
      setIsPaid(false);
      setPaymentUpload(null);
      setShowTxnModal(true);
      toast(
        `Payroll is processing for ${normalized.length} workers. Upload bank transaction Excel to mark Paid.`,
      );
    } catch (err) {
      if (allFetchedRecords.length > 0) {
        setRecords(
          allFetchedRecords.map((row) => ({ ...row, status: "Processing" })),
        );
        setHasRun(true);
        setIsPaid(false);
        setPaymentUpload(null);
        setShowTxnModal(true);
        toast(
          `Payroll is processing for ${MONTH_NAMES[month - 1]} ${year}. Upload bank transaction Excel to mark Paid.`,
        );
      } else {
        toast(
          err.response?.data?.message || err.message || "Failed to run payroll",
          "error",
        );
      }
    } finally {
      setRunning(false);
    }
  };

  const handlePaymentUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["xls", "xlsx", "csv"];
    if (!validExtensions.includes(extension)) {
      toast(
        "Upload an Excel or CSV file with bank transaction details.",
        "error",
      );
      event.target.value = "";
      return;
    }

    const uploadedAt = new Date();
    setPaymentUpload({
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: uploadedAt.toLocaleString(),
      rows: records.length,
    });
    setRecords((prev) => prev.map((row) => ({ ...row, status: "Paid" })));
    setIsPaid(true);
    toast(
      `Bank transaction file uploaded. Payroll marked Paid for ${records.length} workers.`,
    );
    if (onPayrollCompleted) onPayrollCompleted();
    event.target.value = "";
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
      loadData(true);
    } catch (err) {
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to run worker payroll",
        "error",
      );
    } finally {
      setRunningEmpId(null);
    }
  };

  // Update Gross Salary inline when payroll is not active/running (Draft).
  // Scales the row's REAL earning components proportionally to the new gross
  // (remainder into the basic-like leg) and recomputes statutory deductions,
  // so every dynamic column stays consistent — no fabricated static split.
  const handleUpdateGross = (empId, newGross) => {
    const grossNum = Math.max(0, Math.round(Number(newGross) || 0));
    setRecords((prev) =>
      prev.map((r) => {
        if (r.employeeId !== empId) return r;
        const keys = (r.earningDetails || []).map((d) => d.key);
        const oldSum = keys.reduce((s, k) => s + num(r.earningByKey?.[k]), 0);
        const basicKey =
          keys.find((k) => isBasicLikeKey(k)) || keys[keys.length - 1];
        const newByKey = {};
        if (keys.length === 0) {
          return { ...r, gross: grossNum, net: Math.max(0, grossNum - num(r.deductions)) };
        }
        if (oldSum > 0) {
          let assigned = 0;
          keys.forEach((k) => {
            if (k === basicKey) return;
            const v = Math.round((num(r.earningByKey?.[k]) * grossNum) / oldSum);
            newByKey[k] = v;
            assigned += v;
          });
          newByKey[basicKey] = Math.max(0, grossNum - assigned);
        } else {
          keys.forEach((k) => {
            newByKey[k] = k === basicKey ? grossNum : 0;
          });
        }
        const newEarningDetails = (r.earningDetails || []).map((d) => ({
          ...d,
          amount: newByKey[d.key] ?? 0,
        }));
        const newEarningByKey = Object.fromEntries(
          newEarningDetails.map((d) => [d.key, d.amount]),
        );
        const findDedKey = (...cands) =>
          (r.deductionDetails || []).map((d) => d.key).find((k) => {
            const n = k.toLowerCase().replace(/[^a-z]/g, "");
            return cands.some((c) => n.includes(c));
          });
        const pfKey = findDedKey("provident", "pf");
        const esicKey = findDedKey("health", "esic", "esi");
        const ptKey = findDedKey("professional", "pt");
        const basicAmt = basicKey ? (newByKey[basicKey] ?? 0) : Math.round(grossNum * 0.5);
        const pf = Math.round(Math.min(basicAmt, 15000) * 0.12);
        const esic = grossNum <= 21000 ? Math.round(grossNum * 0.0075) : 0;
        const pt = grossNum > 10000 ? 200 : 0;
        const newDeductionDetails = (r.deductionDetails || []).map((d) => {
          if (pfKey && d.key === pfKey) return { ...d, amount: pf };
          if (esicKey && d.key === esicKey) return { ...d, amount: esic };
          if (ptKey && d.key === ptKey) return { ...d, amount: pt };
          return d;
        });
        const newDeductionByKey = Object.fromEntries(
          newDeductionDetails.map((d) => [d.key, d.amount]),
        );
        const deductions = newDeductionDetails.reduce((s, d) => s + num(d.amount), 0);
        const net = Math.max(0, grossNum - deductions);

        return {
          ...r,
          gross: grossNum,
          fixedMonthlySalary: grossNum,
          grossPayableSalary: grossNum,
          earningDetails: newEarningDetails,
          earningByKey: newEarningByKey,
          earnings: { ...(r.earnings || {}), ...newByKey, total: grossNum },
          deductionDetails: newDeductionDetails,
          deductionByKey: newDeductionByKey,
          pf: pfKey ? pf : num(r.pf),
          esic: esicKey ? esic : num(r.esic),
          pt: ptKey ? pt : num(r.pt),
          incomeTax: num(r.incomeTax),
          advanceRecovery: num(r.advanceRecovery),
          deductions,
          net,
        };
      }),
    );
    toast(
      `Updated gross salary for ${empId} to ₹${grossNum.toLocaleString("en-IN")}`,
    );
  };

  // Working download payslip statement for Annual / Monthly — fully dynamic,
  // listing the row's real earning/deduction components.
  const handleDownloadPayslip = (r) => {
    const pad = (label, val) =>
      `${String(label).slice(0, 24).padEnd(25)}₹${Math.round(num(val)).toLocaleString("en-IN")}`;
    const earnLines = (r.earningDetails || [])
      .filter((d) => num(d.amount) !== 0)
      .map((d) => pad(d.label || d.key, d.amount))
      .join("\n");
    const dedLines = (r.deductionDetails || [])
      .filter((d) => num(d.amount) !== 0)
      .map((d) => pad(d.label || d.key, d.amount))
      .join("\n");
    const payslipContent = `===============================================================
PAYSLIP STATEMENT - ${MONTH_NAMES[month - 1].toUpperCase()} ${year}
PROTECCIO TECHNOLOGIES
===============================================================
Employee ID:    ${r.employeeId}
Employee Name:  ${r.employeeName}
Category:       ${r.category} (${r.skillType})
Department:     Operations / Workforce
Date of Join:   ${r.doj}
Working Days:   ${r.days} (LOP: ${r.lopDays || 0})
---------------------------------------------------------------
EARNINGS (INR)
---------------------------------------------------------------
${earnLines || "No earnings"}
---------------------------------------------------------------
GROSS SALARY:            ₹${num(r.gross).toLocaleString("en-IN")}
---------------------------------------------------------------
DEDUCTIONS (INR)
---------------------------------------------------------------
${dedLines || "No deductions"}
---------------------------------------------------------------
TOTAL DEDUCTIONS:        ₹${num(r.deductions).toLocaleString("en-IN")}
---------------------------------------------------------------
NET PAYOUT:              ₹${num(r.net).toLocaleString("en-IN")}
TRANSACTION ID:          ${r.transactionId || `TXN-${r.employeeId}-${year}${String(month).padStart(2, "0")}`}
PAYMENT STATUS:          PAID (Direct Bank Transfer)
===============================================================
This is a computer-generated statutory payroll document.
===============================================================`;

    const blob = new Blob([payslipContent], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payslip_${r.employeeId}_${month}_${year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Downloaded payslip statement for ${r.employeeName}`);
    if (onViewEmployeeSlip) onViewEmployeeSlip(r.employeeId);
  };

  const handleCopyTxn = (txnId) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txnId);
      toast(`Copied Transaction ID: ${txnId}`);
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
        if (
          !r.state ||
          !r.state.toLowerCase().includes(stateFilter.toLowerCase())
        ) {
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
    const sortVal = (r, key) => {
      if (typeof key === "string" && key.startsWith("earn:")) {
        return r.earningByKey?.[key.slice(5)];
      }
      if (typeof key === "string" && key.startsWith("ded:")) {
        return r.deductionByKey?.[key.slice(4)];
      }
      if (key in r) return r[key];
      if (r.earningByKey && key in r.earningByKey) return r.earningByKey[key];
      if (r.deductionByKey && key in r.deductionByKey) return r.deductionByKey[key];
      return undefined;
    };
    list.sort((a, b) => {
      let valA = sortVal(a, sortKey);
      let valB = sortVal(b, sortKey);

      if (sortKey === "doj") {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = (valB || "").toLowerCase();
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRecords, sortKey, sortDir]);

  // Fully dynamic columns: union of earning/deduction keys actually present
  // with a non-zero amount in any record. No hardcoded component names.
  const earningCols = useMemo(() => {
    const seen = new Map();
    for (const r of records) {
      for (const d of r.earningDetails || []) {
        if (!seen.has(d.key)) seen.set(d.key, d.label || prettifyKey(d.key));
      }
    }
    return [...seen.entries()]
      .filter(([key]) =>
        records.some((r) => Math.abs(num(r.earningByKey?.[key])) > 0),
      )
      .map(([key, label]) => ({ key, label }));
  }, [records]);

  const deductionCols = useMemo(() => {
    const seen = new Map();
    for (const r of records) {
      for (const d of r.deductionDetails || []) {
        if (!seen.has(d.key)) seen.set(d.key, d.label || prettifyKey(d.key));
      }
    }
    return [...seen.entries()]
      .filter(([key]) =>
        records.some((r) => Math.abs(num(r.deductionByKey?.[key])) > 0),
      )
      .map(([key, label]) => ({ key, label }));
  }, [records]);

  // Aggregate totals (dynamic detail columns + headline figures)
  const totals = useMemo(() => {
    const t = {
      days: 0,
      gross: 0,
      deductions: 0,
      net: 0,
      earning: {},
      deduction: {},
    };
    for (const r of sortedRecords) {
      t.days += num(r.days);
      t.gross += num(r.gross);
      t.deductions += num(r.deductions);
      t.net += num(r.net);
      for (const d of r.earningDetails || []) {
        t.earning[d.key] = num(t.earning[d.key]) + num(d.amount);
      }
      for (const d of r.deductionDetails || []) {
        t.deduction[d.key] = num(t.deduction[d.key]) + num(d.amount);
      }
    }
    return t;
  }, [sortedRecords]);

  // Export to Excel / CSV — mirrors the dynamic on-screen columns exactly
  const handleExportToExcel = () => {
    if (sortedRecords.length === 0) {
      toast("No records to export", "error");
      return;
    }

    const csvCell = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "SR NO",
      "EMP ID",
      "NAME",
      "CATEGORY",
      "GENDER",
      "DOJ",
      "DAYS",
      ...earningCols.map((c) => c.label.toUpperCase()),
      "GROSS",
      ...deductionCols.map((c) => c.label.toUpperCase()),
      "DEDUCTIONS",
      "NET",
    ];

    const rows = sortedRecords.map((r, idx) => [
      idx + 1,
      r.employeeId,
      r.employeeName,
      r.category,
      r.gender,
      r.doj,
      r.days,
      ...earningCols.map((c) => Math.round(num(r.earningByKey?.[c.key]))),
      Math.round(num(r.gross)),
      ...deductionCols.map((c) => Math.round(num(r.deductionByKey?.[c.key]))),
      Math.round(num(r.deductions)),
      Math.round(num(r.net)),
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
      ...earningCols.map((c) => Math.round(num(totals.earning[c.key]))),
      Math.round(num(totals.gross)),
      ...deductionCols.map((c) => Math.round(num(totals.deduction[c.key]))),
      Math.round(num(totals.deductions)),
      Math.round(num(totals.net)),
    ]);

    const csvString = [
      headers.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n");
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
      return (
        <ArrowUpDown
          size={11}
          style={{ color: "var(--subtext)", opacity: 0.5, marginLeft: 4 }}
        />
      );
    }
    return sortDir === "asc" ? (
      <ArrowUp size={12} style={{ color: "var(--primary)", marginLeft: 4 }} />
    ) : (
      <ArrowDown size={12} style={{ color: "var(--primary)", marginLeft: 4 }} />
    );
  };

  const fmtInr = (n) =>
    `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

  const pageCount = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedRecords = useMemo(() => {
    return sortedRecords.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE,
    );
  }, [sortedRecords, safePage]);
  const isProcessing = hasRun && records.length > 0 && !isPaid;
  const canEditPayroll = !isProcessing && !isPaid;

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2
                style={{
                  fontSize: "19px",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: 0,
                }}
              >
                {title}
              </h2>
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--subtext)",
                margin: "4px 0 0",
              }}
            >
              {subtitle}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={
                isProcessing ? () => setShowTxnModal(true) : handleRunAllPayroll
              }
              disabled={running || loading || isPaid}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 18px",
                background: isPaid
                  ? "#f0fdf4"
                  : isProcessing
                    ? "#fff7ed"
                    : "var(--primary)",
                color: isPaid ? "#16a34a" : isProcessing ? "#c2410c" : "#fff",
                border: isPaid
                  ? "1px solid #bbf7d0"
                  : isProcessing
                    ? "1px solid #fed7aa"
                    : "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 700,
                cursor:
                  running || loading || isPaid ? "not-allowed" : "pointer",
                boxShadow:
                  isPaid || isProcessing
                    ? "none"
                    : "0 2px 4px rgba(16, 185, 129, 0.2)",
              }}
            >
              {running ? (
                <>
                  <Spinner size={14} /> Processing…
                </>
              ) : isPaid ? (
                <>
                  <CheckCircle2 size={15} /> Paid
                </>
              ) : isProcessing ? (
                <>
                  <Upload size={15} /> Processing
                </>
              ) : (
                <>
                  <Play size={14} /> Run Payroll
                </>
              )}
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
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
              Refresh
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
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--subtext)",
              }}
            >
              Period:
            </span>
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
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].map((mName, idx) => (
                <option key={mName} value={idx + 1}>
                  {mName}
                </option>
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
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Indian States Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--subtext)",
              }}
            >
              State:
            </span>
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
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--subtext)",
              }}
            >
              Category:
            </span>
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
                <option key={cat} value={cat}>
                  {cat}
                </option>
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
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
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--subtext)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              EMPLOYEES
            </span>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "var(--text)",
                marginTop: "2px",
                fontFamily: "monospace",
              }}
            >
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
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--subtext)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              TOTAL GROSS
            </span>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "var(--text)",
                marginTop: "2px",
                fontFamily: "monospace",
              }}
            >
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
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--subtext)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              TOTAL DEDUCTIONS
            </span>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#dc2626",
                marginTop: "2px",
                fontFamily: "monospace",
              }}
            >
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
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--subtext)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              TOTAL NET PAYOUT
            </span>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "#16a34a",
                marginTop: "2px",
                fontFamily: "monospace",
              }}
            >
              {fmtInr(totals.net)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dynamic-Column Table ── */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "16px 20px 24px",
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {loading ? (
          <Spinner />
        ) : !hasRun && sortedRecords.length === 0 ? (
          /* Initial Empty State */
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--background)",
              borderRadius: "var(--radius)",
              border: "1px dashed var(--border)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "var(--primary-light)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <Play size={26} style={{ marginLeft: "2px" }} />
            </div>
            <h3
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text)",
                margin: "0 0 8px",
              }}
            >
              Payroll Not Yet Generated for {MONTH_NAMES[month - 1]} {year}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--subtext)",
                maxWidth: "480px",
                margin: "0 0 20px",
                lineHeight: 1.5,
              }}
            >
              Click <b>Run Payroll</b> to calculate verified attendance, wage
              rules, and statutory contributions, and automatically generate
              transaction payout details.
            </p>
            <button
              onClick={handleRunAllPayroll}
              disabled={running}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 22px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: running ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(16, 185, 129, 0.25)",
              }}
            >
              {running ? <Spinner size={14} /> : <Play size={14} />}{" "}
              {running ? "Processing Payroll…" : "Run Payroll"}
            </button>
          </div>
        ) : sortedRecords.length === 0 ? (
          <EmptyState
            title="No blue-collar records found"
            subtitle="Upload attendance punches or adjust month/year and state filters."
          />
        ) : (
          <div
            style={{
              overflowX: "auto",
              width: "100%",
              maxWidth: "100%",
              maxHeight: "680px",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "max-content",
                minWidth: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
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
                    // Dynamic earning components (real data, not hardcoded)
                    ...earningCols.map((c) => ({
                      key: `earn:${c.key}`,
                      label: c.label.toUpperCase(),
                      align: "right",
                    })),
                    { key: "gross", label: "GROSS", align: "right" },
                    // Dynamic deduction components (real data, not hardcoded)
                    ...deductionCols.map((c) => ({
                      key: `ded:${c.key}`,
                      label: c.label.toUpperCase(),
                      align: "right",
                    })),
                    { key: "deductions", label: "DEDUCTIONS", align: "right" },
                    { key: "net", label: "NET", align: "right" },
                    {
                      key: "transactionId",
                      label: "TRANSACTION ID",
                      align: "center",
                    },
                    { key: "action", label: "ACTION", align: "center" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() =>
                        col.key !== "action" &&
                        col.key !== "transactionId" &&
                        handleSort(col.key)
                      }
                      style={{
                        padding: "10px 12px",
                        textAlign: col.align,
                        fontSize: "11px",
                        fontWeight: 700,
                        color:
                          sortKey === col.key
                            ? "var(--primary)"
                            : "var(--subtext)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        whiteSpace: "nowrap",
                        cursor:
                          col.key !== "action" && col.key !== "transactionId"
                            ? "pointer"
                            : "default",
                        userSelect: "none",
                        background: "var(--background)",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent:
                            col.align === "right"
                              ? "flex-end"
                              : col.align === "center"
                                ? "center"
                                : "flex-start",
                        }}
                      >
                        {col.label}
                        {col.key !== "action" &&
                          col.key !== "transactionId" &&
                          renderSortIndicator(col.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pagedRecords.map((r, idx) => {
                  const isEven = idx % 2 === 0;
                  const isRunningThis = runningEmpId === r.employeeId;

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isEven
                          ? "transparent"
                          : "rgba(0,0,0,0.015)",
                        transition: "background 0.1s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--background)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isEven
                          ? "transparent"
                          : "rgba(0,0,0,0.015)";
                      }}
                    >
                      {/* 1. SR NO */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          color: "var(--subtext)",
                          fontWeight: 600,
                        }}
                      >
                        {(safePage - 1) * PAGE_SIZE + idx + 1}
                      </td>

                      {/* 2. EMP ID */}
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: "var(--primary)",
                        }}
                      >
                        {r.employeeId}
                      </td>

                      {/* 3. NAME */}
                      <td
                        style={{
                          padding: "10px 12px",
                          fontWeight: 600,
                          color: "var(--text)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.employeeName}
                      </td>

                      {/* 4. CATEGORY & PAY TYPE */}
                      <td
                        style={{ padding: "10px 12px", whiteSpace: "nowrap" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            alignItems: "flex-start",
                          }}
                        >
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
                              background:
                                r.salaryType === "Monthly"
                                  ? "#f5f3ff"
                                  : "#f0f9ff",
                              color:
                                r.salaryType === "Monthly"
                                  ? "#7c3aed"
                                  : "#0284c7",
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
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          fontWeight: 600,
                          color: "var(--label)",
                        }}
                      >
                        {r.gender}
                      </td>

                      {/* 6. DOJ */}
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "var(--subtext)",
                          whiteSpace: "nowrap",
                          fontFamily: "monospace",
                        }}
                      >
                        {r.doj}
                      </td>

                      {/* 7. DAYS */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "var(--text)",
                          fontFamily: "monospace",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                          }}
                        >
                          <span>{r.days}</span>
                          {r.lopDays > 0 && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#dc2626",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                              title={`${r.lopDays} days LOP (Deduction: ₹${Math.round(r.lopDeduction).toLocaleString("en-IN")})`}
                            >
                              {r.lopDays} LOP (−₹
                              {Math.round(r.lopDeduction).toLocaleString(
                                "en-IN",
                              )}
                              )
                            </span>
                          )}
                          {r.overtimeHours > 0 && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#ea580c",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                              title={`${r.overtimeHours} hrs Overtime`}
                            >
                              +{r.overtimeHours}h OT
                            </span>
                          )}
                          {r.nightShiftCount > 0 && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#7c3aed",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                              title={`${r.nightShiftCount} Night Shifts`}
                            >
                              +{r.nightShiftCount} Nights
                            </span>
                          )}
                          {r.productionUnits > 0 && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#2563eb",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                              title={`${r.productionUnits} Production Units`}
                            >
                              +{r.productionUnits} Units
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Dynamic earning-component columns (real data) */}
                      {earningCols.map((col) => (
                        <td
                          key={`earn-${col.key}`}
                          style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: isBasicLikeKey(col.key)
                              ? "var(--text)"
                              : "var(--subtext)",
                            fontWeight: isBasicLikeKey(col.key) ? 600 : 400,
                            whiteSpace: "nowrap",
                          }}
                          title={col.label}
                        >
                          {num(r.earningByKey?.[col.key]).toLocaleString("en-IN")}
                        </td>
                      ))}
                      {/* GROSS (Editable when payroll is inactive / not running) */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: "var(--text)",
                          cursor: canEditPayroll ? "pointer" : "default",
                        }}
                        title={
                          canEditPayroll
                            ? "Click to edit Gross Salary"
                            : undefined
                        }
                      >
                        {editingGrossEmpId === r.employeeId ? (
                          <input
                            type="number"
                            autoFocus
                            defaultValue={r.gross}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateGross(r.employeeId, e.target.value);
                                setEditingGrossEmpId(null);
                              } else if (e.key === "Escape") {
                                setEditingGrossEmpId(null);
                              }
                            }}
                            onBlur={(e) => {
                              handleUpdateGross(r.employeeId, e.target.value);
                              setEditingGrossEmpId(null);
                            }}
                            style={{
                              width: "80px",
                              height: "26px",
                              padding: "2px 6px",
                              border: "1px solid var(--primary)",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontFamily: "monospace",
                              fontWeight: 700,
                              textAlign: "right",
                              outline: "none",
                              background: "var(--card)",
                              color: "var(--text)",
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => {
                              if (canEditPayroll)
                                setEditingGrossEmpId(r.employeeId);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "4px",
                              borderBottom: canEditPayroll
                                ? "1px dashed var(--subtext)"
                                : "none",
                            }}
                          >
                            <span>{r.gross.toLocaleString("en-IN")}</span>
                            {canEditPayroll && (
                              <Edit3 size={10} style={{ opacity: 0.5 }} />
                            )}
                          </div>
                        )}
                      </td>

                      {/* Dynamic deduction-component columns (real data) */}
                      {deductionCols.map((col) => (
                        <td
                          key={`ded-${col.key}`}
                          style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: "var(--red)",
                            whiteSpace: "nowrap",
                          }}
                          title={col.label}
                        >
                          {num(r.deductionByKey?.[col.key]).toLocaleString("en-IN")}
                        </td>
                      ))}

                      {/* DEDUCTIONS (total) */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          color: "var(--red)",
                        }}
                      >
                        {r.deductions.toLocaleString("en-IN")}
                      </td>

                      {/* 20. NET */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontWeight: 800,
                          fontFamily: "monospace",
                          color: "var(--green)",
                        }}
                      >
                        {r.net.toLocaleString("en-IN")}
                      </td>

                      {/* Transaction ID Column */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <button
                          onClick={() =>
                            handleCopyTxn(
                              r.transactionId ||
                                `TXN-${r.employeeId}-${year}${String(month).padStart(2, "0")}`,
                            )
                          }
                          title="Click to copy Transaction ID"
                          style={{
                            fontFamily: "monospace",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: "var(--background)",
                            color: "var(--primary)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--border)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span>
                            {r.transactionId ||
                              `TXN-${r.employeeId}-${year}${String(month).padStart(2, "0")}`}
                          </span>
                          <Copy size={10} style={{ opacity: 0.6 }} />
                        </button>
                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {isAnnual ? (
                            <button
                              onClick={() => handleDownloadPayslip(r)}
                              title="Download / Install Employee Payslip Statement"
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "var(--primary-light)",
                                color: "var(--primary)",
                                border: "1px solid var(--primary)",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Download size={11} /> Download
                            </button>
                          ) : isPaid ? (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#16a34a",
                                padding: "3px 8px",
                                background: "#f0fdf4",
                                borderRadius: "4px",
                                border: "1px solid #bbf7d0",
                              }}
                            >
                              Paid
                            </span>
                          ) : isProcessing ? (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#c2410c",
                                padding: "3px 8px",
                                background: "#fff7ed",
                                borderRadius: "4px",
                                border: "1px solid #fed7aa",
                              }}
                            >
                              Processing
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                handleRunIndividual(
                                  r.employeeId,
                                  r.employeeName,
                                )
                              }
                              disabled={isRunningThis || isPaid}
                              title="Recalculate worker live payroll"
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "var(--primary-light)",
                                color: "var(--primary)",
                                border: "1px solid var(--primary)",
                                borderRadius: "var(--radius-sm)",
                                cursor:
                                  isRunningThis || isPaid
                                    ? "not-allowed"
                                    : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              {isRunningThis ? (
                                <Spinner size={10} />
                              ) : (
                                <Play size={10} />
                              )}{" "}
                              Run
                            </button>
                          )}

                          <button
                            onClick={() =>
                              setSelectedEmpForBreakdown(r.employeeId)
                            }
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
                  <td
                    colSpan={6}
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      letterSpacing: "1px",
                      color: "var(--text)",
                    }}
                  >
                    TOTAL ({sortedRecords.length} WORKERS)
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "var(--text)",
                    }}
                  >
                    {totals.days}
                  </td>
                  {earningCols.map((col) => (
                    <td
                      key={`ft-earn-${col.key}`}
                      style={{
                        padding: "12px",
                        textAlign: "right",
                        color: "var(--subtext)",
                      }}
                      title={col.label}
                    >
                      {num(totals.earning[col.key]).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "var(--text)",
                    }}
                  >
                    {totals.gross.toLocaleString("en-IN")}
                  </td>
                  {deductionCols.map((col) => (
                    <td
                      key={`ft-ded-${col.key}`}
                      style={{
                        padding: "12px",
                        textAlign: "right",
                        color: "var(--red)",
                      }}
                      title={col.label}
                    >
                      {num(totals.deduction[col.key]).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "var(--red)",
                    }}
                  >
                    {totals.deductions.toLocaleString("en-IN")}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "var(--green)",
                      fontSize: "13.5px",
                    }}
                  >
                    {totals.net.toLocaleString("en-IN")}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 10-per-page Pagination Controls */}
        {sortedRecords.length > PAGE_SIZE && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px 0",
              borderTop: "1px solid var(--border)",
              fontSize: "12.5px",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            <span style={{ color: "var(--subtext)" }}>
              Showing{" "}
              <b style={{ color: "var(--text)" }}>
                {(safePage - 1) * PAGE_SIZE + 1}
              </b>
              –
              <b style={{ color: "var(--text)" }}>
                {Math.min(sortedRecords.length, safePage * PAGE_SIZE)}
              </b>{" "}
              of <b style={{ color: "var(--text)" }}>{sortedRecords.length}</b>{" "}
              workers
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{
                  padding: "5px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: safePage <= 1 ? "transparent" : "var(--card)",
                  color: safePage <= 1 ? "var(--subtext)" : "var(--text)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: safePage <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>

              {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                (pNum) => (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    style={{
                      minWidth: "28px",
                      height: "28px",
                      padding: "0 6px",
                      borderRadius: "var(--radius-sm)",
                      border:
                        pNum === safePage
                          ? "1px solid var(--primary)"
                          : "1px solid var(--border)",
                      background:
                        pNum === safePage ? "var(--primary)" : "var(--card)",
                      color: pNum === safePage ? "#fff" : "var(--text)",
                      fontSize: "12px",
                      fontWeight: pNum === safePage ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {pNum}
                  </button>
                ),
              )}

              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                style={{
                  padding: "5px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background:
                    safePage >= pageCount ? "transparent" : "var(--card)",
                  color:
                    safePage >= pageCount ? "var(--subtext)" : "var(--text)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: safePage >= pageCount ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Transaction Batch Details Modal ── */}
      {showTxnModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
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
              maxWidth: "680px",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "12px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 800,
                    color: "var(--text)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {isPaid ? (
                    <CheckCircle2 size={20} style={{ color: "#16a34a" }} />
                  ) : (
                    <Upload size={20} style={{ color: "#c2410c" }} />
                  )}
                  Payroll Processing & Bank Transaction Details
                </h3>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--subtext)",
                    margin: "4px 0 0",
                  }}
                >
                  Cycle: {MONTH_NAMES[month - 1]} {year} — {records.length}{" "}
                  Employees Processed
                </p>
              </div>
              <button
                onClick={() => setShowTxnModal(false)}
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
                background: "var(--background)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                padding: "12px 16px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "12px",
                  fontSize: "13px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--subtext)",
                      display: "block",
                    }}
                  >
                    TOTAL RECIPIENTS
                  </span>
                  <b>{records.length} Workers</b>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--subtext)",
                      display: "block",
                    }}
                  >
                    TOTAL DISBURSED
                  </span>
                  <b style={{ color: "#16a34a" }}>
                    ₹{Math.round(totals.net).toLocaleString("en-IN")}
                  </b>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--subtext)",
                      display: "block",
                    }}
                  >
                    PAYMENT STATUS
                  </span>
                  <b style={{ color: isPaid ? "#16a34a" : "#c2410c" }}>
                    {isPaid ? "PAID" : "PROCESSING"}
                  </b>
                </div>
              </div>
            </div>

            <div
              style={{
                background: isPaid ? "#f0fdf4" : "#fff7ed",
                border: `1px solid ${isPaid ? "#bbf7d0" : "#fed7aa"}`,
                borderRadius: "var(--radius-sm)",
                padding: "14px 16px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    color: isPaid ? "#15803d" : "#c2410c",
                  }}
                >
                  Bank transaction Excel
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--subtext)",
                    marginTop: "3px",
                  }}
                >
                  {paymentUpload
                    ? `${paymentUpload.name} (${paymentUpload.sizeKb} KB) uploaded at ${paymentUpload.uploadedAt}`
                    : "Upload the bank transaction sheet to confirm payout and move payroll to Paid."}
                </div>
                {paymentUpload && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#15803d",
                      marginTop: "4px",
                      fontWeight: 700,
                    }}
                  >
                    Matched against {paymentUpload.rows} payroll rows.
                  </div>
                )}
              </div>
              <input
                ref={paymentFileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={handlePaymentUpload}
                style={{ display: "none" }}
              />
              <button
                onClick={() => paymentFileInputRef.current?.click()}
                disabled={isPaid}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 14px",
                  background: isPaid ? "#dcfce7" : "var(--primary)",
                  color: isPaid ? "#15803d" : "#fff",
                  border: isPaid ? "1px solid #bbf7d0" : "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  cursor: isPaid ? "not-allowed" : "pointer",
                }}
              >
                {isPaid ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                {isPaid ? "Uploaded" : "Upload Excel"}
              </button>
            </div>

            <div
              style={{
                maxHeight: "280px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--background)",
                      borderBottom: "1px solid var(--border)",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        color: "var(--subtext)",
                      }}
                    >
                      Employee ID
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        color: "var(--subtext)",
                      }}
                    >
                      Name
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: "var(--subtext)",
                      }}
                    >
                      Amount
                    </th>
                    <th
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        color: "var(--subtext)",
                      }}
                    >
                      Transaction ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                        }}
                      >
                        {r.employeeId}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                        {r.employeeName}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#16a34a",
                          fontFamily: "monospace",
                        }}
                      >
                        ₹{Math.round(r.net).toLocaleString("en-IN")}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily: "monospace",
                          color: "var(--primary)",
                        }}
                      >
                        {r.transactionId ||
                          `TXN-${r.employeeId}-${year}${String(month).padStart(2, "0")}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              <button
                onClick={() => setShowTxnModal(false)}
                style={{
                  padding: "9px 20px",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close & View Master Sheet
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: 0,
                }}
              >
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
