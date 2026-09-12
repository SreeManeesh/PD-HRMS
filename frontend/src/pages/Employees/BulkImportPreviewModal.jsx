import { useState, useMemo } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Search, FileSpreadsheet, ArrowRight, X } from "lucide-react";
import Modal from "../../components/shared/Modal.jsx";

export default function BulkImportPreviewModal({
  isOpen,
  onClose,
  fileName,
  previewData,
  onConfirm,
  confirming = false,
}) {
  const [tab, setTab] = useState("all"); // 'all' | 'ready' | 'duplicate' | 'invalid'
  const [searchTerm, setSearchTerm] = useState("");

  const rows = previewData?.rows || [];
  const totalCount = previewData?.totalCount || 0;
  const readyCount = previewData?.readyCount || 0;
  const duplicateCount = previewData?.duplicateCount || 0;
  const invalidCount = previewData?.invalidCount || 0;
  const isAllDuplicates = previewData?.isAllDuplicates;

  const filteredRows = useMemo(() => {
    let list = rows;
    if (tab === "ready") list = list.filter((r) => r.status === "ready");
    if (tab === "duplicate") list = list.filter((r) => r.status === "duplicate");
    if (tab === "invalid") list = list.filter((r) => r.status === "invalid");

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.fullName?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.department?.toLowerCase().includes(q) ||
          r.designation?.toLowerCase().includes(q) ||
          r.employeeCode?.toLowerCase().includes(q) ||
          r.reason?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, searchTerm]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={confirming ? undefined : onClose}
      title="Bulk Import Preview & Confirmation"
      width="940px"
    >
      <div style={{ padding: "0 24px 24px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* File info and summary cards */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--subtext)", fontSize: "13px" }}>
            <FileSpreadsheet size={16} color="var(--primary)" />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{fileName || "Spreadsheet"}</span>
            <span>·</span>
            <span>{totalCount} total record{totalCount !== 1 ? "s" : ""} detected</span>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "var(--radius-sm)",
                background: "rgba(34, 197, 94, 0.12)", color: "#16a34a",
                fontSize: "12.5px", fontWeight: 700,
              }}
            >
              <CheckCircle2 size={15} />
              <span>{readyCount} Ready to Import</span>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "var(--radius-sm)",
                background: "rgba(245, 158, 11, 0.12)", color: "#d97706",
                fontSize: "12.5px", fontWeight: 700,
              }}
            >
              <AlertTriangle size={15} />
              <span>{duplicateCount} Already Present</span>
            </div>

            {invalidCount > 0 && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "var(--radius-sm)",
                  background: "rgba(239, 68, 68, 0.12)", color: "#dc2626",
                  fontSize: "12.5px", fontWeight: 700,
                }}
              >
                <AlertCircle size={15} />
                <span>{invalidCount} Invalid</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Context Banner */}
        {isAllDuplicates ? (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "14px 16px", borderRadius: "var(--radius-md)",
              background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#b45309", fontSize: "13px", lineHeight: "1.5",
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ display: "block", marginBottom: "2px" }}>Data is already present in the system</strong>
              All {totalCount} records in this file already exist in the database or have duplicate entries. No new employee records will be added.
            </div>
          </div>
        ) : duplicateCount > 0 ? (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "14px 16px", borderRadius: "var(--radius-md)",
              background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)",
              color: "#1d4ed8", fontSize: "13px", lineHeight: "1.5",
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: "2px", color: "#16a34a" }} />
            <div>
              <strong style={{ display: "block", marginBottom: "2px", color: "#1e3a8a" }}>
                Selective Import Ready ({readyCount} unique, {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} skipped)
              </strong>
              {readyCount} new employee record{readyCount !== 1 ? "s" : ""} will be imported. The {duplicateCount} duplicate record{duplicateCount !== 1 ? "s" : ""} already present in the system will be safely skipped.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 16px", borderRadius: "var(--radius-md)",
              background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.25)",
              color: "#15803d", fontSize: "13px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>All {readyCount} employee records are valid, unique, and ready to be imported.</span>
          </div>
        )}

        {/* Filter Tabs & Search */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "all", label: `All (${totalCount})` },
              { id: "ready", label: `Ready to Import (${readyCount})` },
              { id: "duplicate", label: `Already Present (${duplicateCount})` },
              ...(invalidCount > 0 ? [{ id: "invalid", label: `Invalid (${invalidCount})` }] : []),
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: "6px 12px", fontSize: "12.5px", fontWeight: 600,
                  borderRadius: "var(--radius-sm)",
                  border: tab === t.id ? "1px solid var(--primary)" : "1px solid var(--border)",
                  background: tab === t.id ? "rgba(16, 185, 129, 0.1)" : "var(--card)",
                  color: tab === t.id ? "var(--primary)" : "var(--subtext)",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", width: "240px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)" }} />
            <input
              type="text"
              placeholder="Filter preview rows…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%", padding: "6px 10px 6px 30px", fontSize: "12px",
                borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", outline: "none",
              }}
            />
          </div>
        </div>

        {/* Preview Table */}
        <div
          style={{
            maxHeight: "340px", overflowY: "auto",
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            background: "var(--card)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ background: "var(--card-hover)", borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--subtext)" }}>
                <th style={{ padding: "10px 12px", width: "50px" }}>#</th>
                <th style={{ padding: "10px 12px" }}>Employee</th>
                <th style={{ padding: "10px 12px" }}>Email</th>
                <th style={{ padding: "10px 12px" }}>Department</th>
                <th style={{ padding: "10px 12px" }}>Designation</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--subtext)" }}>
                    No rows match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background:
                        r.status === "duplicate"
                          ? "rgba(245, 158, 11, 0.03)"
                          : r.status === "invalid"
                          ? "rgba(239, 68, 68, 0.03)"
                          : "transparent",
                    }}
                  >
                    <td style={{ padding: "9px 12px", color: "var(--subtext)", fontWeight: 500 }}>
                      {r.rowNo}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.fullName || "—"}</div>
                      {r.employeeCode && (
                        <span style={{ fontSize: "11px", color: "var(--subtext)" }}>{r.employeeCode}</span>
                      )}
                    </td>
                    <td style={{ padding: "9px 12px", color: "var(--text)" }}>
                      {r.email || <span style={{ color: "var(--subtext)" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 12px", color: "var(--text)" }}>
                      {r.department || <span style={{ color: "var(--subtext)" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 12px", color: "var(--text)" }}>
                      {r.designation || <span style={{ color: "var(--subtext)" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right" }}>
                      {r.status === "ready" && (
                        <span
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            padding: "3px 8px", borderRadius: "12px",
                            background: "rgba(34, 197, 94, 0.12)", color: "#16a34a",
                            fontWeight: 600, fontSize: "11.5px",
                          }}
                        >
                          <CheckCircle2 size={12} /> Ready to Import
                        </span>
                      )}
                      {r.status === "duplicate" && (
                        <div>
                          <span
                            title={r.reason}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "4px",
                              padding: "3px 8px", borderRadius: "12px",
                              background: "rgba(245, 158, 11, 0.14)", color: "#d97706",
                              fontWeight: 600, fontSize: "11.5px",
                            }}
                          >
                            <AlertTriangle size={12} /> Already Present
                          </span>
                          {r.reason && (
                            <div style={{ fontSize: "11px", color: "var(--subtext)", marginTop: "2px" }}>
                              {r.reason}
                            </div>
                          )}
                        </div>
                      )}
                      {r.status === "invalid" && (
                        <div>
                          <span
                            title={r.reason}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "4px",
                              padding: "3px 8px", borderRadius: "12px",
                              background: "rgba(239, 68, 68, 0.12)", color: "#dc2626",
                              fontWeight: 600, fontSize: "11.5px",
                            }}
                          >
                            <AlertCircle size={12} /> Invalid Row
                          </span>
                          {r.reason && (
                            <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "2px" }}>
                              {r.reason}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: "12px", borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            style={{
              padding: "9px 18px", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", background: "transparent",
              color: "var(--text)", fontWeight: 600, fontSize: "13px",
              cursor: confirming ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {readyCount > 0 && duplicateCount > 0 && (
              <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
                {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} will be skipped
              </span>
            )}
            <button
              id="confirm-import-btn"
              type="button"
              disabled={readyCount === 0 || confirming}
              onClick={onConfirm}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 20px", borderRadius: "var(--radius-sm)",
                border: "none",
                background: readyCount === 0 ? "var(--border)" : "var(--primary)",
                color: readyCount === 0 ? "var(--subtext)" : "#fff",
                fontWeight: 600, fontSize: "13px",
                cursor: readyCount === 0 || confirming ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {confirming ? (
                "Importing…"
              ) : isAllDuplicates ? (
                "Data Already Present"
              ) : (
                <>
                  Confirm & Import ({readyCount}) <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
