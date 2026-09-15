/**
 * DemoBanner — displayed on modules that use in-memory mock data.
 *
 * Purpose: Be honest with the client that these modules are demo-only.
 * Actions in mock modules mutate an in-memory array that resets on refresh,
 * which is expected behaviour for a pre-launch preview.
 *
 * Usage:
 *   import DemoBanner from "../../components/shared/DemoBanner.jsx";
 *   <DemoBanner module="Expenses" />          // full banner
 *   <DemoBanner module="HR Dashboard" compact /> // compact pill for dashboards
 */

import { FlaskConical } from "lucide-react";

export default function DemoBanner({
  module = "This module",
  compact = false,
}) {
  if (compact) {
    return (
      <span
        title={`${module} is running on demo data — actions do not persist across page refreshes.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "10px",
          fontWeight: 700,
          color: "#92400e",
          background: "#fef3c7",
          border: "1px solid #fde68a",
          borderRadius: "99px",
          padding: "2px 8px",
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          userSelect: "none",
        }}
      >
        <FlaskConical size={10} />
        Demo Preview
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-label="Demo preview notice"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "12px 16px",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "var(--radius)",
        marginBottom: "20px",
      }}
    >
      <FlaskConical
        size={16}
        style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }}
      />
      <div>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#92400e",
            margin: "0 0 2px",
          }}
        >
          {/* Demo Preview —  */}
          {module}
        </p>
        <p style={{ fontSize: "12px", color: "#b45309", margin: 0 }}>
          {/* This module is running on demo data. Changes are visible in this session but */}{" "}
          {/* <strong>do not persist</strong> — a page refresh will restore the original state.
          Full database integration is planned for the next release. */}
        </p>
      </div>
    </div>
  );
}
