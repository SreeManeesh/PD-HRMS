/**
 * StatusBadge — reusable pill badge for any status
 * Usage: <StatusBadge label="Active" color="#16a34a" bg="#f0fdf4" />
 *        <StatusBadge {...attendanceStatusMeta["Present"]} />
 */

export default function StatusBadge({ label, color, bg, size = "sm" }) {
  const fontSize = size === "xs" ? "10px" : "11.5px";
  const padding  = size === "xs" ? "2px 6px" : "3px 10px";

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize,
        fontWeight: 600,
        color,
        background: bg,
        padding,
        borderRadius: "99px",
        whiteSpace: "nowrap",
        lineHeight: 1.5,
        border: color ? `1px solid ${color}26` : "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
