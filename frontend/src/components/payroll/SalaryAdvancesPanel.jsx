import { useState, useEffect } from "react";
import { Plus, CreditCard, CheckCircle2, Clock, AlertCircle, ArrowUpRight } from "lucide-react";
import { getSalaryAdvances, createSalaryAdvance } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import { fmt } from "../../utils/payrollFormatters";

export default function SalaryAdvancesPanel({ employees = [] }) {
  const toast = useToast();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [monthlyDeduction, setMonthlyDeduction] = useState("");
  const [reason, setReason] = useState("");

  const loadAdvances = async () => {
    setLoading(true);
    try {
      const res = await getSalaryAdvances();
      setAdvances(res.data || []);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load advances", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdvances();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    const emi = parseFloat(monthlyDeduction);
    if (!employeeId) {
      toast("Please select an employee", "error");
      return;
    }
    if (isNaN(amt) || amt <= 0 || isNaN(emi) || emi <= 0) {
      toast("Please enter positive loan amount and EMI deduction", "error");
      return;
    }
    setSaving(true);
    try {
      await createSalaryAdvance({
        employeeId,
        amount: amt,
        monthlyDeduction: emi,
        reason,
      });
      toast("Salary advance sanctioned successfully!");
      setShowAddModal(false);
      setAmount("");
      setMonthlyDeduction("");
      setReason("");
      loadAdvances();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to sanction advance", "error");
    } finally {
      setSaving(false);
    }
  };

  const totalSanctioned = advances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const totalRecovered = advances.reduce((s, a) => s + Number(a.recoveredAmount || 0), 0);
  const totalOutstanding = advances.reduce((s, a) => s + (Number(a.amount || 0) - Number(a.recoveredAmount || 0)), 0);

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <CreditCard size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Salary Advance & Loan Recovery Ledger</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center" }}>
              EMI & Deduction Tracker
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "760px" }}>
            Track employee loan disbursements and automated monthly payroll deductions until accounts reach full settlement.
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
          <Plus size={15} /> Sanction Advance
        </button>
      </div>

      {/* KPI Stats */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Advances Sanctioned</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "monospace" }}>₹{totalSanctioned.toLocaleString("en-IN")}</p>
        </div>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Recovered To Date</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--green, #16a34a)", margin: 0, fontFamily: "monospace" }}>₹{totalRecovered.toLocaleString("en-IN")}</p>
        </div>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Outstanding Balance</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--amber, #d97706)", margin: 0, fontFamily: "monospace" }}>₹{totalOutstanding.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : advances.length === 0 ? (
        <EmptyState title="No active salary advances" subtitle="Click 'Sanction Advance' to disburse a loan to an employee." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                {["Employee", "Sanctioned Amount", "Monthly EMI", "Recovered", "Outstanding", "Repayment Progress", "Status"].map((h) => (
                  <th key={h} style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {advances.map((adv, idx) => {
                const empName = adv.employee ? `${adv.employee.firstName} ${adv.employee.lastName}` : "Employee";
                const empCode = adv.employee?.employeeCode || "";
                const total = Number(adv.amount || 0);
                const recovered = Number(adv.recoveredAmount || 0);
                const outstanding = Math.max(0, total - recovered);
                const pct = total > 0 ? Math.min(100, Math.round((recovered / total) * 100)) : 0;
                const isDone = outstanding === 0 || adv.status === "Completed";

                return (
                  <tr key={adv.id} style={{ borderBottom: idx < advances.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "13.5px" }}>{empName}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace" }}>{empCode}</div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>
                      ₹{total.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13.5px", color: "var(--subtext)", fontFamily: "monospace" }}>
                      ₹{Number(adv.monthlyDeduction).toLocaleString("en-IN")}/mo
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "13.5px", fontWeight: 600, color: "var(--green, #16a34a)", fontFamily: "monospace" }}>
                      ₹{recovered.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: 800, color: isDone ? "var(--subtext)" : "var(--amber, #d97706)", fontFamily: "monospace" }}>
                      ₹{outstanding.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "14px 18px", minWidth: "150px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "8px", background: "var(--border)", borderRadius: "99px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: isDone ? "var(--green)" : "var(--primary)", transition: "width 0.3s ease" }} />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", fontFamily: "monospace" }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: isDone ? "#f0fdf4" : "#fffbeb", color: isDone ? "#16a34a" : "#d97706", border: isDone ? "1px solid #bbf7d0" : "1px solid #fde68a" }}>
                        {isDone ? "Completed (Paid Off)" : "Active Recovery"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sanction Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "460px", padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Sanction Salary Advance</h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "16px" }}>Sanction a loan or advance with monthly automatic payroll deduction.</p>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Employee *</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                >
                  <option value="">Select an employee…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Sanction Amount (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 20000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Monthly Deduction EMI (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 2000"
                  value={monthlyDeduction}
                  onChange={(e) => setMonthlyDeduction(e.target.value)}
                  required
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
                <span style={{ fontSize: "11px", color: "var(--subtext)" }}>Deducted automatically from gross wages until balance is ₹0.</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Reason / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Home renovation or emergency advance"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
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
                  {saving ? "Sanctioning…" : "Sanction Advance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
