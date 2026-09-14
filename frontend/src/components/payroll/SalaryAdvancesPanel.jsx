import { useState, useEffect, useMemo } from "react";
import { Plus, CreditCard, CheckCircle2, Clock, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { getSalaryAdvances, createSalaryAdvance } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";

export default function SalaryAdvancesPanel({ employees = [] }) {
  const toast = useToast();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState("disbursedOn");
  const [sortOrder, setSortOrder] = useState("desc");

  // Form State
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
      toast("Please enter valid positive numbers for amount and EMI", "error");
      return;
    }
    setSaving(true);
    try {
      await createSalaryAdvance({
        employeeId,
        amount: amt,
        monthlyDeduction: emi,
        reason,
        disbursedOn: new Date().toISOString(),
      });
      toast("Salary advance sanctioned successfully!");
      setShowAddModal(false);
      setAmount("");
      setMonthlyDeduction("");
      setReason("");
      setEmployeeId("");
      loadAdvances();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to sanction advance", "error");
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

  // Filtered & Sorted advances
  const processedAdvances = useMemo(() => {
    let list = [...advances];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        const name = (a.employeeName || (a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "")).toLowerCase();
        const code = (a.employeeCode || a.employee?.employeeCode || "").toLowerCase();
        const rsn = (a.reason || "").toLowerCase();
        const dept = (a.department || a.employee?.department?.name || "").toLowerCase();
        return name.includes(q) || code.includes(q) || rsn.includes(q) || dept.includes(q);
      });
    }

    // Status Filter
    if (statusFilter !== "ALL") {
      list = list.filter((a) => {
        const outstanding = Math.max(0, Number(a.amount || 0) - Number(a.recoveredAmount || 0));
        const isCompleted = outstanding === 0 || a.status === "Completed";
        return statusFilter === "Active" ? !isCompleted : isCompleted;
      });
    }

    // Sort
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === "employee") {
        valA = (a.employeeName || a.employee?.firstName || "").toLowerCase();
        valB = (b.employeeName || b.employee?.firstName || "").toLowerCase();
      } else if (sortField === "amount") {
        valA = Number(a.amount || 0);
        valB = Number(b.amount || 0);
      } else if (sortField === "monthlyDeduction") {
        valA = Number(a.monthlyDeduction || 0);
        valB = Number(b.monthlyDeduction || 0);
      } else if (sortField === "recovered") {
        valA = Number(a.recoveredAmount || 0);
        valB = Number(b.recoveredAmount || 0);
      } else if (sortField === "outstanding") {
        valA = Math.max(0, Number(a.amount || 0) - Number(a.recoveredAmount || 0));
        valB = Math.max(0, Number(b.amount || 0) - Number(b.recoveredAmount || 0));
      } else if (sortField === "disbursedOn") {
        valA = new Date(a.disbursedOn || a.createdAt || 0).getTime();
        valB = new Date(b.disbursedOn || b.createdAt || 0).getTime();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [advances, searchQuery, statusFilter, sortField, sortOrder]);

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
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "20px" }}>
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

      {/* Search and Filters Bar */}
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
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)" }} />
          <input
            type="text"
            placeholder="Search employee name, code, reason…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              height: "34px",
              paddingLeft: "32px",
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
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            <option value="ALL">All Advances</option>
            <option value="Active">Active / Repaying</option>
            <option value="Completed">Completed / Cleared</option>
          </select>
        </div>

        {(searchQuery || statusFilter !== "ALL") && (
          <button
            onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); }}
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
      ) : processedAdvances.length === 0 ? (
        <EmptyState title="No salary advances found" subtitle="Click 'Sanction Advance' to disburse a loan to an employee." />
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
                    Employee {renderSortIcon("employee")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("amount")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Sanctioned Amount {renderSortIcon("amount")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("monthlyDeduction")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Monthly EMI {renderSortIcon("monthlyDeduction")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("recovered")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Recovered {renderSortIcon("recovered")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("outstanding")}
                  style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    Outstanding {renderSortIcon("outstanding")}
                  </div>
                </th>
                <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                  Repayment Progress
                </th>
                <th style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {processedAdvances.map((adv, idx) => {
                // Dynamically resolve real employee name and code
                const empName = adv.employeeName || (adv.employee ? `${adv.employee.firstName} ${adv.employee.lastName}`.trim() : "Employee");
                const empCode = adv.employeeCode || adv.employee?.employeeCode || "";
                const deptName = adv.department || adv.employee?.department?.name || "";
                const total = Number(adv.amount || 0);
                const recovered = Number(adv.recoveredAmount || 0);
                const outstanding = Math.max(0, total - recovered);
                const pct = total > 0 ? Math.min(100, Math.round((recovered / total) * 100)) : 0;
                const isDone = outstanding === 0 || adv.status === "Completed";

                return (
                  <tr key={adv.id} style={{ borderBottom: idx < processedAdvances.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "13.5px" }}>{empName}</div>
                      <div style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace", display: "flex", gap: "6px" }}>
                        <span>{empCode}</span>
                        {deptName && deptName !== "—" && <span>• {deptName}</span>}
                      </div>
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
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "99px",
                          background: isDone ? "#ecfdf5" : "#fffbeb",
                          color: isDone ? "#059669" : "#d97706",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {isDone ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        {isDone ? "Settled" : "Deducting"}
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
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px", fontFamily: "monospace" }}
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
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px", fontFamily: "monospace" }}
                />
                <span style={{ fontSize: "11px", color: "var(--subtext)" }}>Deducted automatically from gross wages until balance reaches ₹0.</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Reason / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Home emergency advance"
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
