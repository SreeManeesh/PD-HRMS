import { useState, useEffect } from "react";
import { Plus, Factory, CheckCircle2, TrendingUp, Award } from "lucide-react";
import { getProductionRecords, createProductionRecord } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import { MONTHS_FULL } from "../../utils/payrollFormatters";

export default function ProductionRecordsPanel({ employees = [] }) {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [unitsProduced, setUnitsProduced] = useState("");
  const [targetUnits, setTargetUnits] = useState("1000");
  const [remarks, setRemarks] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await getProductionRecords();
      setRecords(res.data || []);
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
    if (u >= 1200) return { amount: 3000, slab: "Tier 4 (1200+ units)" };
    if (u >= 1000) return { amount: 2000, slab: "Tier 3 (1000-1199 units)" };
    if (u >= 800) return { amount: 1000, slab: "Tier 2 (800-999 units)" };
    return { amount: 0, slab: "Below 800 units" };
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
      toast("Production record saved and incentive mapped!");
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

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Factory size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Production Output Logs</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center" }}>
              Output Logging
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "760px" }}>
            Record monthly plant and line manufacturing output metrics used to compute piece-rate and tiered production incentives.
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

      {loading ? (
        <Spinner />
      ) : records.length === 0 ? (
        <EmptyState title="No production logs" subtitle="Log monthly units produced by workers to evaluate incentive slabs." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                {["Worker", "Period", "Units Produced", "Target Units", "Target Achieved", "Incentive Earned", "Notes"].map((h) => (
                  <th key={h} style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((rec, idx) => {
                const empName = rec.employee ? `${rec.employee.firstName} ${rec.employee.lastName}` : "Worker";
                const empCode = rec.employee?.employeeCode || "";
                const incentive = calculateIncentivePreview(rec.unitsProduced);
                const target = rec.targetUnits || 1000;
                const achievedPct = Math.round((rec.unitsProduced / target) * 100);

                return (
                  <tr key={rec.id} style={{ borderBottom: idx < records.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "13.5px" }}>{empName}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace" }}>{empCode}</div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>
                      {MONTHS_FULL[rec.month - 1]} {rec.year}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>
                        {rec.unitsProduced.toLocaleString("en-IN")}
                      </span>
                      <span style={{ fontSize: "11.5px", color: "var(--subtext)", marginLeft: "4px" }}>units</span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13px", color: "var(--subtext)", fontFamily: "monospace" }}>
                      {target.toLocaleString("en-IN")} units
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, padding: "3px 9px", borderRadius: "99px", background: achievedPct >= 100 ? "#f0fdf4" : "#fef2f2", color: achievedPct >= 100 ? "#16a34a" : "#dc2626" }}>
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
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "16px" }}>Record finished units produced to trigger slab incentives.</p>

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
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Target Units</label>
                  <input
                    type="number"
                    value={targetUnits}
                    onChange={(e) => setTargetUnits(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              </div>

              {unitsProduced && (
                <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px", marginTop: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--subtext)" }}>Slab Incentive Preview: </span>
                  <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--green)", fontFamily: "monospace" }}>
                    ₹{calculateIncentivePreview(unitsProduced).amount.toLocaleString("en-IN")}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--subtext)", marginLeft: "6px" }}>({calculateIncentivePreview(unitsProduced).slab})</span>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Remarks / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Completed high-precision run"
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
                  {saving ? "Saving…" : "Record Output"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
