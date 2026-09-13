import React, { useState, useEffect } from "react";
import { getEmployeePayrollSummary } from "../../services/payrollService.js";
import Spinner from "../shared/Spinner.jsx";
import StatusBadge from "../shared/StatusBadge.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { inr, MONTHS_FULL, payrollStatusMeta, getSkillMeta } from "../../utils/payrollFormatters.js";

function StatCard({ label, value, color = "var(--text)", subtitle }) {
  return (
    <div
      style={{
        background: "var(--background)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        flex: "1 1 140px",
        minWidth: "120px",
      }}
    >
      <p
        style={{
          fontSize: "10.5px",
          fontWeight: 700,
          color: "var(--subtext)",
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          marginBottom: "5px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: "16px", fontWeight: 800, color, fontFamily: "monospace", margin: 0 }}>
        {value}
      </p>
      {subtitle && (
        <p style={{ fontSize: "11px", color: "var(--subtext)", marginTop: "4px", margin: 0 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Master reusable Employee Salary Breakdown component.
 * Can be rendered inline (e.g. in Payroll tab) or as a Modal (e.g. in Payslip Designer).
 */
export default function EmployeeSalaryBreakdown({
  employeeId,
  month,
  year,
  isModal = false,
  onClose,
  employeeMeta,
}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeMonth = month || new Date().getMonth() + 1;
  const activeYear = year || new Date().getFullYear();

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    setError("");
    setSummary(null);

    getEmployeePayrollSummary(employeeId, activeMonth, activeYear)
      .then((res) => setSummary(res.data))
      .catch((err) => {
        setError(err.message || "Could not load payroll summary");
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [employeeId, activeMonth, activeYear]);

  const content = (
    <div>
      {/* Header section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)", margin: 0 }}>
            {summary?.employeeName || employeeMeta?.firstName
              ? `${summary?.employeeName || `${employeeMeta.firstName} ${employeeMeta.lastName || ""}`}`
              : `Employee ${employeeId}`}
            <span style={{ color: "var(--subtext)", fontWeight: 500, fontSize: "13px", marginLeft: "6px" }}>
              ({employeeId})
            </span>
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
              {summary?.designation || employeeMeta?.designation || "Staff"} · {summary?.department || employeeMeta?.department || "General"}
            </span>
            {(() => {
              const skill = summary?.skillType || employeeMeta?.skillType;
              if (!skill) return null;
              const sm = getSkillMeta(skill);
              return (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "99px",
                    color: sm.color,
                    background: sm.bg,
                    border: `1px solid ${sm.border}`,
                  }}
                >
                  {sm.label}
                </span>
              );
            })()}
            {summary?.salaryType && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "99px",
                  color: summary.salaryType === "Daily" ? "#0284c7" : "#475569",
                  background: summary.salaryType === "Daily" ? "#f0f9ff" : "#f8fafc",
                  border: `1px solid ${summary.salaryType === "Daily" ? "#bae6fd" : "#e2e8f0"}`,
                }}
              >
                {summary.salaryType === "Daily" ? `Daily Wage (${inr(summary.dailyWageRate || 0)}/day)` : "Monthly Fixed"}
              </span>
            )}
            {summary?.contractorName && (
              <span style={{ fontSize: "11.5px", color: "var(--subtext)", fontWeight: 600 }}>
                Contractor: <b style={{ color: "var(--text)" }}>{summary.contractorName}</b>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
            {MONTHS_FULL[activeMonth - 1]} {activeYear}
          </span>
          {summary?.status && (
            <StatusBadge
              {...(payrollStatusMeta[summary.status] || {
                label: summary.status,
                color: "#64748b",
                bg: "#f8fafc",
              })}
            />
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
          <Spinner />
        </div>
      ) : error ? (
        <p style={{ fontSize: "13px", color: "var(--red)", fontWeight: 600, padding: "12px" }}>
          {error}
        </p>
      ) : !summary ? (
        <EmptyState title="No payroll data" subtitle="No summary found for this employee & period." />
      ) : (
        (() => {
          const earningGroups = summary.earningGroups?.length
            ? summary.earningGroups
            : [{ id: null, name: "Earnings", kind: "earning", rows: [] }];
          const deductionGroups = summary.deductionGroups?.length
            ? summary.deductionGroups
            : [{ id: null, name: "Deductions", kind: "deduction", rows: [] }];

          const flatRows = (obj) =>
            Object.entries(obj || {})
              .filter(([k, v]) => k !== "total" && k !== "leaveDeduction" && Number(v) > 0)
              .map(([label, amount]) => ({
                label: label.replace(/([A-Z])/g, " $1").trim(),
                amount: Number(amount),
              }));

          const fallbackEarnings = flatRows(summary.earnings);
          const fallbackDeductions = flatRows(summary.deductions);

          const earnedTotal = earningGroups.some((g) => g.rows.length)
            ? earningGroups.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.amount, 0), 0)
            : fallbackEarnings.reduce((s, r) => s + r.amount, 0);

          const deductionsTotal = Number(summary.deductions?.total || 0);

          return (
            <>
              {/* Stat cards row */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
                <StatCard label="Gross" value={inr(summary.gross)} />
                <StatCard
                  label="Annual Package"
                  value={summary.annualSalary ? inr(summary.annualSalary) : "—"}
                  color="var(--primary)"
                />
                <StatCard
                  label="Attendance"
                  value={`${summary.presentDays ?? 0} / ${summary.workingDays ?? "—"} days`}
                  subtitle={
                    summary.paidLeaveDays > 0 ? `+${summary.paidLeaveDays} paid leave` : undefined
                  }
                  color="var(--green)"
                />
                <StatCard
                  label="Leave Deduction"
                  value={summary.leaveDeduction > 0 ? `−${inr(summary.leaveDeduction)}` : "—"}
                  color={summary.leaveDeduction > 0 ? "var(--amber)" : "var(--subtext)"}
                  subtitle={summary.leaveDays > 0 ? `${summary.leaveDays} unpaid LOP` : undefined}
                />
                <StatCard
                  label="Total Deductions"
                  value={`−${inr(deductionsTotal)}`}
                  color="var(--red)"
                />
                <StatCard
                  label="Net Payroll"
                  value={inr(summary.netPay)}
                  color="var(--green)"
                />
              </div>

              {/* Scenario 3: Monthly Salary + Attendance Deduction (LOP) Breakdown Banner */}
              {summary.salaryType === "Monthly" && (
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)",
                    border: "1px solid rgba(59, 130, 246, 0.25)",
                    borderRadius: "var(--radius)",
                    padding: "14px 16px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, background: "#2563eb", color: "#fff", padding: "2px 8px", borderRadius: "4px" }}>
                        SCENARIO 3: MONTHLY SALARY ENGINE
                      </span>
                      <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text)" }}>
                        Monthly Salary + Attendance LOP Deduction
                      </span>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "var(--subtext)", fontFamily: "monospace" }}>
                      Formula: (Monthly ÷ {summary.calendarDaysInMonth || 30}d) × LOP Days
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
                    <div style={{ background: "var(--card)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--subtext)", fontWeight: 700, textTransform: "uppercase" }}>Fixed Monthly Salary</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace", marginTop: "2px" }}>
                        {inr(summary.fixedMonthlySalary || (summary.annualSalary ? summary.annualSalary / 12 : 24000))}
                      </div>
                    </div>
                    <div style={{ background: "var(--card)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--subtext)", fontWeight: 700, textTransform: "uppercase" }}>Daily Salary (÷{summary.calendarDaysInMonth || 30})</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace", marginTop: "2px" }}>
                        {inr(summary.dailySalaryRate || Math.round((summary.fixedMonthlySalary || 24000) / (summary.calendarDaysInMonth || 30)))}/d
                      </div>
                    </div>
                    <div style={{ background: "var(--card)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--subtext)", fontWeight: 700, textTransform: "uppercase" }}>LOP Days</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: (summary.lopDays || summary.leaveDays) > 0 ? "#dc2626" : "var(--green)", fontFamily: "monospace", marginTop: "2px" }}>
                        {(summary.lopDays != null ? summary.lopDays : summary.leaveDays) || 0} days
                      </div>
                    </div>
                    <div style={{ background: "var(--card)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--subtext)", fontWeight: 700, textTransform: "uppercase" }}>LOP Deduction</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: (summary.lopDeduction || summary.leaveDeduction) > 0 ? "#dc2626" : "var(--subtext)", fontFamily: "monospace", marginTop: "2px" }}>
                        −{inr(summary.lopDeduction || summary.leaveDeduction || 0)}
                      </div>
                    </div>
                    <div style={{ background: "var(--card)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--subtext)", fontWeight: 700, textTransform: "uppercase" }}>Gross Payable Salary</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "#16a34a", fontFamily: "monospace", marginTop: "2px" }}>
                        {inr(summary.grossPayableSalary || summary.gross)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scenario 4: Attendance -> Leave Records -> Holiday Calendar -> Payroll Pipeline */}
              <div
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "var(--subtext)",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>
                    Attendance Pipeline:
                  </span>
                  <span style={{ color: "var(--subtext)" }}>
                    Attendance → Leave Records → Holiday Calendar → Payroll
                  </span>
                  {summary.paidLeaveDays > 0 && (
                    <span style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", padding: "2px 7px", borderRadius: "4px", fontWeight: 700, fontSize: "11px" }}>
                      ✓ {summary.paidLeaveDays} Approved Leave (Paid) → No LOP
                    </span>
                  )}
                  {(summary.lopDays > 0 || summary.leaveDays > 0) && (
                    <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 7px", borderRadius: "4px", fontWeight: 700, fontSize: "11px" }}>
                      ⚠ {summary.lopDays || summary.leaveDays} Unauthorized Absence → LOP Deducted
                    </span>
                  )}
                </div>
                {summary.skillType && (
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    Engine: <em>{summary.salaryType === "Monthly" ? "Monthly Salary" : "Daily Wage"}</em> ({summary.skillType})
                  </span>
                )}
              </div>

              {/* Earnings / Deductions grouped by blueprint nesting */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                {/* Earnings Box */}
                <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      marginBottom: "12px",
                    }}
                  >
                    Earnings
                  </p>
                  {earningGroups.map((g, gi) => {
                    const rows = g.rows.length ? g.rows : fallbackEarnings;
                    return (
                      <div key={g.id || g.name || gi} style={gi > 0 ? { marginTop: "14px" } : undefined}>
                        {earningGroups.length > 1 && (
                          <p style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text)", opacity: 0.85, marginBottom: "6px" }}>
                            {g.name}
                          </p>
                        )}
                        {rows.length === 0 ? (
                          <p style={{ fontSize: "12px", color: "var(--subtext)" }}>No earnings recorded.</p>
                        ) : (
                          rows.map((row) => (
                            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "var(--label)" }}>{row.label}</span>
                              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--green)", fontFamily: "monospace" }}>
                                {inr(row.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      marginTop: "12px",
                      paddingTop: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Total Earnings</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", fontFamily: "monospace" }}>
                      {inr(earnedTotal)}
                    </span>
                  </div>
                </div>

                {/* Deductions Box */}
                <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      marginBottom: "12px",
                    }}
                  >
                    Deductions
                  </p>
                  {deductionGroups.map((g, gi) => {
                    const rows = g.rows.length ? g.rows : fallbackDeductions;
                    return (
                      <div key={g.id || g.name || gi} style={gi > 0 ? { marginTop: "14px" } : undefined}>
                        {deductionGroups.length > 1 && (
                          <p style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text)", opacity: 0.85, marginBottom: "6px" }}>
                            {g.name}
                          </p>
                        )}
                        {rows.length === 0 ? (
                          <p style={{ fontSize: "12px", color: "var(--subtext)" }}>No deductions recorded.</p>
                        ) : (
                          rows.map((row) => (
                            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "var(--label)" }}>{row.label}</span>
                              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--red)", fontFamily: "monospace" }}>
                                −{inr(row.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                  {summary.leaveDeduction > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
                      <span style={{ fontSize: "12.5px", color: "var(--label)" }}>Leave Deduction (unpaid days)</span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--red)", fontFamily: "monospace" }}>
                        −{inr(summary.leaveDeduction)}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      marginTop: "12px",
                      paddingTop: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Total Deductions</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--red)", fontFamily: "monospace" }}>
                      −{inr(deductionsTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          );
        })()
      )}
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))",
          padding: "24px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        {content}
      </div>
    </div>
  );
}
