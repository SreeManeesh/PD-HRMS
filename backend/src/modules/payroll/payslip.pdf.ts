import PDFDocument from "pdfkit";

/** Indian Rupee formatter used across the generated payslip. */
const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n) || 0);

export interface PayslipPdfData {
  companyName?: string;
  employeeName: string;
  employeeId: string;
  department?: string;
  designation?: string;
  period: string;
  paidOn?: string | null;
  paymentMode?: string;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  netPay: number;
  gross: number;
}

const labelOf = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

/**
 * Render a single payslip PDF (rupee-formatted) using the same pdfkit
 * approach as other PDFs in the project.
 */
export function generatePayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const margin = 42;

    // Header
    doc.rect(0, 0, width, 78).fill("#0f766e");
    doc.fillColor("#ffffff")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(data.companyName || "Proteccio HRMS", margin, 20, { width: width - margin * 2 });
    doc.fontSize(11).font("Helvetica").text("Salary Payslip", margin, 46);
    doc.fontSize(9).opacity(0.8).text(`Period: ${data.period}`, width - margin - 120, 46, { width: 120, align: "right" });
    doc.opacity(1);

    let y = 100;

    // Employee details
    doc.fillColor("#0e1e2c").fontSize(10).font("Helvetica-Bold").text("Employee Details", margin, y);
    doc.font("Helvetica").fontSize(9.5);
    y += 16;
    const empRows: [string, string][] = [
      ["Name", data.employeeName],
      ["Employee ID", data.employeeId],
      ["Department", data.department || "—"],
      ["Designation", data.designation || "—"],
      ["Payment mode", data.paymentMode || "Bank Transfer"],
      ["Paid on", data.paidOn ? new Date(data.paidOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"],
    ];
    empRows.forEach(([k, v]) => {
      doc.fillColor("#3d5a70").text(k, margin, y, { width: 160 });
      doc.fillColor("#0e1e2c").text(String(v), margin + 160, y, { width: width - margin * 2 - 160 });
      y += 14;
    });

    y += 8;

    // Earnings
    y = section(doc, "Earnings", data.earnings, y, margin, width, "#16a34a");

    // Deductions
    y = section(doc, "Deductions", data.deductions, y, margin, width, "#dc2626");

    // Totals
    y += 10;
    doc.rect(margin, y - 6, width - margin * 2, 1).fillColor("#dde5ee").fill();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0e1e2c");
    doc.text("Gross Earnings", margin, y, { width: 200 });
    doc.text(inr(data.gross), { align: "right", width: width - margin * 2 });
    y += 18;
    doc.text("Total Deductions", margin, y, { width: 200 });
    doc.fillColor("#dc2626").text(`− ${inr(Object.values(data.deductions).reduce((a, b) => a + b, 0))}`, { align: "right", width: width - margin * 2 });
    y += 18;
    doc.fillColor("#0f766e").fontSize(13).text("Net Pay", margin, y, { width: 200 });
    doc.text(inr(data.netPay), { align: "right", width: width - margin * 2 });
    y += 24;

    doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
      .text("This is a computer-generated payslip. Amounts are shown in Indian Rupees (₹).", margin, doc.page.height - 34, { width: width - margin * 2 });

    doc.end();
  });
}

function section(
  doc: PDFKit.PDFDocument,
  title: string,
  entries: Record<string, number>,
  y: number,
  margin: number,
  width: number,
  color: string
): number {
  const items = Object.entries(entries || {}).filter(([k, v]) => k !== "total" && Number(v) > 0);
  const total = Number(entries?.total || 0);

  doc.fillColor(Color.GREY).fontSize(10).font("Helvetica-Bold").text(title, margin, y);
  y += 14;
  doc.font("Helvetica").fontSize(9.5);
  items.forEach(([k, v]) => {
    doc.fillColor("#3d5a70").text(labelOf(k), margin, y, { width: 240 });
    doc.fillColor("#0e1e2c").text(inr(Number(v)), { align: "right", width: width - margin * 2 });
    y += 14;
  });
  doc.fillColor(color).font("Helvetica-Bold").text(`Total ${title}`, margin, y, { width: 240 });
  doc.text(`${title === "Deductions" ? "− " : ""}${inr(total)}`, { align: "right", width: width - margin * 2 });
  y += 26;
  return y;
}

const Color = { GREY: "#64748b" };