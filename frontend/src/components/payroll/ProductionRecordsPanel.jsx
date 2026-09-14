import { useState, useEffect, useMemo } from "react";
import { Plus, Factory, CheckCircle2, TrendingUp, Award, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { getProductionRecords, createProductionRecord, getPayrollComponentConfigs } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import { MONTHS_FULL } from "../../utils/payrollFormatters";

export default function ProductionRecordsPanel({ employees = [] }) {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [prodRule, setProdRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("ALL");
  const [selectedSkillFilter, setSelectedSkillFilter] = useState("ALL");
  const [sortField, setSortField] = useState("unitsProduced");
  const [sortOrder, setSortOrder] = useState("desc");

  // Form State
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [unitsProduced, setUnitsProduced] = useState("");
  const [targetUnits, setTargetUnits] = useState("1000");
  const [remarks, setRemarks] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const [res, compRes] = await Promise.all([
        getProductionRecords(),
        getPayrollComponentConfigs().catch(() => ({ data: [] })),
      ]);
      setRecords(res.data || []);
      const comps = compRes.data || [];
      const found = comps.find(
        (c) => c.code === "PROD_INC" || (c.name || "").toLowerCase().includes("production")
      );
      setProdRule(found || null);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load production logs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const calculateIncentivePreview = (units) => {
    const u = Number(units || 0);
    if (!prodRule) {
      return { amount: 0, slab: "Standard Rate" };
    }
    const slabs = Array.isArray(prodRule.slabs)
      ? prodRule.slabs
      : typeof prodRule.slabs === "string"
      ? JSON.parse(prodRule.slabs || "[]")
      : [];
    if (slabs.length > 0) {
      for (const s of slabs) {
        const sMin = Number(s.min || 0);
        const sMax = s.max !== undefined && s.max !== null && s.max !== "" ? Number(s.max) : Infinity;
        if (u >= sMin && u <= sMax) {
          const amt = Number(s.amount !== undefined ? s.amount : (s.value || 0));
          const label = s.name || `Tier (${sMin}${sMax < 99999 ? `-${sMax}` : "+"} units)`;
          return { amount: amt, slab: label };
        }
      }
    }
    if (prodRule.calcType === "fixed") {
      return { amount: Number(prodRule.value || 0), slab: "Fixed Rate" };
    }
    return { amount: 0, slab: "Below threshold (₹0)" };
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const units = parseInt(unitsProduced, 10);
    if (!employeeId) {
      toast("Please select a worker", "error");
      return;
    }
    if (isNaN(units) || units < 0) {
      toast("Please enter a valid units count", "error");
      return;
    }
    setSaving(true);
    try {
      await createProductionRecord({
        employeeId,
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        unitsProduced: units,
        targetUnits: targetUnits ? parseInt(targetUnits, 10) : 1000,
        remarks,
      });
      toast("Production record saved and incentive mapped dynamically!");
      setShowAddModal(false);
      setUnitsProduced("");
      setRemarks("");
      loadRecords();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to save production record", "error");
    } finally {
      setSaving(false);
    }
  };

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

  // Filtered & Sorted Records
  const processedRecords = useMemo(() => {
    let list = [...records];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const name = (r.employeeName || (r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "")).toLowerCase();
        const code = (r.employeeCode || r.employee?.employeeCode || "").toLowerCase();
        const dept = (r.department || "").toLowerCase();
        const rm = (r.remarks || "").toLowerCase();
        return name.includes(q) || code.includes(q) || dept.includes(q) || rm.includes(q);
      });
    }

    // Month filter
    if (selectedMonthFilter !== "ALL") {
      list = list.filter((r) => r.month === Number(selectedMonthFilter));
    }

    // Skill filter
    if (selectedSkillFilter !== "ALL") {
      list = list.filter((r) => String(r.skillType || "").toLowerCase() === selectedSkillFilter.toLowerCase());
    }

    // Sort
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === "employee") {
        valA = (a.employeeName || a.employee?.firstName || "").toLowerCase();
        valB = (b.employeeName || b.employee?.firstName || "").toLowerCase();
      } else if (sortField === "period") {
        valA = a.year * 100 + a.month;
        valB = b.year * 100 + b.month;
      } else if (sortField === "unitsProduced") {
        valA = Number(a.unitsProduced || 0);
        valB = Number(b.unitsProduced || 0);
      } else if (sortField === "targetUnits") {
        valA = Number(a.targetUnits || 1000);
        valB = Number(b.targetUnits || 1000);
      } else if (sortField === "achievementPct") {
        valA = a.targetUnits ? a.unitsProduced / a.targetUnits : 0;
        valB = b.targetUnits ? b.unitsProduced / b.targetUnits : 0;
      } else if (sortField === "incentive") {
        valA = calculateIncentivePreview(a.unitsProduced).amount;
        valB = calculateIncentivePreview(b.unitsProduced).amount;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [records, searchQuery, selectedMonthFilter, selectedSkillFilter, sortField, sortOrder]);

  const totalUnits = processedRecords.reduce((s, r) => s + Number(r.unitsProduced || 0), 0);
  const totalIncentives = processedRecords.reduce((s, r) => s + calculateIncentivePreview(r.unitsProduced).amount, 0);

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Factory size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Production Output Logs & Incentive Tiers</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center" }}>
              Piece-Rate & Output Tracking
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "760px" }}>
            Track monthly plant and line manufacturing output metrics mapped dynamically with worker attendance, employee targets, and contractor billing.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "9px 16px", background: "var(--primary)", color: "#fff",
            border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={15} /> Log Production
        </button>
      </div>

      {/* KPI Stats */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Units Logged</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "monospace" }}>{totalUnits.toLocaleString("en-IN")} units</p>
        </div>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Calculated Slab Incentives</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--green, #16a34a)", margin: 0, fontFamily: "monospace" }}>₹{totalIncentives.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
          padding: "10px 14px",
          background: "var(--background)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)" }} />
          <input
            type="text"
            placeholder="Search worker, code, notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              height: "34px",
              paddingLeft: "30px",
              paddingRight: "10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              background: "var(--card)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={13} style={{ color: "var(--subtext)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Month:</span>
          <select
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            style={{
              height: "34px",
              padding: "0 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--card)",
              color: "var(--text)",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="ALL">All Months</option>
            {MONTHS_FULL.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Skill:</span>
          <select
            value={selectedSkillFilter}
            onChange={(e) => setSelectedSkillFilter(e.target.value)}
            style={{
              height: "34px",
              padding: "0 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--card)",
              color: "var(--text)",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="ALL">All Skills</option>
            <option value="Skilled">Skilled</option>
            <option value="Semi-Skilled">Semi-Skilled</option>
            <option value="Unskilled">Unskilled</option>
          </select>
        </div>

        {(searchQuery || selectedMonthFilter !== "ALL" || selectedSkillFilter !== "ALL") && (
          <button
            onClick={() => { setSearchQuery(""); setSelectedMonthFilter("ALL"); setSelectedSkillFilter("ALL"); }}
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: "var(--primary)",
              border: "1px solid var(--primary-light)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : processedRecords.length === 0 ? (
        <EmptyState title="No production logs found" subtitle="Log monthly units produced by workers to evaluate incentive slabs." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                <th
                  onClick={() => handleSort("employee")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Worker {renderSortIcon("employee")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("period")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Period {renderSortIcon("period")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("unitsProduced")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Units Produced {renderSortIcon("unitsProduced")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("targetUnits")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Target Units {renderSortIcon("targetUnits")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("achievementPct")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Target Achieved {renderSortIcon("achievementPct")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("incentive")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Incentive Earned {renderSortIcon("incentive")}
                  </div>
                </th>
                <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {processedRecords.map((rec, idx) => {
                const empName = rec.employeeName || (rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : "Worker");
                const empCode = rec.employeeCode || rec.employee?.employeeCode || "";
                const incentive = calculateIncentivePreview(rec.unitsProduced);
                const target = rec.targetUnits || 1000;
                const achievedPct = Math.round((rec.unitsProduced / target) * 100);

                return (
                  <tr key={rec.id} style={{ borderBottom: idx < processedRecords.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "13.5px" }}>{empName}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace" }}>
                        {empCode} {rec.skillType ? `• ${rec.skillType}` : ""}
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>
                      {MONTHS_FULL[rec.month - 1]} {rec.year}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>
                        {Number(rec.unitsProduced).toLocaleString("en-IN")}
                      </span>
                      <span style={{ fontSize: "11.5px", color: "var(--subtext)", marginLeft: "4px" }}>units</span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13px", color: "var(--subtext)", fontFamily: "monospace" }}>
                      {target.toLocaleString("en-IN")} units
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "99px",
                          background: achievedPct >= 100 ? "#f0fdf4" : "#fef2f2",
                          color: achievedPct >= 100 ? "#16a34a" : "#dc2626",
                        }}
                      >
                        {achievedPct}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Award size={14} style={{ color: incentive.amount > 0 ? "var(--green)" : "var(--subtext)" }} />
                        <span style={{ fontSize: "14px", fontWeight: 800, color: incentive.amount > 0 ? "var(--green)" : "var(--subtext)", fontFamily: "monospace" }}>
                          ₹{incentive.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <span style={{ fontSize: "10.5px", color: "var(--subtext)" }}>{incentive.slab}</span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "12.5px", color: "var(--subtext)" }}>
                      {rec.remarks || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "460px", padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Log Monthly Production Output</h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "16px" }}>Record finished units produced to trigger dynamic incentive slabs and contractor billing.</p>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Worker *</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                >
                  <option value="">Select worker…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Month *</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Year *</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Units Produced *</label>
                  <input
                    type="number"
                    placeholder="e.g. 1150"
                    value={unitsProduced}
                    onChange={(e) => setUnitsProduced(e.target.value)}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px", fontFamily: "monospace" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Target Units (Default: 1000)</label>
                  <input
                    type="number"
                    value={targetUnits}
                    onChange={(e) => setTargetUnits(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px", fontFamily: "monospace" }}
                  />
                </div>
              </div>

              {unitsProduced && (
                <div style={{ padding: "10px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Projected Incentive:</span>
                  <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--green)", marginTop: "2px" }}>
                    ₹{calculateIncentivePreview(unitsProduced).amount.toLocaleString("en-IN")} ({calculateIncentivePreview(unitsProduced).slab})
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Remarks / Batch Info</label>
                <input
                  type="text"
                  placeholder="e.g. Line B Assembly — Overachieved target"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: "8px 16px", background: "var(--background)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: "8px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  {saving ? "Saving…" : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
