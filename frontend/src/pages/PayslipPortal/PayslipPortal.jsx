/**
 * Payslip Portal — landing page for the secure payslip link used in email /
 * portal notifications. Mirrors the email template's "View Payslip" button.
 * Loading this page records a delivery "viewed" event for tracking analytics.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, FileText, ArrowLeft, Lock } from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import { getPayslipStatement } from "../../services/payslipStatementService.js";
import { downloadPayslipPdf, markPayslipViewed } from "../../services/payrollService.js";
import PayslipTemplate from "../../components/payslip/PayslipTemplate.jsx";
import "../../components/payslip/PayslipTemplate.css";

export default function PayslipPortal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    if (!id) return;
    if (active) setStatus("Loading payslip…");
    getPayslipStatement(id)
      .then((s) => { if (active) setStatement(s); })
      .catch((e) => { if (active) setError(e.message || "Could not load payslip"); });
    // Best-effort view tracking — do not block rendering on failures.
    markPayslipViewed(id).catch(() => {});
    return () => { active = false; };
  }, [id]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadPayslipPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus("PDF downloaded.");
    } catch (e) {
      setError(e.message || "Could not download the payslip PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          <button
            onClick={() => navigate("/payroll")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <ArrowLeft size={14} /> Back to Payroll
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--subtext)", display: "flex", alignItems: "center", gap: 5 }}>
              <Lock size={13} /> {status || "Secure paid slip"}
            </span>
            <button
              onClick={handlePrint}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={handleDownload}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#1f2937", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              <FileText size={14} /> {busy ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 40, textAlign: "center", color: "#dc2626", fontWeight: 600, fontSize: 14 }}>{error}</div>
        ) : !statement ? (
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 40, textAlign: "center", color: "var(--subtext)", fontSize: 14 }}>Loading payslip…</div>
        ) : (
          <div className="ps-print-area" style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            <PayslipTemplate statement={statement} />
          </div>
        )}
      </div>
    </MainLayout>
  );
}