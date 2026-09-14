/**
 * Attendance Page
 * Module 5 — Attendance & Time
 * Features: summary stat cards, monthly record table, check-in/check-out, status badges,
 *           mapped production units, search, filtering, and multi-column sorting.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, UserCheck, UserX, Coffee, Home, Upload, RotateCcw,
  Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, Factory, Briefcase,
  Coins, Building2
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import { getMyAttendance, checkIn, checkOut, uploadAttendanceFile, clearUploadedAttendance } from "../../services/attendanceService.js";
import { getProductionRecords, getContractors } from "../../services/payrollService.js";
import { getDepartments } from "../../services/Orgmanagementservice.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { attendanceStatusMeta } from "../../mock/attendance.js";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const UPLOAD_STORAGE_KEY = "hrms_uploaded_attendance";
const PERIOD_STORAGE_KEY = "hrms_attendance_period";

const readStorage = (key) => {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

const formatFullDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS_FULL[d.getMonth()]}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
};

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "18px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius)", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</p>
        <p style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{value}</p>
      </div>
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const now = new Date();
  const storedPeriod = readStorage(PERIOD_STORAGE_KEY) || {};
  const [month, setMonth]     = useState(Number.isInteger(storedPeriod.month) ? storedPeriod.month : 0);
  const [day, setDay]         = useState(Number.isInteger(storedPeriod.day) ? storedPeriod.day : 0);
  const [year, setYear]       = useState(Number.isInteger(storedPeriod.year) ? storedPeriod.year : now.getFullYear());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [uploadedRecords, setUploadedRecords] = useState(() => {
    const stored = readStorage(UPLOAD_STORAGE_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef(null);

  const navigate = useNavigate();
  // Dynamic Production Records & Contractors mapping
  const [productionRecords, setProductionRecords] = useState([]);
  const [contractorsList, setContractorsList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);

  // Search, Filter & Sort State
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterContractor, setFilterContractor] = useState("ALL");
  const [filterDepartment, setFilterDepartment] = useState("ALL");
  const [filterSkillTier, setFilterSkillTier] = useState("ALL");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  const STATUS_META_ALIAS = { Leave: "On Leave" };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const isStaff = user.role !== "EMPLOYEE";
      const recRes = await getMyAttendance({ day, month, year, ...(isStaff ? {} : { employeeId: user.id }) });
      setRecords(recRes.data || []);
    } catch {
      // Leave current data as-is on error.
    } finally {
      setLoading(false);
    }
  }, [user.id, user.role, day, month, year]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Fetch production records, contractor assignments, and departments dynamically
  useEffect(() => {
    getProductionRecords({ month: month || undefined, year })
      .then((res) => setProductionRecords(res.data || []))
      .catch(() => {});

    getContractors()
      .then((res) => setContractorsList(res.data || []))
      .catch(() => {});

    getDepartments()
      .then((res) => setDepartmentsList(res.data || []))
      .catch(() => {});
  }, [month, year]);

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify({ month, day, year }));
    } catch {
      // Ignore
    }
  }, [month, day, year]);

  // Production lookup map by employee ID, code, or name
  const productionMap = useMemo(() => {
    const map = {};
    productionRecords.forEach((pr) => {
      if (pr.employeeId) map[pr.employeeId] = pr;
      if (pr.employeeCode) map[pr.employeeCode] = pr;
      if (pr.employeeName) map[pr.employeeName.toLowerCase().trim()] = pr;
    });
    return map;
  }, [productionRecords]);

  // Contractor lookup by contractor ID
  const contractorMap = useMemo(() => {
    const map = {};
    contractorsList.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [contractorsList]);

  const handleCheckInOut = async () => {
    setChecking(true);
    try {
      if (checkedIn) {
        await checkOut(user.id);
        setCheckedIn(false);
      } else {
        await checkIn(user.id);
        setCheckedIn(true);
      }
      await loadDashboard();
    } catch {
      // Handle error
    } finally {
      setChecking(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await uploadAttendanceFile(file);
      const rows = res.data || [];
      const updated = [...rows, ...uploadedRecords.filter((u) => !rows.some((r) => r.employeeId === u.employeeId && r.date === u.date))];
      setUploadedRecords(updated);
      try {
        localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      await loadDashboard();
      setUploadMsg({ ok: true, text: `Successfully imported ${res.imported || rows.length} attendance rows!` });
    } catch (err) {
      setUploadMsg({ ok: false, text: err.message || "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearUpload = async () => {
    if (!window.confirm("Clear all uploaded attendance data?")) return;
    setUploading(true);
    try {
      await clearUploadedAttendance();
      setUploadedRecords([]);
      setRecords([]);
      setPage(1);
      try {
        localStorage.removeItem(UPLOAD_STORAGE_KEY);
      } catch {
        // Ignore
      }
      setUploadMsg({ ok: true, text: "Cleared uploaded attendance data" });
      await loadDashboard();
    } catch (err) {
      setUploadMsg({ ok: false, text: err.message || "Clear failed" });
    } finally {
      setUploading(false);
    }
  };

  const ymOf = (date) => {
    const s = String(date || "");
    return { y: Number(s.slice(0, 4)) || 0, m: Number(s.slice(5, 7)) || 0 };
  };

  const rawDisplayRecords = useMemo(() => {
    return [
      ...uploadedRecords.filter((r) => {
        const { y, m } = ymOf(r.date);
        const d = Number(String(r.date || "").slice(8, 10)) || 0;
        return y === year && (month === 0 || m === month) && (day === 0 || d === day);
      }).map((r) => ({ ...r, __uploaded: true })),
      ...records.filter((r) => !uploadedRecords.some((u) => u.employeeId === r.employeeId && u.date === r.date)),
    ];
  }, [uploadedRecords, records, year, month, day]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortOrder === "asc" ? <ArrowUp size={12} style={{ color: "var(--primary)" }} /> : <ArrowDown size={12} style={{ color: "var(--primary)" }} />;
  };

  // Search, Filter & Sort
  const processedRecords = useMemo(() => {
    let list = [...rawDisplayRecords];

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((r) => {
        const name = (r.employeeName || "").toLowerCase();
        const code = (r.employeeId || "").toLowerCase();
        const contractor = (contractorMap[r.contractorId] || "").toLowerCase();
        return name.includes(q) || code.includes(q) || contractor.includes(q);
      });
    }

    // Status filter
    if (filterStatus !== "ALL") {
      list = list.filter((r) => (STATUS_META_ALIAS[r.status] || r.status) === filterStatus);
    }

    // Contractor filter
    if (filterContractor !== "ALL") {
      if (filterContractor === "DIRECT") {
        list = list.filter((r) => !r.contractorId);
      } else {
        list = list.filter((r) => r.contractorId === filterContractor);
      }
    }

    // Department filter
    if (filterDepartment !== "ALL") {
      list = list.filter((r) => r.department === filterDepartment || r.departmentName === filterDepartment || r.departmentId === filterDepartment);
    }

    // Skill Tier filter
    if (filterSkillTier !== "ALL") {
      list = list.filter((r) => (r.skillTier || r.skillType || "Skilled").toLowerCase() === filterSkillTier.toLowerCase());
    }

    // Sorting
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === "employeeName") {
        valA = (a.employeeName || "").toLowerCase();
        valB = (b.employeeName || "").toLowerCase();
      } else if (sortField === "employeeId") {
        valA = (a.employeeId || "").toLowerCase();
        valB = (b.employeeId || "").toLowerCase();
      } else if (sortField === "date") {
        valA = new Date(a.date || 0).getTime();
        valB = new Date(b.date || 0).getTime();
      } else if (sortField === "status") {
        valA = (a.status || "").toLowerCase();
        valB = (b.status || "").toLowerCase();
      } else if (sortField === "hoursWorked") {
        valA = Number(a.hoursWorked || 0);
        valB = Number(b.hoursWorked || 0);
      } else if (sortField === "overtime") {
        valA = Number(a.hoursWorked || 0) > 8 ? Number(a.hoursWorked || 0) - 8 : 0;
        valB = Number(b.hoursWorked || 0) > 8 ? Number(b.hoursWorked || 0) - 8 : 0;
      } else if (sortField === "unitsProduced") {
        const prodA = productionMap[a.employeeId] || productionMap[a.employeeName?.toLowerCase()] || null;
        const prodB = productionMap[b.employeeId] || productionMap[b.employeeName?.toLowerCase()] || null;
        valA = Number(prodA?.unitsProduced || 0);
        valB = Number(prodB?.unitsProduced || 0);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [rawDisplayRecords, search, filterStatus, filterContractor, filterDepartment, filterSkillTier, sortField, sortOrder, productionMap, contractorMap]);

  const countStatus = (s) => rawDisplayRecords.filter((r) => (STATUS_META_ALIAS[r.status] || r.status) === s).length;
  const periodLabel = month === 0 ? "All months" : `${MONTHS[month - 1]}${day === 0 ? "" : ` ${day}`}`;

  // Pagination — 100 rows per page
  const PAGE_SIZE = 100;
  const pageCount = Math.max(1, Math.ceil(processedRecords.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedRecords = processedRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
          <PageHeader title="Attendance & Factory Output" subtitle={`${periodLabel} ${year} — Workforce attendance, production mapping & shift logs`} />
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              id="reconcile-payroll-btn"
              onClick={() => navigate(`/payroll?month=${month || 9}&year=${year}`)}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                color: "#fff", border: "none",
                borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "13.5px",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(5,150,105,0.25)",
              }}
            >
              <Coins size={16} />
              Reconcile & View in Payroll
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xltx,.xltm,.xlam,.xlsb,.xls,.xlt,.xla,.xlw,.csv,.tsv,.txt,.prn,.dif,.slk,.xml" style={{ display: "none" }} onChange={handleUpload} />
            <button
              id="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 20px",
                background: "var(--card)",
                color: "var(--primary)",
                border: "1px solid var(--primary)",
                borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "13.5px",
                cursor: uploading ? "not-allowed" : "pointer",
                opacity: uploading ? 0.7 : 1,
              }}
            >
              <Upload size={16} />
              {uploading ? "Importing…" : "Upload"}
            </button>
            <button
              id="clear-upload-btn"
              onClick={handleClearUpload}
              disabled={uploading}
              style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 20px", background: "var(--card)", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "13.5px", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.7 : 1 }}
            >
              <RotateCcw size={16} />
              {uploading ? "Clearing…" : "Clear Upload"}
            </button>
            <button
              id={checkedIn ? "check-out-btn" : "check-in-btn"}
              onClick={handleCheckInOut}
              disabled={checking}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 22px",
                background: checkedIn ? "var(--red)" : "var(--primary)",
                color: "#fff", border: "none",
                borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "13.5px",
                cursor: checking ? "not-allowed" : "pointer",
                opacity: checking ? 0.7 : 1,
              }}
            >
              <Clock size={16} />
              {checking ? "Processing…" : checkedIn ? "Check Out" : "Check In"}
            </button>
          </div>
        </div>

        {/* Upload feedback banner */}
        {uploadMsg && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "var(--radius)", background: uploadMsg.ok ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)", border: `1px solid ${uploadMsg.ok ? "#86efac" : "#fca5a5"}`, color: uploadMsg.ok ? "#15803d" : "#b91c1c", fontSize: "13.5px", fontWeight: 600 }}>
            {uploadMsg.text}
          </div>
        )}

        {/* KPI Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <StatCard icon={UserCheck} label="Present" value={countStatus("Present")} color="var(--green, #16a34a)" bg="rgba(22,163,74,0.1)" />
          <StatCard icon={UserX} label="Absent" value={countStatus("Absent")} color="var(--red, #dc2626)" bg="rgba(220,38,38,0.1)" />
          <StatCard icon={Coffee} label="On Leave" value={countStatus("On Leave")} color="var(--amber, #d97706)" bg="rgba(217,119,6,0.1)" />
          <StatCard icon={Factory} label="Production Mapped" value={productionRecords.length} color="var(--primary)" bg="rgba(99,102,241,0.1)" />
        </div>

        {/* Search, Date Filter & Status Filter Bar */}
        <div style={{ background: "var(--card)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "14px 18px", marginBottom: "18px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Real-time search */}
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)" }} />
            <input
              type="text"
              placeholder="Search employee, ID, contractor…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ width: "100%", height: "36px", paddingLeft: "32px", paddingRight: "10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none" }}
            />
          </div>

          {/* Month / Day / Year dropdowns */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
              style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}>
              <option value={0}>All Months</option>
              {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
            <select value={day} onChange={(e) => { setDay(Number(e.target.value)); setPage(1); }}
              style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}>
              <option value={0}>All Days</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
              style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}>
              {[...new Set([2024,2025,2026, ...uploadedRecords.map((r) => ymOf(r.date).y).filter(Boolean)])].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}
            >
              <option value="ALL">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="WFH">WFH</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>

          {/* Department Filter */}
          {departmentsList.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Dept:</span>
              <select
                value={filterDepartment}
                onChange={(e) => { setFilterDepartment(e.target.value); setPage(1); }}
                style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}
              >
                <option value="ALL">All Depts</option>
                {departmentsList.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Skill Tier Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Tier:</span>
            <select
              value={filterSkillTier}
              onChange={(e) => { setFilterSkillTier(e.target.value); setPage(1); }}
              style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}
            >
              <option value="ALL">All Tiers</option>
              <option value="Skilled">Skilled</option>
              <option value="Semi-Skilled">Semi-Skilled</option>
              <option value="Unskilled">Unskilled</option>
            </select>
          </div>

          {/* Contractor Filter */}
          {contractorsList.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Workforce:</span>
              <select
                value={filterContractor}
                onChange={(e) => { setFilterContractor(e.target.value); setPage(1); }}
                style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--background)", color: "var(--text)", outline: "none", cursor: "pointer" }}
              >
                <option value="ALL">All Workforce</option>
                <option value="DIRECT">Direct Company Staff</option>
                {contractorsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {(search || filterStatus !== "ALL" || filterContractor !== "ALL" || filterDepartment !== "ALL" || filterSkillTier !== "ALL") && (
            <button
              onClick={() => { setSearch(""); setFilterStatus("ALL"); setFilterContractor("ALL"); setFilterDepartment("ALL"); setFilterSkillTier("ALL"); setPage(1); }}
              style={{ padding: "6px 12px", background: "transparent", color: "var(--primary)", border: "1px solid var(--primary-light)", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Records table */}
        <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
          {loading ? (
            <Spinner />
          ) : processedRecords.length === 0 ? (
            <EmptyState title="No records found for the selected filter/period" subtitle="Select a different period, reset filters, or upload an attendance file." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    <th
                      onClick={() => handleSort("employeeName")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        Employee {renderSortIcon("employeeName")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("employeeId")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        ID {renderSortIcon("employeeId")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("date")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        Date {renderSortIcon("date")}
                      </div>
                    </th>
                    <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                      Login Time
                    </th>
                    <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                      Logout Time
                    </th>
                    <th
                      onClick={() => handleSort("status")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        Status {renderSortIcon("status")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("hoursWorked")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        Hours {renderSortIcon("hoursWorked")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("overtime")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        OT (Overtime) {renderSortIcon("overtime")}
                      </div>
                    </th>
                    {/* Production Units Mapped with Production Records */}
                    <th
                      onClick={() => handleSort("unitsProduced")}
                      style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", background: "rgba(99, 102, 241, 0.05)" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Factory size={13} /> Production {renderSortIcon("unitsProduced")}
                      </div>
                    </th>
                    {/* Contractor / Workforce Tag */}
                    <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                      Source
                    </th>
                    {/* Direct link to Payroll Reconciliation */}
                    <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                      Payroll Link
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.map((r, i) => {
                    const meta = attendanceStatusMeta[STATUS_META_ALIAS[r.status] || r.status] || attendanceStatusMeta["Present"];
                    // Dynamic production output mapping
                    const prod = productionMap[r.employeeId] || productionMap[r.employeeName?.toLowerCase().trim()] || null;
                    const contractorName = contractorMap[r.contractorId] || (r.contractorId ? "Contractor Worker" : "Direct Staff");

                    return (
                      <tr key={r.__uploaded ? `up-${r.employeeId}-${r.date}` : r.id || `${r.employeeId}-${r.date}-${i}`} style={{ borderBottom: i < pagedRecords.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.employeeName || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13px", color: "var(--subtext)", fontFamily: "monospace" }}>
                          {r.employeeId || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13px", color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {formatFullDate(r.date)}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13px", color: r.checkIn ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>
                          {r.checkIn || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13px", color: r.checkOut ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>
                          {r.checkOut || "—"}
                        </td>
                        <td style={{ padding: "13px 18px" }}>
                          <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} />
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13px", color: r.hoursWorked > 0 ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>
                          {r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}
                        </td>

                        {/* Overtime cell */}
                        <td style={{ padding: "13px 18px", fontFamily: "monospace" }}>
                          {r.hoursWorked > 8 ? (
                            <span style={{ fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "rgba(217, 119, 6, 0.12)", color: "#d97706", border: "1px solid rgba(217, 119, 6, 0.3)" }}>
                              +{(r.hoursWorked - 8).toFixed(1)}h OT
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--subtext)" }}>—</span>
                          )}
                        </td>

                        {/* Production Output Column */}
                        <td style={{ padding: "13px 18px", background: "rgba(99, 102, 241, 0.02)" }}>
                          {prod ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontSize: "13.5px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>
                                {Number(prod.unitsProduced).toLocaleString("en-IN")} units
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontSize: "10.5px", color: "var(--subtext)" }}>Target: {prod.targetUnits || 1000}</span>
                                <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "99px", background: (prod.unitsProduced >= (prod.targetUnits || 1000)) ? "#f0fdf4" : "#fef3c7", color: (prod.unitsProduced >= (prod.targetUnits || 1000)) ? "#16a34a" : "#d97706" }}>
                                  {Math.round((prod.unitsProduced / (prod.targetUnits || 1000)) * 100)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--subtext)" }}>—</span>
                          )}
                        </td>

                        {/* Contractor Tag */}
                        <td style={{ padding: "13px 18px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: r.contractorId ? "rgba(139, 92, 246, 0.1)" : "var(--background)",
                              border: "1px solid var(--border)",
                              color: r.contractorId ? "#7c3aed" : "var(--subtext)",
                            }}
                          >
                            {contractorName}
                          </span>
                        </td>

                        {/* Reconcile in Payroll Action Link */}
                        <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/payroll?employeeId=${r.employeeId}&month=${month || ymOf(r.date).m || 9}&year=${year}`)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "5px",
                              padding: "5px 11px", background: "rgba(5, 150, 105, 0.08)",
                              border: "1px solid rgba(5, 150, 105, 0.3)", borderRadius: "4px",
                              fontSize: "12px", fontWeight: 700, color: "#059669", cursor: "pointer",
                            }}
                            title={`Reconcile ${r.employeeName || r.employeeId} in Payroll`}
                          >
                            <Coins size={13} /> View in Payroll
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {processedRecords.length > PAGE_SIZE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--subtext)" }}>
                Showing {Math.min(processedRecords.length, (safePage - 1) * PAGE_SIZE + 1)}–{Math.min(processedRecords.length, safePage * PAGE_SIZE)} of {processedRecords.length}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{ padding: "6px 14px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, cursor: safePage === 1 ? "not-allowed" : "pointer", opacity: safePage === 1 ? 0.5 : 1 }}
              >
                Prev
              </button>
              <span style={{ fontSize: 12, color: "var(--text)" }}>Page {safePage} / {pageCount}</span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage === pageCount}
                style={{ padding: "6px 14px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, cursor: safePage === pageCount ? "not-allowed" : "pointer", opacity: safePage === pageCount ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
