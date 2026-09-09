/**
 * Attendance Page
 * Module 5 — Attendance & Time
 * Features: summary stat cards, monthly record table, check-in/check-out, status badges
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, UserCheck, UserX, Coffee, Home, Upload, RotateCcw } from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import { getMyAttendance, getTeamSummary, checkIn, checkOut, uploadAttendanceFile } from "../../services/attendanceService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { attendanceStatusMeta } from "../../mock/attendance.js";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [year, setYear]       = useState(now.getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef(null);

  // Backend emits "Leave" for approved leave punches; map it onto the display
  // meta key (attendanceStatusMeta uses "On Leave").
  const STATUS_META_ALIAS = { Leave: "On Leave" };

  // Load the user's own records + the team summary for the selected period.
  // Re-run after uploads / check-in / check-out so cards, chips and the table
  // always reflect the latest attendance data.
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // Staff see the whole team's monthly attendance; employees only their own.
      const isStaff = user.role !== "EMPLOYEE";
      const [recRes, sumRes] = await Promise.all([
        getMyAttendance({ month, year, ...(isStaff ? {} : { employeeId: user.id }) }),
        getTeamSummary({ month, year }),
      ]);
      setRecords(recRes.data);
      setSummary(sumRes.data);
    } catch {
      // Leave current data as-is on error.
    } finally {
      setLoading(false);
    }
  }, [user.id, user.role, month, year]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleCheckIn = async () => {
    setChecking(true);
    try {
      await checkIn(user.id);
      setCheckedIn(true);
      await loadDashboard();
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOut = async () => {
    setChecking(true);
    try {
      await checkOut(user.id);
      setCheckedIn(false);
      await loadDashboard();
    } finally {
      setChecking(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const result = await uploadAttendanceFile(file);
      const rows = Array.isArray(result?.data) ? result.data : [];
      setUploadedRecords((prev) => [...rows, ...prev.filter((r) => !rows.some((u) => u.employeeId === r.employeeId && u.date === r.date))]);
      setPage(1);
      // Jump the period dropdowns to the data's latest month/year so the
      // uploaded rows are visible immediately (not just the "recent" month).
      const dates = rows.map((r) => String(r.date || ""));
      const latest = dates.filter(Boolean).sort().pop();
      if (latest) { setYear(ymOf(latest).y || year); setMonth(ymOf(latest).m || month); }
      const imported = result?.imported ?? rows.length;
      const skipped = result?.skipped ?? 0;
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      await loadDashboard();
      setUploadMsg({
        ok: true,
        text: `Imported ${imported} record${imported === 1 ? "" : "s"}${skipped ? `, ${skipped} skipped` : ""}${errors.length ? ` — ${errors[0]}` : ""}`,
      });
    } catch (err) {
      setUploadMsg({ ok: false, text: err.message || "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const ymOf = (date) => {
    const s = String(date || "");
    return { y: Number(s.slice(0, 4)) || 0, m: Number(s.slice(5, 7)) || 0 };
  };

  const displayRecords = [
    // Uploaded rows are shown only for the period selected in the dropdowns,
    // so previous-month data becomes visible by choosing that month.
    ...uploadedRecords.filter((r) => { const { y, m } = ymOf(r.date); return y === year && m === month; }).map((r) => ({ ...r, __uploaded: true })),
    ...records.filter((r) => !uploadedRecords.some((u) => u.employeeId === r.employeeId && u.date === r.date)),
  ];

  const countStatus = (s) => displayRecords.filter((r) => r.status === s).length;

  // Pagination — 100 rows per page.
  const PAGE_SIZE = 100;
  const pageCount = Math.max(1, Math.ceil(displayRecords.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedRecords = displayRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
          <PageHeader title="Attendance" subtitle={`${MONTHS[month-1]} ${year} — My attendance log`} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
                onClick={() => { setUploadedRecords([]); setPage(1); setUploadMsg(null); }}
                style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 20px", background: "var(--card)", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}
              >
                <RotateCcw size={16} />
                Clear Upload
              </button>
            <button
              id={checkedIn ? "check-out-btn" : "check-in-btn"}
              onClick={checkedIn ? handleCheckOut : handleCheckIn}
              disabled={checking}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 20px",
                background: checkedIn ? "var(--red-light)" : "var(--primary)",
                color: checkedIn ? "var(--red)" : "#fff",
                border: checkedIn ? "1px solid var(--red)" : "none",
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

        {uploadMsg && (
          <div
            style={{
              marginBottom: "16px", padding: "10px 14px", borderRadius: "var(--radius-sm)",
              fontSize: "12.5px", fontWeight: 600,
              background: uploadMsg.ok ? "var(--green-light, #f0fdf4)" : "var(--red-light)",
              color: uploadMsg.ok ? "#16a34a" : "var(--red)",
              border: `1px solid ${uploadMsg.ok ? "#bbf7d0" : "var(--red)"}`,
            }}
          >
            {uploadMsg.text}
          </div>
        )}

        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "24px" }}>
            <StatCard icon={UserCheck} label="Present"     value={summary.present} color="#16a34a" bg="#f0fdf4" />
            <StatCard icon={Home}      label="WFH"          value={summary.wfh}     color="#0284c7" bg="#f0f9ff" />
            <StatCard icon={Clock}     label="Late"         value={summary.late}    color="#d97706" bg="#fffbeb" />
            <StatCard icon={UserX}     label="Absent"       value={summary.absent}  color="#dc2626" bg="#fef2f2" />
            <StatCard icon={Coffee}    label="On Leave"     value={summary.onLeave} color="#7c3aed" bg="#f5f3ff" />
          </div>
        )}

        {/* Month / year picker + status summary chips */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
          <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
            style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--card)", outline: "none", cursor: "pointer" }}>
            {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
            style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", background: "var(--card)", outline: "none", cursor: "pointer" }}>
            {[...new Set([2024,2025,2026, ...uploadedRecords.map((r) => ymOf(r.date).y).filter(Boolean)])].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {["Present","Late","Absent","WFH","Leave"].map((s) => {
            const count = countStatus(s);
            if (!count) return null;
            const display = STATUS_META_ALIAS[s] || s;
            const meta = attendanceStatusMeta[display] || attendanceStatusMeta["Present"];
            return (
              <span key={s} style={{ fontSize: "11px", fontWeight: 600, color: meta?.color, background: meta?.bg, padding: "3px 10px", borderRadius: "99px" }}>
                {display}: {count}
              </span>
            );
          })}
        </div>

        {/* Records table */}
        <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
          {loading ? (
            <Spinner />
          ) : displayRecords.length === 0 ? (
            <EmptyState title="No records for this month" subtitle="Select a different month or year, or upload an attendance file." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Employee","ID","Date","Login Time","Logout Time","Leave","Status","Hours Worked"].map((h) => (
                      <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.map((r, i) => {
                    const meta = attendanceStatusMeta[STATUS_META_ALIAS[r.status] || r.status] || attendanceStatusMeta["Present"];
                    return (
                      <tr key={r.__uploaded ? `up-${r.employeeId}-${r.date}` : r.id} style={{ borderBottom: i < pagedRecords.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {r.employeeName || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--subtext)", fontFamily: "monospace" }}>
                          {r.employeeId || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {formatFullDate(r.date)}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: r.checkIn ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>
                          {r.checkIn || "—"}
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: r.checkOut ? "var(--text)" : "var(--subtext)", fontFamily: "monospace" }}>
                          {r.checkOut || "—"}
                        </td>
                        <td style={{ padding: "13px 18px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: r.leave === "Yes" ? "#ea580c" : "#16a34a", background: r.leave === "Yes" ? "#fff7ed" : "#f0fdf4", padding: "2px 10px", borderRadius: "99px" }}>
                            {r.leave || "No"}
                          </span>
                        </td>
                        <td style={{ padding: "13px 18px" }}>
                          <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} />
                        </td>
                        <td style={{ padding: "13px 18px", fontSize: "13.5px", color: r.hoursWorked > 0 ? "var(--text)" : "var(--subtext)" }}>
                          {r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {displayRecords.length > PAGE_SIZE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--subtext)" }}>
                Showing {Math.min(displayRecords.length, (safePage - 1) * PAGE_SIZE + 1)}–{Math.min(displayRecords.length, safePage * PAGE_SIZE)} of {displayRecords.length}
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
