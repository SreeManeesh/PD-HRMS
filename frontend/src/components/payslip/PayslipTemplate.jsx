/**
 * PayslipTemplate — reusable, fixed-layout corporate A4 payslip.
 * DATA ONLY comes from the `statement` prop ({ company, employee, payroll }).
 * No admin controls; no hard-coded company/employee values.
 */
import { inr } from "../../utils/currency.js";
import { rupeesInWords } from "../../utils/numberToWords.js";
import { assetUrl } from "../../utils/assetUrl.js";
import "./PayslipTemplate.css";

const initials = (name) =>
  String(name || "—").split(/\s+/).map((s) => s[0] || "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";

/** Render a money list or an empty message. */
function MoneyCard({ title, icon, tone, rows, total, emptyText }) {
  return (
    <div className="ps-money-card">
      <div className={`ps-money-title ${tone}`}>
        {icon}
        {title}
      </div>
      <div className="ps-money-divider" />
      {rows.length === 0 ? (
        <div className="ps-empty-note">
          {emptyText}
        </div>
      ) : (
        rows.map((r) => (
          <div className="ps-row" key={r.code || r.name}>
            <span className="ps-row-label">{r.name}</span>
            <span className="ps-row-amount">{inr(r.amount)}</span>
          </div>
        ))
      )}
      <div className="ps-row-total">
        <span className="ps-row-total-label">Total {title}</span>
        <span className="ps-row-total-amount">{rows.length ? inr(total) : "—"}</span>
      </div>
    </div>
  );
}

const d = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function PayslipTemplate({ statement }) {
  const company = statement.company || {};
  const employee = statement.employee || {};
  const p = statement.payroll || {};
  const earnings = p.earnings || [];
  const deductions = p.deductions || [];
  const employer = p.employerContributions || [];

  const totalEarnings = p.totalEarnings ?? earnings.reduce((s, r) => s + (r.amount || 0), 0);
  const totalDeductions = p.totalDeductions ?? deductions.reduce((s, r) => s + (r.amount || 0), 0);
  const netPay = p.netPay ?? totalEarnings - totalDeductions;
  const inWords = p.netPayInWords || rupeesInWords(netPay);
  const periodLabel = p.periodFull || `${String(p.month || "").toUpperCase()} ${p.year || ""}`;
  const countryLabel = p.country ? p.country.toUpperCase() : "";
  const name = d(employee.name);
  const initialsText = initials(employee.name);

  const attendanceRows = [
    ["Working Days", p.workingDays],
    ["Present", p.presentDays],
    ["Late", p.lateDays],
    ["Paid Leave", p.paidLeaveDays],
    ["LOP", p.unpaidLeaveDays],
    ["Holidays", p.holidayDays],
    ["Weekly Offs", p.weeklyOffDays],
    ["Overtime (hrs)", p.overtimeHours],
  ];

  return (
    <div className="ps-sheet">
      <div className="ps-inner">
        {/* ── HEADER ── */}
        <div className="ps-header">
          <div className="ps-brand">
            {company.logoUrl ? (
              <img className="ps-logo" src={assetUrl(company.logoUrl)} alt={d(company.name)} />
            ) : (
              <div className="ps-logo-fallback">{String(name[0] || company.name?.[0] || "H")}</div>
            )}
            <div>
              <div className="ps-company-name">{d(company.name) || "HRMS"}</div>
              <div className="ps-tagline">{d(company.tagline) || "HRMS · People | Process | Progress"}</div>
            </div>
          </div>
          <div className="ps-tagline-right">Building
Better Workplaces
Together</div>
        </div>
        <div className="ps-accent" />

        {/* ── TITLE ── */}
        <div className="ps-title">Salary Payslip</div>
        <div className="ps-period">{periodLabel}{countryLabel ? ` | ${countryLabel}` : ""}</div>

        {/* ── EMPLOYEE DETAILS ── */}
        <div className="ps-employee-card">
          <div className="ps-avatar">{initialsText}</div>
          <div className="ps-emp-left">
            <div className="ps-emp-col">
              <div className="ps-col-title">Employee Details</div>
              {[["Name", name], ["Employee ID", employee.id], ["Department", employee.department], ["Designation", employee.designation]]
                .map(([l, v]) => (
                  <div className="ps-field" key={l}>
                    <span className="ps-field-label">{l}</span>
                    <span className="ps-field-value">{d(v)}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="ps-emp-right">
            <div className="ps-col-title">Payroll</div>
            {[["Pay Period", p.periodLabel], ["Location", employee.location], ["Tax Regime", p.taxRegime], ["PAN", employee.pan], ["Date of Joining", employee.dateOfJoining]]
              .map(([l, v]) => (
                <div className="ps-field" key={l}>
                  <span className="ps-field-label">{l}</span>
                  <span className="ps-field-value">{d(v)}</span>
                </div>
              ))}
          </div>
        </div>

        {/* ── EARNINGS / DEDUCTIONS ── */}
        <div className="ps-money-grid">
          <MoneyCard title="Earnings" icon="+" tone="earn" rows={earnings} total={totalEarnings} emptyText="No Earnings —" />
          <MoneyCard title="Deductions" icon="−" tone="ded" rows={deductions} total={totalDeductions} emptyText="No Deductions —" />
        </div>

        {/* ── EMPLOYER CONTRIBUTIONS ── */}
        {employer.length > 0 && (
          <div className="ps-employer-card">
            <div className="ps-employer-title">Employer Contributions</div>
            <div className="ps-money-divider" />
            {employer.map((r) => (
              <div className="ps-row" key={r.code || r.name}>
                <span className="ps-row-label">{r.name}</span>
                <span className="ps-row-amount">{inr(r.amount)}</span>
              </div>
            ))}
            <div className="ps-employer-note">Employer contributions are paid by the company and do not reduce employee net pay.</div>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {p.workingDays !== undefined && (
          <div className="ps-attendance">
            <div className="ps-att-title">Attendance Summary</div>
            <div className="ps-att-grid">
              {attendanceRows.map(([label, value]) => (
                <div className="ps-att-cell" key={label}>
                  <div className="ps-att-label">{label}</div>
                  <div className="ps-att-value">{d(value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SALARY SUMMARY ── */}
        <div className="ps-summary">
          <div className="ps-summary-grid">
            <div className="ps-sum-cell">
              <div className="ps-sum-label">Gross Earnings</div>
              <div className="ps-sum-value">{inr(totalEarnings)}</div>
            </div>
            <div className="ps-sum-cell">
              <div className="ps-sum-label">Total Deductions</div>
              <div className="ps-sum-value">{inr(totalDeductions)}</div>
            </div>
            <div className="ps-sum-cell">
              <div className="ps-sum-label">Net Pay</div>
              <div className="ps-sum-value net">{inr(netPay)}</div>
            </div>
          </div>
          <div className="ps-words">
            <div className="ps-words-label">In Words</div>
            {inWords}
          </div>
          {p.tax && (
            <div className="ps-tax-line">
              Tax regime: {d(p.taxRegime)} &nbsp;·&nbsp; Annual tax {inr(p.tax.annualTax)} &nbsp;·&nbsp; Monthly {inr(p.tax.monthlyTax)}
            </div>
          )}
        </div>

        {/* ── GENERATED / SIGNATURE ── */}
        <div className="ps-generate">
          <div className="ps-gen-left">
            <div className="ps-gen-note">Generated On: {d(p.generatedOn)}</div>
            <div className="ps-gen-note" style={{ marginTop: 6 }}>This is a computer-generated payslip. Amounts are shown in Indian Rupees (₹).</div>
          </div>
          <div className="ps-sig">
            <div className="ps-sig-name">Authorized Signatory</div>
            {company.signatureUrl ? (
              <img className="ps-sig-img" src={assetUrl(company.signatureUrl)} alt="Signature" />
            ) : (
              <div className="ps-sig-frame">Signature</div>
            )}
            <div className="ps-sig-name">{d(company.signatoryName)}</div>
            <div className="ps-sig-role">{d(company.signatoryDesignation)}</div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="ps-footer">
          <span>{d(company.name)} &nbsp;·&nbsp; People | Process | Progress</span>
          <span>{d(company.website)}</span>
        </div>
      </div>
    </div>
  );
}