/**
 * Utility functions for leave management
 */

export function parseLeaveDetails(reason) {
  if (!reason) return { summary: "", category: "General", isHalfDay: false, attachment: null };
  if (typeof reason === "string" && reason.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(reason);
      return {
        summary: parsed.summary || "",
        category: parsed.category || "General",
        isHalfDay: Boolean(parsed.isHalfDay),
        halfDaySession: parsed.halfDaySession || "First Half",
        handoverTo: parsed.handoverTo || "",
        emergencyContact: parsed.emergencyContact || "",
        attachment: parsed.attachment || null,
      };
    } catch {
      return { summary: reason, category: "General", isHalfDay: false, attachment: null };
    }
  }
  return { summary: reason, category: "General", isHalfDay: false, attachment: null };
}

export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function renderSortableHeader(label, field, sortConfig, handleSort) {
  return (
    <th
      key={field}
      onClick={() => handleSort(field)}
      style={{
        padding: "11px 16px",
        textAlign: field === "employeeName" ? "left" : "center",
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--subtext)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        background: sortConfig.field === field ? "var(--primary-light)" : "var(--background)",
        transition: "background 0.2s",
      }}
      title={`Sort by ${label}`}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: field === "employeeName" ? "flex-start" : "center" }}>
        {label}
        {sortConfig.field === field && (
          <span style={{ fontSize: "10px", fontWeight: 800 }}>
            {sortConfig.order === "asc" ? "↑" : "↓"}
          </span>
        )}
      </span>
    </th>
  );
}
