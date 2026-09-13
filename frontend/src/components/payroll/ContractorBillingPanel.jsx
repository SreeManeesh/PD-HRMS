import { useState, useEffect } from "react";
import { Plus, Users2, Receipt, Download, Building2, Phone, Mail, Percent, DollarSign } from "lucide-react";
import { getContractors, createContractor, getContractorPayrollReport } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import { MONTHS_FULL } from "../../utils/payrollFormatters";

export default function ContractorBillingPanel() {
  const toast = useToast();
  const [contractors, setContractors] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // Form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceChargePct, setServiceChargePct] = useState("10.0");

  const loadData = async () => {
    setLoading(true);
    try {
      const [contRes, repRes] = await Promise.all([
        getContractors().catch(() => ({ data: [] })),
        getContractorPayrollReport(month, year).catch(() => ({ data: [] })),
      ]);
      setContractors(contRes.data || []);
      setReport(repRes.data || []);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load contractor data", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadReportOnly = async () => {
    setReportLoading(true);
    try {
      const res = await getContractorPayrollReport(month, year);
      setReport(res.data || []);
    } catch (err) {
      toast("Could not refresh billing report", "error");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, year]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const charge = parseFloat(serviceChargePct);
    if (!name || !code) {
      toast("Name and Contractor Code are required", "error");
      return;
    }
    if (isNaN(charge) || charge < 0) {
      toast("Please enter a valid service charge percentage", "error");
      return;
    }
    setSaving(true);
    try {
      await createContractor({
        name,
        code: code.toUpperCase().replace(/\s+/g, "_"),
        contactPerson,
        phone,
        email,
        serviceChargePct: charge,
      });
      toast(`Contractor ${name} added successfully!`);
      setShowAddModal(false);
      setName("");
      setCode("");
      setContactPerson("");
      setPhone("");
      setEmail("");
      loadData();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to create contractor", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (!report.length) {
      toast("No billing data to export", "error");
      return;
    }
    const headers = ["Contractor Code", "Contractor Name", "Headcount", "Total Gross Wages (INR)", "Total Deductions (INR)", "Total Net Pay (INR)", "Service Charge (%)", "Service Fee (INR)", "Total Billing Invoice (INR)"];
    const rows = report.map((r) => [
      `"${r.contractorCode}"`,
      `"${r.contractorName}"`,
      r.headcount,
      r.totalGross,
      r.totalDeductions,
      r.totalNetPay,
      r.serviceChargePct,
      r.serviceFee,
      r.totalBilling,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `contractor_billing_${year}_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Billing report exported to CSV");
  };

  const totalBillingSum = report.reduce((s, r) => s + Number(r.totalBilling || 0), 0);
  const totalWagesSum = report.reduce((s, r) => s + Number(r.totalGross || 0), 0);
  const totalFeeSum = report.reduce((s, r) => s + Number(r.serviceFee || 0), 0);

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Building2 size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Contractor Billing & Invoices</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center" }}>
              Vendor Statements
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "780px" }}>
            Consolidate contractor agency headcounts, worker wages, statutory withholdings, and contracted agency margins into monthly billing summaries.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={handleExportCSV}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "9px 14px", background: "var(--background)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "9px 16px", background: "var(--primary)", color: "#fff",
              border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add Contractor
          </button>
        </div>
      </div>

      {/* Period Filter Toolbar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", padding: "12px 16px", background: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Billing Period:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          style={{ height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)", color: "var(--text)", fontSize: "13px" }}
        >
          {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ width: "90px", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)", color: "var(--text)", fontSize: "13px" }}
        />
        <span style={{ fontSize: "12.5px", color: "var(--subtext)", marginLeft: "auto" }}>
          Showing billing calculations for {MONTHS_FULL[month - 1]} {year}
        </span>
      </div>

      {/* KPI Stats */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Gross Wages</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", margin: 0, fontFamily: "monospace" }}>₹{totalWagesSum.toLocaleString("en-IN")}</p>
        </div>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Service Fees</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--primary)", margin: 0, fontFamily: "monospace" }}>₹{totalFeeSum.toLocaleString("en-IN")}</p>
        </div>
        <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "14px 18px", flex: "1 1 180px", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 6px 0" }}>Total Invoice Billing</p>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--green, #16a34a)", margin: 0, fontFamily: "monospace" }}>₹{totalBillingSum.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Report Table */}
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Receipt size={17} style={{ color: "var(--primary)" }} /> Contractor-Wise Payroll & Billing Summary
      </h3>

      {loading || reportLoading ? (
        <Spinner />
      ) : report.length === 0 ? (
        <EmptyState title="No contractor billing data" subtitle="No employee wages recorded for contractors in this month." />
      ) : (
        <div style={{ overflowX: "auto", marginBottom: "30px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                {["Contractor", "Headcount", "Gross Wages", "Deductions", "Net Pay", "Service Fee %", "Service Fee Amount", "Total Invoice Billing"].map((h) => (
                  <th key={h} style={{ padding: "12px 18px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.map((row, idx) => (
                <tr key={row.contractorId} style={{ borderBottom: idx < report.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "14px" }}>{row.contractorName}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace" }}>Code: {row.contractorCode}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: "var(--primary-light)", color: "var(--primary)" }}>
                      {row.headcount} workers
                    </span>
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: 600, color: "var(--text)", fontFamily: "monospace" }}>
                    ₹{Number(row.totalGross).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "13.5px", color: "var(--red)", fontFamily: "monospace" }}>
                    −₹{Number(row.totalDeductions).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: 700, color: "var(--green)", fontFamily: "monospace" }}>
                    ₹{Number(row.totalNetPay).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "13.5px", color: "var(--text)", fontWeight: 600 }}>
                    {row.serviceChargePct}%
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "14px", fontWeight: 700, color: "var(--primary)", fontFamily: "monospace" }}>
                    +₹{Number(row.serviceFee).toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--green)", fontFamily: "monospace" }}>
                      ₹{Number(row.totalBilling).toLocaleString("en-IN")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contractors Master List */}
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Users2 size={17} style={{ color: "var(--primary)" }} /> Registered Contractor Agencies
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" }}>
        {contractors.map((c) => (
          <div key={c.id} style={{ background: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", margin: 0 }}>{c.name}</h4>
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--subtext)", fontFamily: "monospace" }}>
                {c.code}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "12.5px", color: "var(--subtext)" }}>
              {c.contactPerson && <div>Contact: <b style={{ color: "var(--text)" }}>{c.contactPerson}</b></div>}
              {c.phone && <div>Phone: <span style={{ fontFamily: "monospace" }}>{c.phone}</span></div>}
              {c.email && <div>Email: {c.email}</div>}
              <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600 }}>Agreed Service Charge:</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--primary)", fontFamily: "monospace" }}>{Number(c.serviceChargePct)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Contractor Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "460px", padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Register Contractor Agency</h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "16px" }}>Add manpower supplier agency details and standard service charge percentage.</p>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Agency Name *</label>
                <input
                  type="text"
                  placeholder="e.g. A-One Labour Services"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!code) setCode(e.target.value.substring(0, 5).toUpperCase().replace(/\s+/g, ""));
                  }}
                  required
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Agency Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. CONTA"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Service Fee (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 10.0"
                    value={serviceChargePct}
                    onChange={(e) => setServiceChargePct(e.target.value)}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Sharma"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Phone</label>
                  <input
                    type="text"
                    placeholder="+91-98..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Email</label>
                  <input
                    type="email"
                    placeholder="contact@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
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
                  {saving ? "Saving…" : "Register Agency"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
