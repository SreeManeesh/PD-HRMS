import PDFDocument from "pdfkit";

import type { Blueprint, BlueprintComponent } from "./types";
import type { ComponentResults } from "./calc";

export interface RenderData {
  employee: Record<string, string | number>;
  payroll: {
    earnings: Record<string, number>;
    deductions: Record<string, number>;
    employer: Record<string, number>;
    gross: number;
    net: number;
  };
  tax?: Record<string, string | number>;
  results: ComponentResults;
}

const inr = (n: number) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

/** Decode a data-URL logo (image/png|jpeg|webp) into a pdfkit-ready buffer. */
function decodeLogo(logo?: string): { buffer: Buffer; kind: string } | null {
  if (!logo || typeof logo !== "string" || !logo.startsWith("data:image/")) return null;
  const comma = logo.indexOf(",");
  if (comma < 0) return null;
  const meta = logo.slice(0, comma);
  const b64 = logo.slice(comma + 1);
  const kind = /image\/(png|jpeg|jpg|webp)/i.exec(meta)?.[1] ?? "png";
  return { buffer: Buffer.from(b64, "base64"), kind };
}

function componentValue(comp: BlueprintComponent, results: ComponentResults): number | null {
  const r = results[comp.id.toLowerCase()];
  return r ? r.final : null;
}

/**
 * Render a payslip PDF from a JSON blueprint + calculated results.
 * Reuses pdfkit (already used project-wide). Layout is derived from the
 * blueprint's theme, nests and components — not hardcoded.
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

    // Header band
    doc.rect(0, 0, width, 70).fill(theme.primaryColor || "#0f766e");
    const logo = decodeLogo(theme.logo);
    if (logo) {
      try {
        doc.image(logo.buffer, m.left, 14, { width: 60, height: 42, fit: [60, 42] });
      } catch {
        // invalid uploaded image — fall through to text-only header
      }
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left + 68, 24, { width: width - m.left - m.right - 68 });
      doc.fontSize(11).font("Helvetica").text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left + 68, 48);
    } else {
      doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold").text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left, 22, { width: width - m.left - m.right });
      doc.fontSize(11).font("Helvetica").text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left, 46);
    }

    let y = 88;

    // Employee info block
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

    // Grouped sections by nest (visual order from blueprint)
    const nestOrder = [...new Set(bp.components.filter((c) => c.nestId).map((c) => c.nestId!))];
    for (const nestId of nestOrder) {
      const nest = bp.nests?.find((n) => n.id === nestId);
      const comps = bp.components.filter((c) => c.nestId === nestId && c.visible !== false);
      if (!comps.length) continue;

      doc.moveDown(0.4);
      doc.fontSize(11).fillColor(theme.primaryColor || "#0f766e").font("Helvetica-Bold").text(nest?.name ?? nestId);
      doc.moveDown(0.2);
      doc.font("Helvetica");
      for (const c of comps) {
        const val = componentValue(c, data.results);
        const amount = val != null ? inr(val) : "—";
        doc.fontSize(9.5).fillColor("#0e1e2c");
        doc.text(`${c.label}`, m.left + 8, undefined, { continued: true });
        doc.text(`${amount}`, { align: "right", width: width - m.left - m.right + 8 });
      }
    }

    // Totals
    doc.moveDown(0.6);
    doc.rect(m.left, doc.y - 6, width - m.left - m.right, 1).fillColor(theme.secondaryColor || "#94a3b8").fill();
    doc.moveDown(0.5);
    const totals = [
      `Gross Earnings      ${inr(data.payroll.gross)}`,
      `Total Deductions    ${inr(Object.values(data.payroll.deductions).reduce((a, b) => a + b, 0))}`,
      `Net Pay             ${inr(data.payroll.net)}`,
    ];
    doc.font("Helvetica-Bold").fontSize(11);
    for (const t of totals) doc.text(t, m.left, undefined, { align: "right", width: width - m.left - m.right });

    if (data.tax) {
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor("#64748b").font("Helvetica");
      doc.text(`Tax regime: ${String(data.tax.regime ?? "—")} · Annual tax ${inr(Number(data.tax.annualTax) || 0)} · Monthly ${inr(Number(data.tax.monthlyTax) || 0)}`, m.left, undefined, { width: width - m.left - m.right });
    }

    // Footer
    doc.fontSize(9).fillColor("#94a3b8").text("Generated by Proteccio Smart Payslip Designer", m.left, doc.page.height - 30);

    doc.end();
  });
}