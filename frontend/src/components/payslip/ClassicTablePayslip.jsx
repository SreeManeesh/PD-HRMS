/**
 * ClassicTablePayslip — Client Focus Style
 * Pixel-perfect implementation of the Client Focus Classic Table payslip layout
 * with customizable logo placement, dynamic logo sizing, serif typography,
 * attendance & salary breakdown tables, and custom color accents.
 */

import React from "react";
import { assetUrl } from "../../utils/assetUrl.js";
import { inr } from "../../utils/currency.js";
import { rupeesInWords } from "../../utils/numberToWords.js";

export default function ClassicTablePayslip({
  company = {},
  logoSize = 170,
  employee = {},
  payroll = {},
  theme = {
    primaryColor: "#3478d4",
    accentColor: "#1f7a32",
    tableBorderColor: "#111111",
  },
  visibility = {
    info: true,
    attendance: true,
    salary: true,
    leave: true,
    net: true,
    words: true,
    note: true,
  },
  onLogoClick,
  previewLogoUrl,
}) {
  const compName = company.name || "Client Focus Pvt Ltd";
  const compAddress =
    company.address ||
    "2nd Floor, Mazhar Estates, Sector 3, Phase 2, HITEC City, Hyderabad, Telangana 500081";

  const effectiveLogo = previewLogoUrl || (company.logoUrl ? assetUrl(company.logoUrl) : null);

  // Employee details fallback
  const empName = employee.name || `${employee.firstName || "Siddartha"} ${employee.lastName || "Kondaveeti"}`.trim();
  const empCode = employee.employeeCode || employee.id || "CF0020";
  const joinDate = employee.joinDate || employee.dateOfJoining || "23/2/2026";
  const designation = employee.designation?.title || employee.designation || "Junior L1 SOC Analyst";
  const department = employee.department?.name || employee.department || "Cybersecurity";
  const location = employee.location?.name || employee.location || "Hyderabad";
  const bankName = employee.bankName || employee.wizardData?.bankDetails?.bankName || "RBL Bank";
  const bankAccount = employee.bankAccount || employee.wizardData?.bankDetails?.accountNumber || "309031020446";
  const uan = employee.uan || employee.wizardData?.personalDetails?.pfUan || "102356045648";
  const pan = employee.pan || employee.wizardData?.personalDetails?.panNumber || "PTJPS6350A";

  // Payroll figures
  const month = payroll.month || "July - 2026";
  const title = payroll.title || "Payslip for the month of";
  const lop = payroll.lopDays ?? payroll.unpaidLeaveDays ?? 0;
  const maxPayableDays = payroll.maxPayableDays ?? payroll.workingDays ?? 31;
  const presentDays = payroll.presentDays ?? 22;
  const netPaidDays = payroll.netPaidDays ?? maxPayableDays - lop;

  const earnings = payroll.earnings?.length
    ? payroll.earnings
    : [
        { name: "BASIC", amount: 12500 },
        { name: "HRA", amount: 5000 },
        { name: "SPECIAL ALLOWANCE", amount: 2258.57 },
        { name: "OTHER ALLOWANCE", amount: 3441.43 },
      ];

  const deductions = payroll.deductions?.length
    ? payroll.deductions
    : [
        { name: "PF", amount: 1800 },
        { name: "PROF TAX", amount: 200 },
        { name: "MEDICAL INSURANCE", amount: 180 },
      ];

  const totalEarnings = earnings.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const netPay = payroll.netPay ?? totalEarnings - totalDeductions;
  const words = payroll.netPayInWords || `(${rupeesInWords(netPay)})`;
  const leaveBalance = payroll.leaveBalance ?? "03";

  // Match rows length for side-by-side table
  const maxRows = Math.max(earnings.length, deductions.length);
  const tableRows = Array.from({ length: maxRows }, (_, i) => ({
    earning: earnings[i] || null,
    deduction: deductions[i] || null,
  }));

  return (
    <div
      className="classic-payslip-paper"
      style={{
        width: "920px",
        minHeight: "1180px",
        background: "#ffffff",
        margin: "0 auto",
        padding: "52px 48px 65px",
        boxShadow: "0 14px 45px rgba(20, 32, 52, 0.13)",
        position: "relative",
        color: "#111111",
        fontFamily: 'Georgia, "Times New Roman", serif',
        boxSizing: "border-box",
        "--table-border": theme.tableBorderColor || "#111111",
        "--table-header": theme.primaryColor || "#3478d4",
        "--accent-color": theme.accentColor || "#1f7a32",
      }}
    >
      {/* ── LOGO ZONE ── */}
      <div
        className="ps-logo-zone"
        style={{
          position: "absolute",
          left: "48px",
          top: "42px",
          width: "205px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <div
          className="ps-paper-logo"
          onClick={onLogoClick}
          title={effectiveLogo ? "Click to change logo" : "Click to upload company logo"}
          style={{
            width: `${logoSize}px`,
            height: "86px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            cursor: "pointer",
            borderRadius: "4px",
            transition: "all 0.2s ease",
          }}
        >
          {effectiveLogo ? (
            <img
              src={effectiveLogo}
              alt="Company Logo"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#718096",
                border: "1px dashed #cbd5e1",
                borderRadius: "5px",
                background: "#fbfcfe",
                fontFamily: "Inter, Arial, sans-serif",
                textAlign: "center",
                padding: "6px",
              }}
            >
              <div style={{ fontSize: "24px", lineHeight: 1 }}>⌁</div>
              <span style={{ fontSize: "10px", fontWeight: 600, marginTop: "4px" }}>Your Logo Here</span>
              <span style={{ fontSize: "9px", color: "#94a3b8" }}>Click to upload</span>
            </div>
          )}
        </div>
        <div style={{ font: "10px Inter, Arial, sans-serif", color: "#9aa6b5", marginTop: "5px" }}>
          Company Logo
        </div>
      </div>

      {/* ── COMPANY HEADER ── */}
      <div style={{ textAlign: "center", paddingTop: "100px" }}>
        <h1
          style={{
            font: '700 24px Georgia, "Times New Roman", serif',
            color: "#4779aa",
            margin: "0 0 6px",
            letterSpacing: "0.2px",
          }}
        >
          {compName}
        </h1>
        <div
          style={{
            font: '700 14px Georgia, "Times New Roman", serif',
            marginTop: "8px",
            color: "#333",
            lineHeight: 1.5,
            maxWidth: "680px",
            margin: "0 auto",
          }}
        >
          {compAddress}
        </div>
        <div
          style={{
            font: '700 21px Georgia, "Times New Roman", serif',
            marginTop: "16px",
            color: "#111",
          }}
        >
          <span>{title}</span> <span>{month}</span>
        </div>
      </div>

      {/* ── EMPLOYEE / BANK INFO TABLE ── */}
      {visibility.info && (
        <table
          className="ps-info-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            marginTop: "18px",
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          <tbody>
            <tr>
              <td style={infoLabelStyle}>Name</td>
              <td style={infoValStyle}>{empName}</td>
              <td style={infoLabelStyle}>Employee No.</td>
              <td style={infoValStyle}>{empCode}</td>
            </tr>
            <tr>
              <td style={infoLabelStyle}>Joining Date</td>
              <td style={infoValStyle}>{joinDate}</td>
              <td style={infoLabelStyle}>Bank Name</td>
              <td style={infoValStyle}>{bankName}</td>
            </tr>
            <tr>
              <td style={infoLabelStyle}>Designation</td>
              <td style={infoValStyle}>{designation}</td>
              <td style={infoLabelStyle}>Bank Account No.</td>
              <td style={infoValStyle}>{bankAccount}</td>
            </tr>
            <tr>
              <td style={infoLabelStyle}>Department</td>
              <td style={infoValStyle}>{department}</td>
              <td style={infoLabelStyle}>PF UAN</td>
              <td style={infoValStyle}>{uan}</td>
            </tr>
            <tr>
              <td style={infoLabelStyle}>Location</td>
              <td style={infoValStyle}>{location}</td>
              <td style={infoLabelStyle}>PAN Number</td>
              <td style={infoValStyle}>{pan}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── ATTENDANCE TABLE ── */}
      {visibility.attendance && (
        <table
          className="ps-attendance-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            marginTop: "32px",
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          <tbody>
            <tr>
              <td style={attLabelStyle}>LOP</td>
              <td style={attValStyle}>{lop}</td>
              <td style={attLabelStyle}>Max Payable Days</td>
              <td style={attValStyle}>{maxPayableDays}</td>
            </tr>
            <tr>
              <td style={attLabelStyle}>Present Days</td>
              <td style={attValStyle}>{presentDays}</td>
              <td style={attLabelStyle}>Net Paid days</td>
              <td style={attValStyle}>{netPaidDays}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── SALARY TABLE (EARNINGS & DEDUCTIONS) ── */}
      {visibility.salary && (
        <table
          className="ps-salary-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            marginTop: "32px",
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle(theme.primaryColor)}>Earnings</th>
              <th style={{ ...thStyle(theme.primaryColor), textAlign: "right" }}>Amount</th>
              <th style={thStyle(theme.primaryColor)}>Deductions</th>
              <th style={{ ...thStyle(theme.primaryColor), textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, idx) => (
              <tr key={idx}>
                <td style={tdStyle}>{row.earning?.name || ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {row.earning ? Number(row.earning.amount).toFixed(2) : ""}
                </td>
                <td style={tdStyle}>{row.deduction?.name || ""}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {row.deduction ? Number(row.deduction.amount).toFixed(2) : ""}
                </td>
              </tr>
            ))}
            <tr style={{ background: "rgba(52, 120, 212, 0.08)", fontWeight: 700 }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>Total Earnings</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                {totalEarnings.toFixed(2)}
              </td>
              <td style={{ ...tdStyle, fontWeight: 700 }}>Total Deduction</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                {totalDeductions.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── LEAVE TABLE ── */}
      {visibility.leave && (
        <table
          className="ps-leave-table"
          style={{
            width: "48%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            marginTop: "24px",
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          <tbody>
            <tr>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, width: "60%" }}>
                Leave Balance
              </td>
              <td style={{ ...tdStyle, textAlign: "center", width: "40%" }}>{leaveBalance}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── NET PAY ── */}
      {visibility.net && (
        <div
          style={{
            marginTop: "44px",
            font: '700 21px Georgia, "Times New Roman", serif',
            color: theme.accentColor || "#1f7a32",
            display: "flex",
            alignItems: "center",
          }}
        >
          Net Pay for the month:{" "}
          <span style={{ marginLeft: "10px", fontSize: "22px" }}>
            {inr(netPay)}
          </span>
        </div>
      )}

      {/* ── WORDS ── */}
      {visibility.words && (
        <div
          style={{
            marginTop: "16px",
            font: 'italic 16px Georgia, "Times New Roman", serif',
            color: "#333",
          }}
        >
          {words}
        </div>
      )}

      {/* ── GENERATED NOTE ── */}
      {visibility.note && (
        <div
          style={{
            textAlign: "center",
            marginTop: "54px",
            font: 'italic 14px Georgia, "Times New Roman", serif',
            color: "#555",
          }}
        >
          This is a system generated payslip and does not require any signature.
        </div>
      )}

      {/* ── FOOTER ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "32px",
          borderTop: "1px solid #e2e6eb",
          color: "#7c8795",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          fontSize: "10px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <span>{compName}</span>
        <span>Confidential</span>
      </div>
    </div>
  );
}

const borderStyle = "1px solid var(--table-border, #111111)";

const infoLabelStyle = {
  border: borderStyle,
  height: "30px",
  padding: "4px 8px",
  fontSize: "13.5px",
  fontWeight: 700,
  width: "22%",
  color: "#111",
};

const infoValStyle = {
  border: borderStyle,
  height: "30px",
  padding: "4px 8px",
  fontSize: "13.5px",
  width: "28%",
  color: "#222",
};

const attLabelStyle = {
  border: borderStyle,
  height: "29px",
  padding: "4px 8px",
  fontSize: "13.5px",
  fontWeight: 700,
  textAlign: "center",
  width: "22%",
};

const attValStyle = {
  border: borderStyle,
  height: "29px",
  padding: "4px 8px",
  fontSize: "13.5px",
  textAlign: "center",
  width: "28%",
};

const thStyle = (bgColor) => ({
  border: borderStyle,
  height: "32px",
  background: bgColor || "#3478d4",
  color: "#ffffff",
  fontSize: "14.5px",
  fontWeight: 700,
  padding: "4px 8px",
  textAlign: "left",
});

const tdStyle = {
  border: borderStyle,
  height: "28px",
  padding: "4px 8px",
  fontSize: "13.5px",
  color: "#111",
};
