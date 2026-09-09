import PDFDocument from "pdfkit";

import type { Blueprint, BlueprintComponent } from "./types";

export interface RenderData {
  employee: Record<string, string | number>;
  payroll: {
    gross: number;
    net: number;
  };
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  employer?: { label: string; amount: number }[];
  attendance?: { label: string; value: string }[];
  tax?: Record<string, string | number>;
}

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

function decodeLogo(logo?: string): { buffer: Buffer; kind: string } | null {
  if (!logo || typeof logo !== "string" || !logo.startsWith("data:image/")) return null;
  const comma = logo.indexOf(",");
  if (comma < 0) return null;
  const meta = logo.slice(0, comma);
  const b64 = logo.slice(comma + 1);
  const kind = /image\/(png|jpeg|jpg|webp)/i.exec(meta)?.[1] ?? "png";
  return { buffer: Buffer.from(b64, "base64"), kind };
}

/**
 * Resolve per-component values from a blueprint + results map into
 * labelled { label, amount } tuples, grouped by the component's kind.
 * Used by both the designer (from calc engine) and regular payslip
 * (from stored earnings/deductions mapped to component IDs).
 */
export function resolveComponentValues(
  blueprint: Blueprint,
  results: Record<string, { final: number }>,
): { earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[]; employer: { label: string; amount: number }[] } {
  const earnings: { label: string; amount: number }[] = [];
  const deductions: { label: string; amount: number }[] = [];
  const employer: { label: string; amount: number }[] = [];

  for (const c of blueprint.components) {
    if (c.visible === false) continue;
    const r = results[c.id.toLowerCase()];
    if (!r || r.final <= 0) continue;
    const entry = { label: c.label, amount: r.final };
    if (c.kind === "earning" || c.kind === "reimbursement") earnings.push(entry);
    else if (c.kind === "deduction") deductions.push(entry);
    else if (c.kind === "employer") employer.push(entry);
  }

  return { earnings, deductions, employer };
}

/**
 * Render a payslip PDF from a JSON blueprint.
 * Layout is derived from the blueprint's theme, nests and component labels —
 * everything is dynamic. Both the designer endpoint and the regular payslip
 * endpoint use this same renderer, so the output always matches the design.
 */
export function generatePayslipPdf(bp: Blueprint, data: RenderData): Promise<Buffer> {
  const theme = bp.theme;
  const orientation = theme.orientation === "landscape" ? "landscape" : "portrait";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: theme.pageSize || "A4", layout: orientation, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const m = theme.margins || { top: 40, right: 40, bottom: 40, left: 40 };

    // ── Header band (theme-colored) ──
    doc.rect(0, 0, width, 70).fill(theme.primaryColor || "#0f766e");
    const logo = decodeLogo(theme.logo);
    if (logo) {
      try {
        doc.image(logo.buffer, m.left, 14, { width: 60, height: 42, fit: [60, 42] });
      } catch { /* invalid image — skip */ }
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
        .text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left + 68, 24, { width: width - m.left - m.right - 68 });
      doc.fontSize(11).font("Helvetica")
        .text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left + 68, 48);
    } else {
      doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
        .text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left, 22, { width: width - m.left - m.right });
      doc.fontSize(11).font("Helvetica")
        .text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left, 46);
    }

    let y = 88;

    // ── Employee info block ──
    doc.fontSize(10).fillColor("#0e1e2c").font("Helvetica-Bold").text("Employee", m.left, y);
    doc.font("Helvetica").fontSize(9.5);
    const empLines = [
      `Name: ${data.employee.name ?? "—"}`,
      `ID: ${data.employee.employeeId ?? "—"}`,
      `Department: ${data.employee.department ?? "—"}`,
      `Designation: ${data.employee.designation ?? "—"}`,
      `Period: ${data.employee.period ?? bp.name}`,
    ];
    doc.text(empLines.join("\n"), m.left, y + 14, { width: width - m.left - m.right, lineGap: 4 });
    y += 14 + empLines.length * 13 + 10;

    // ── Earnings section ──
    if (data.earnings.length) {
      doc.fontSize(11).fillColor(theme.primaryColor || "#16a34a").font("Helvetica-Bold")
        .text("Earnings", m.left, y);
      y += 16;
      doc.font("Helvetica").fontSize(9.5);
      for (const e of data.earnings) {
        doc.fillColor("#0e1e2c").text(e.label, m.left + 8, y, { continued: true });
        doc.fillColor("#0e1e2c").text(inr(e.amount), { align: "right", width: width - m.left - m.right + 8 });
        y += 14;
      }
      doc.fillColor(theme.primaryColor || "#16a34a").font("Helvetica-Bold")
        .text(`Total Earnings    ${inr(data.payroll.gross)}`, m.left + 8, y);
      y += 20;
    }

    // ── Deductions section ──
    if (data.deductions.length) {
      doc.fillColor("#dc2626").fontSize(11).font("Helvetica-Bold")
        .text("Deductions", m.left, y);
      y += 16;
      doc.font("Helvetica").fontSize(9.5);
      for (const d of data.deductions) {
        doc.fillColor("#0e1e2c").text(d.label, m.left + 8, y, { continued: true });
        doc.fillColor("#0e1e2c").text(inr(d.amount), { align: "right", width: width - m.left - m.right + 8 });
        y += 14;
      }
      doc.fillColor("#dc2626").font("Helvetica-Bold")
        .text(`Total Deductions    ${inr(data.deductions.reduce((s, d) => s + d.amount, 0))}`, m.left + 8, y);
      y += 20;
    }

    // ── Employer contributions (smaller, informational) ──
    if (data.employer?.length) {
      doc.fillColor("#64748b").fontSize(10).font("Helvetica-Bold")
        .text("Employer Contributions", m.left, y);
      y += 14;
      doc.font("Helvetica").fontSize(9);
      for (const ec of data.employer) {
        doc.fillColor("#64748b").text(`${ec.label}: ${inr(ec.amount)}`, m.left + 8, y);
        y += 12;
      }
      y += 6;
    }

    // ── Attendance summary (informational) ──
    if (data.attendance?.length) {
      doc.fillColor("#475569").fontSize(10).font("Helvetica-Bold")
        .text("Attendance Summary", m.left, y);
      y += 14;
      doc.font("Helvetica").fontSize(9);
      for (const a of data.attendance) {
        doc.fillColor("#475569").text(`${a.label}: ${a.value}`, m.left + 8, y);
        y += 12;
      }
      y += 6;
    }

    // ── Totals divider ──
    doc.rect(m.left, y, width - m.left - m.right, 1).fillColor(theme.secondaryColor || "#94a3b8").fill();
    y += 10;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0e1e2c");
    doc.text(`Gross Earnings      ${inr(data.payroll.gross)}`, m.left, y, { align: "right", width: width - m.left - m.right });
    y += 18;
    doc.fillColor("#dc2626").text(`Total Deductions    ${inr(data.deductions.reduce((s, d) => s + d.amount, 0))}`, m.left, y, { align: "right", width: width - m.left - m.right });
    y += 18;
    doc.fillColor(theme.primaryColor || "#0f766e").fontSize(13)
      .text(`Net Pay             ${inr(data.payroll.net)}`, m.left, y, { align: "right", width: width - m.left - m.right });
    y += 24;

    // ── Tax info ──
    if (data.tax) {
      doc.fontSize(9).fillColor("#64748b").font("Helvetica")
        .text(
          `Tax regime: ${String(data.tax.regime ?? "—")} · Annual tax ${inr(Number(data.tax.annualTax) || 0)} · Monthly ${inr(Number(data.tax.monthlyTax) || 0)}`,
          m.left, y, { width: width - m.left - m.right }
        );
    }

    // ── Footer ──
    doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
      .text(
        "This is a computer-generated payslip. Amounts are shown in Indian Rupees (₹).",
        m.left, doc.page.height - 34, { width: width - m.left - m.right }
      );

    doc.end();
  });
}
