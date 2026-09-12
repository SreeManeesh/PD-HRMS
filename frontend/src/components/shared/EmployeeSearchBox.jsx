import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { getSkillMeta } from "../../utils/payrollFormatters";

/**
 * Master reusable Employee Search Box with live filtering and styled dropdown.
 * Used across Payroll, Payslip Designer, and other HR modules.
 *
 * @param {Array} employees - list of employee objects
 * @param {string} value - search query or selected value
 * @param {Function} onChange - input value change handler
 * @param {Function} onSelect - selection handler; called with (employeeId, employeeObject)
 * @param {string} placeholder - custom input placeholder
 * @param {object} style - container style overrides
 * @param {boolean} compact - smaller padding/height for dense toolbars
 */
export default function EmployeeSearchBox({
  employees = [],
  value = "",
  onChange = () => {},
  onSelect = () => {},
  placeholder = "Search employee by name or ID…",
  style = {},
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = (value || "").trim().toLowerCase();
  const matches = (employees || []).filter((emp) => {
    if (!q) return true;
    const code = (emp.id || emp.employeeCode || "").toLowerCase();
    const name = `${emp.firstName || ""} ${emp.lastName || ""}`.toLowerCase();
    const desig = (emp.designation || "").toLowerCase();
    const skill = (emp.skillType || "").toLowerCase();
    return code.includes(q) || name.includes(q) || desig.includes(q) || skill.includes(q);
  }).slice(0, 50);

  const height = compact ? "32px" : "38px";
  const fontSize = compact ? "12.5px" : "13.5px";

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, ...style }}>
      <Search
        size={compact ? 14 : 15}
        style={{
          color: "var(--subtext)",
          position: "absolute",
          left: compact ? "10px" : "12px",
          top: compact ? "9px" : "12px",
          pointerEvents: "none",
        }}
      />
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: "100%",
          height,
          padding: compact ? "0 32px 0 30px" : "0 36px 0 34px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize,
          color: "var(--text)",
          background: "var(--card)",
          outline: "none",
          transition: "border-color 0.15s ease",
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle employee list"
        style={{
          position: "absolute",
          right: "4px",
          top: compact ? "2px" : "4px",
          width: compact ? "28px" : "30px",
          height: compact ? "28px" : "30px",
          background: "none",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          color: "var(--subtext)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronDown size={compact ? 14 : 16} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: compact ? "36px" : "44px",
            left: 0,
            right: 0,
            zIndex: 40,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md, 0 4px 14px rgba(0,0,0,0.12))",
            maxHeight: "320px",
            overflowY: "auto",
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "12.5px", color: "var(--subtext)" }}>
              No employee found.
            </div>
          ) : (
            matches.map((emp) => {
              const empId = emp.id || emp.employeeCode;
              const skillMeta = emp.skillType ? getSkillMeta(emp.skillType) : null;
              return (
                <button
                  key={empId}
                  type="button"
                  onClick={() => {
                    onSelect(empId, emp);
                    onChange("");
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: compact ? "8px 12px" : "10px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize,
                    color: "var(--text)",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--background)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span
                    style={{
                      width: compact ? "26px" : "28px",
                      height: compact ? "26px" : "28px",
                      borderRadius: "50%",
                      background: "var(--primary-light)",
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: compact ? "11px" : "12px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {(emp.firstName?.[0] || "?")}{(emp.lastName?.[0] || "")}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {emp.firstName} {emp.lastName}
                      </span>
                      {skillMeta && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: "99px",
                            color: skillMeta.color,
                            background: skillMeta.bg,
                            border: `1px solid ${skillMeta.border}`,
                            flexShrink: 0,
                          }}
                        >
                          {skillMeta.label}
                        </span>
                      )}
                    </div>
                    <span style={{ color: "var(--subtext)", fontFamily: "monospace", fontSize: "11.5px" }}>
                      {empId} · {emp.designation || "—"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
