/**
 * PayslipPreviewModal — renders the reusable PayslipTemplate in an overlay
 * with Print (browser) and Download PDF actions. Printing only prints the
 * sheet (visibility rules in PayslipTemplate.css).
 */
import { useEffect, useState } from "react";
import { X, Printer, FileText, Loader2 } from "lucide-react";
import { getPayslipStatement } from "../../services/payslipStatementService.js";
import { downloadPayslipPdf } from "../../services/payrollService.js";
import PayslipTemplate from "./PayslipTemplate.jsx";
import "./PayslipTemplate.css";

export default function PayslipPreviewModal({ payslipId, onClose }) {
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getPayslipStatement(payslipId)
      .then((s) => { if (active) setStatement(s); })
      .catch((e) => { if (active) setError(e.message || "Could not load payslip"); });
    return () => { active = false; };
  }, [payslipId]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadPayslipPdf(payslipId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e.message || "Could not download the payslip PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}
    >
      <div className="no-print" style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }}>
        <button
          onClick={handlePrint}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Printer size={15} /> Print
        </button>
        <button
          onClick={handleDownload}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#1f2937", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {busy ? <Loader2 size={15} /> : <FileText size={15} />} {busy ? "Generating…" : "Download PDF"}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ width: 38, height: 38, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ maxHeight: "100%", overflowY: "auto", borderRadius: 12 }}>
        {error ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, color: "#dc2626", fontWeight: 600, fontSize: 14 }}>{error}</div>
        ) : !statement ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 40, color: "#6b7280", fontSize: 14 }}>Loading payslip…</div>
        ) : (
          <div className="ps-print-area">
            <PayslipTemplate statement={statement} />
          </div>
        )}
      </div>
    </div>
  );
}