import PDFDocument from "pdfkit";

import type { Blueprint, BlueprintComponent } from "./types";
import { buildNestTree, type NestTree } from "./nesting";

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
  /** Optional nesting/blueprint-driven layout. When present the renderer draws
   *  these sections (in order) instead of the flat earnings/deductions blocks —
   *  making the export reflect the Nesting manager and designer additions. */
  sections?: RenderSection[];
  /** Production payslip company branding (reference corporate layout). */
  company?: {
    name?: string;
    tagline?: string;
    website?: string;
    address?: string;
    logoDataUri?: string;
    signatoryName?: string;
    signatoryDesignation?: string;
    signatureDataUri?: string;
  };
  generatedOn?: string;
  netInWords?: string;
  payPeriodLabel?: string;
  countryLabel?: string;
  attNumbers?: Record<string, number>;
}

export interface ComponentRow {
  label: string;
  amount: number;
  kind: string;
  nestId?: string | null;
  priority: number;
}

export interface RenderSection {
  title: string;
  kind: "earning" | "deduction" | "employer" | "mixed";
  rows: { label: string; amount: number }[];
}

/** Group blueprint component rows into printable sections following the
 *  nesting tree (depth-first), falling back to kind-based sections for
 *  components without a nest. */
export function buildSections(blueprint: Blueprint, rows: ComponentRow[]): RenderSection[] {
  const nests = blueprint.nests || [];
  const nestById = new Map(nests.map((n) => [n.id, n]));
  const tree = buildNestTree(nests);
  const sections: RenderSection[] = [];
  const emit = (title: string, comps: ComponentRow[]) => {
    if (!comps.length) return;
    const kinds = new Set(comps.map((c) => (c.kind === "reimbursement" ? "earning" : c.kind)));
    const kind = kinds.size > 1
      ? "mixed"
      : kinds.has("deduction") ? "deduction"
      : kinds.has("employer") ? "employer"
      : "earning";
    const sorted = [...comps].sort((a, b) => a.priority - b.priority);
    sections.push({ title, kind, rows: sorted.map(({ label, amount }) => ({ label, amount })) });
  };
  const walk = (n: NestTree) => {
    emit(n.name, rows.filter((r) => r.nestId === n.id));
    (n.children || []).forEach(walk);
  };
  tree.forEach(walk);
  const orphan = rows.filter((r) => !r.nestId || !nestById.has(r.nestId));
  if (orphan.length) {
    const byKind: [string, string][] = [
      ["earning", "Earnings"],
      ["deduction", "Deductions"],
      ["employer", "Employer Contributions"],
    ];
    for (const [kind, title] of byKind) {
      const comps = orphan.filter((r) =>
        kind === "earning" ? r.kind === "earning" || r.kind === "reimbursement" : r.kind === kind
      );
      emit(title, comps);
    }
  }
  return sections;
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
  const reference = Boolean(data.company || data.netInWords);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: theme.pageSize || "A4", layout: orientation, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const m = theme.margins || { top: 40, right: 40, bottom: 40, left: 40 };
    const contentW = width - m.left - m.right;
    let y = m.top || 40;

    const ensureSpace = (h: number) => {
      if (y + h > doc.page.height - 60) {
        doc.addPage();
        y = m.top || 40;
      }
    };

    const CHARCOAL = "#1f2937";
    const GREEN = "#16a34a";
    const LIGHT_GREEN = "#f0fdf4";
    const GRAY = "#6b7280";
    const BORDER = "#e5e7eb";

    if (reference) {
      // ═══════════════════════════ HEADER ═══════════════════════════
      const company = data.company || {};
      const logo = decodeLogo(company.logoDataUri);
      let headerTextX = m.left;
      if (logo) {
        try {
          doc.image(logo.buffer, m.left, y, { width: 44, height: 44, fit: [44, 44] });
          headerTextX = m.left + 56;
        } catch { /* skip */ }
      }
      doc.font("Helvetica-Bold").fontSize(18).fillColor(CHARCOAL)
        .text(String(company.name || data.employee.companyName || "HRMS"), headerTextX, y, { width: contentW - 56 });
      doc.font("Helvetica").fontSize(9).fillColor(GRAY)
        .text(String(company.tagline || "HRMS  ·  People | Process | Progress"), headerTextX, y + 22, { width: contentW - 56 });

      const tag = "Building\nBetter Workplaces\nTogether";
      doc.font("Helvetica-Bold").fontSize(10).fillColor(GREEN)
        .text(tag, m.left, y + 2, { align: "right", width: contentW, height: 44, lineGap: 2 });

      // subtle green accent line
      y += 56;
      doc.rect(m.left, y, contentW, 2).fillColor(GREEN).fill();
      y += 18;

      // ═══════════════════════════ TITLE ═══════════════════════════
      doc.font("Helvetica-Bold").fontSize(24).fillColor(CHARCOAL)
        .text("Salary Payslip", m.left, y);
      y += 26;
      doc.font("Helvetica").fontSize(9.5).fillColor(GRAY)
        .text(String(data.payPeriodLabel || "") + (data.countryLabel ? `  |  ${data.countryLabel}` : ""), m.left, y, { width: contentW, characterSpacing: 1.2 });
      y += 20;

      // ═══════════════════════════ EMPLOYEE CARD ═══════════════════════════
      ensureSpace(150);
      const cardPad = 14;
      const empCardH = 132;
      doc.roundedRect(m.left, y, contentW, empCardH, 10).fillColor(LIGHT_GREEN).fill();
      doc.rect(m.left, y + 8, contentW, 1).fillColor("#bbf7d0").fill();

      const initials = String(data.employee.name || "—")
        .split(/\s+/).map((s) => s[0] || "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";
      const avatarX = m.left + cardPad;
      const avatarY = y + cardPad;
      doc.circle(avatarX + 22, avatarY + 22, 22).fillColor(GREEN).fill();
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(initials, avatarX + 22, avatarY + 15, { width: 44, align: "center" });

      doc.font("Helvetica-Bold").fontSize(10).fillColor(CHARCOAL).text("Employee Details", avatarX + 58, avatarY + 4);
      const empRows: [string, string | number][] = [
        ["Name", data.employee.name ?? "—"],
        ["Employee ID", data.employee.employeeId ?? "—"],
        ["Department", data.employee.department ?? "—"],
        ["Designation", data.employee.designation ?? "—"],
      ];
      let ey = avatarY + 24;
      for (const [label, val] of empRows) {
        doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(label.toUpperCase(), avatarX + 58, ey);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(CHARCOAL).text(String(val) || "—", avatarX + 160, ey, { width: 150 });
        ey += 20;
      }

      const col2X = m.left + contentW / 2 + 6;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(CHARCOAL).text("Payroll", col2X, avatarY + 4);
      const empRows2: [string, string | number][] = [
        ["Pay Period", String(data.employee.period ?? "—")],
        ["Location", data.employee.location ?? "—"],
        ["Tax Regime", data.employee.taxRegime ?? "—"],
        ["PAN", data.employee.pan ?? "—"],
        ["Date of Joining", data.employee.dateOfJoining ?? "—"],
      ];
      ey = avatarY + 24;
      for (const [label, val] of empRows2) {
        doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(label.toUpperCase(), col2X, ey);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(CHARCOAL).text(String(val) || "—", col2X + 118, ey, { width: contentW / 2 - 150 });
        ey += 17;
      }
      y += empCardH + 18;

      // ═══════════════════════════ EARNINGS / DEDUCTIONS CARDS ═══════════════════════════
      const halfW = (contentW - 14) / 2;
      const drawMoneyCard = (x: number, w: number, title: string, rows: { label: string; amount: number }[], total: number, accent: string, noRowsText: string) => {
        ensureSpace(80);
        const rowsCount = Math.max(rows.length, rows.length === 0 ? 0 : 0);
        const boxH = 24 + rowsCount * 15 + 24 + 12;
        doc.roundedRect(x, y, w, boxH, 8).fillColor("#ffffff").strokeColor(BORDER).lineWidth(0.6).stroke();
        doc.font("Helvetica-Bold").fontSize(11).fillColor(accent).text(title, x + 12, y + 10);
        doc.rect(x + 12, y + 28, w - 24, 0.6).fillColor(BORDER).fill();
        let ry = y + 36;
        if (!rows.length) {
          doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text(noRowsText, x + 12, ry);
          ry += 16;
        } else {
          for (const r of rows) {
            doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text(r.label, x + 12, ry, { width: w - 90 });
            doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CHARCOAL).text(inr(r.amount), x + w - 90, ry, { width: w - 24 - (w - 90 - 12), align: "right" });
            ry += 15;
          }
        }
        doc.rect(x + 12, ry - 8, w - 24, 0.6).fillColor(BORDER).fill();
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(CHARCOAL).text(`Total  ${title.split(" ")[0]}`, x + 12, ry);
        doc.font("Helvetica-Bold").fontSize(11).fillColor(total >= 0 ? CHARCOAL : "#dc2626").text(inr(total), x + 12, ry, { width: w - 24, align: "right" });
      };

      const earH = 24 + Math.max(data.earnings.length, 1) * 15 + 24 + 12;
      const dedH = 24 + Math.max(data.deductions.length, 1) * 15 + 24 + 12;
      const cardH = Math.max(earH, dedH);
      drawMoneyCard(m.left, halfW, "+  Earnings", data.earnings, data.payroll.gross, GREEN, "No Earnings\n—");
      drawMoneyCard(m.left + halfW + 14, halfW, "−  Deductions", data.deductions, data.deductions.reduce((s, d) => s + d.amount, 0), "#0ea5e9", "No Deductions\n—");
      y += cardH + 16;

      // ═══════════════════════════ EMPLOYER CONTRIBUTIONS ═══════════════════════════
      if (data.employer?.length) {
        ensureSpace(70);
        const boxH = 24 + data.employer.length * 15 + 18;
        doc.roundedRect(m.left, y, contentW, boxH, 8).fillColor("#ffffff").strokeColor(BORDER).lineWidth(0.6).stroke();
        doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN).text("Employer Contributions", m.left + 12, y + 10);
        doc.rect(m.left + 12, y + 28, contentW - 24, 0.6).fillColor(BORDER).fill();
        let ry = y + 36;
        for (const r of data.employer) {
          doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text(r.label, m.left + 12, ry, { width: contentW - 140 });
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CHARCOAL).text(inr(r.amount), m.left + contentW - 128, ry, { width: 118, align: "right" });
          ry += 15;
        }
        doc.font("Helvetica").fontSize(8).fillColor(GRAY)
          .text("Employer contributions are paid by the company and do not reduce employee net pay.", m.left + 12, ry);
        y += boxH + 14;
      }

      // ═══════════════════════════ ATTENDANCE ═══════════════════════════
      if (data.attNumbers && Object.keys(data.attNumbers).length) {
        ensureSpace(60);
        const a = data.attNumbers;
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(CHARCOAL).text("Attendance Summary", m.left, y);
        y += 14;
        const items: [string, number][] = [
          ["Working Days", a.workingDays ?? 0],
          ["Present", a.presentDays ?? 0],
          ["Late", a.lateDays ?? 0],
          ["Paid Leave", a.paidLeaveDays ?? 0],
          ["LOP", a.unpaidLeaveDays ?? 0],
          ["Holidays", a.holidayDays ?? 0],
          ["Weekly Offs", a.weeklyOffDays ?? 0],
          ["Overtime (hrs)", a.overtimeHours ?? 0],
        ];
        const boxW = Math.floor(contentW / items.length);
        doc.font("Helvetica").fontSize(8.5).fillColor(GRAY);
        items.forEach(([label], i) => doc.text(label, m.left + i * boxW, y, { width: boxW - 4 }));
        y += 12;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CHARCOAL);
        items.forEach(([, v], i) => doc.text(String(v ?? "—"), m.left + i * boxW, y, { width: boxW - 4 }));
        y += 16;
      }

      // ═══════════════════════════ SALARY SUMMARY ═══════════════════════════
      ensureSpace(120);
      const gross = data.payroll.gross;
      const dedTotal = data.deductions.reduce((s, d) => s + d.amount, 0);
      const net = data.payroll.net;
      const sumH = 120;
      doc.roundedRect(m.left, y, contentW, sumH, 10).fillColor(LIGHT_GREEN).fill();
      doc.rect(m.left, y + 10, contentW, 1).fillColor("#bbf7d0").fill();
      doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text("Gross Earnings", m.left + 16, y + 20);
      doc.font("Helvetica-Bold").fontSize(13).fillColor(CHARCOAL).text(inr(gross), m.left + 16, y + 34);

      doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text("Total Deductions", m.left + contentW / 3 + 16, y + 20);
      doc.font("Helvetica-Bold").fontSize(13).fillColor(CHARCOAL).text(inr(dedTotal), m.left + contentW / 3 + 16, y + 34);

      doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text("Net Pay", m.left + (2 * contentW) / 3 + 16, y + 20);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(GREEN).text(inr(net), m.left + (2 * contentW) / 3 + 16, y + 32);

      doc.font("Helvetica").fontSize(9.5).fillColor(CHARCOAL).text("In Words", m.left + 16, y + 70);
      doc.font("Helvetica").fontSize(10.5).fillColor(CHARCOAL).text(String(data.netInWords || "—"), m.left + 16, y + 84, { width: contentW - 32 });

      // tax line
      if (data.tax) {
        doc.font("Helvetica").fontSize(9).fillColor(GRAY)
          .text(
            `Tax regime: ${String(data.tax.regime ?? "—")}  ·  Annual tax ${inr(Number(data.tax.annualTax) || 0)}  ·  Monthly ${inr(Number(data.tax.monthlyTax) || 0)}`,
            m.left + 16, y + 104, { width: contentW - 32 }
          );
        y += sumH + 20;
      } else {
        y += sumH + 14;
      }

      // ═══════════════════════════ GENERATED / SIGNATURE ═══════════════════════════
      ensureSpace(120);
      doc.font("Helvetica").fontSize(9).fillColor(GRAY)
        .text(`Generated On: ${data.generatedOn || "—"}`, m.left, y);
      doc.text("This is a computer-generated payslip. Amounts are shown in Indian Rupees (₹).", m.left, y + 14, { width: contentW * 0.55 });

      const sig = decodeLogo(company.signatureDataUri);
      const sigX = m.left + contentW - 180;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(CHARCOAL).text("Authorized Signatory", sigX, y, { width: 180, align: "right" });
      if (sig) {
        try {
          doc.image(sig.buffer, sigX + 180 - 90, y + 12, { width: 70, height: 36, fit: [70, 36] });
        } catch { /* skip */ }
      } else {
        doc.rect(sigX + 180 - 90, y + 14, 70, 32).fillColor("#ffffff").strokeColor(BORDER).lineWidth(0.6).stroke();
        doc.font("Helvetica").fontSize(8).fillColor(GRAY).text("Signature", sigX + 180 - 90, y + 30, { width: 70, align: "center" });
      }
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CHARCOAL).text(String(company.signatoryName || "—"), sigX, y + 52, { width: 180, align: "right" });
      doc.font("Helvetica").fontSize(8.5).fillColor(GRAY).text(String(company.signatoryDesignation || "Authorized Signatory"), sigX, y + 66, { width: 180, align: "right" });

      // ═══════════════════════════ FOOTER ═══════════════════════════
      const footerY = doc.page.height - 46;
      doc.rect(m.left, footerY - 8, contentW, 1).fillColor(BORDER).fill();
      doc.font("Helvetica").fontSize(8).fillColor(GRAY)
        .text(`${String(company.name || "HRMS")}  ·  People | Process | Progress`, m.left, footerY, { width: contentW * 0.6 });
      doc.text(String(company.website || ""), m.left + contentW - 160, footerY, { width: 160, align: "right" });

      doc.end();
      return;
    }

    // ── Legacy / designer-preview renderer (blueprint sections flow) ──
    doc.rect(0, 0, width, 70).fill(theme.primaryColor || "#0f766e");
    const logo = decodeLogo(theme.logo);
    if (logo) {
      try {
        doc.image(logo.buffer, m.left, 14, { width: 60, height: 42, fit: [60, 42] });
      } catch { /* invalid image — skip */ }
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
        .text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left + 68, 24, { width: contentW - 68 });
      doc.fontSize(11).font("Helvetica")
        .text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left + 68, 48);
    } else {
      doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
        .text(String(data.employee.companyName ?? "Proteccio HRMS"), m.left, 22, { width: contentW });
      doc.fontSize(11).font("Helvetica")
        .text(`Salary Payslip · ${bp.financialYear} · ${bp.country}${bp.state ? `, ${bp.state}` : ""}`, m.left, 46);
    }

    y = 88;

    doc.fontSize(10).fillColor("#0e1e2c").font("Helvetica-Bold").text("Employee", m.left, y);
    doc.font("Helvetica").fontSize(9.5);
    const empLines = [
      `Name: ${data.employee.name ?? "—"}`,
      `ID: ${data.employee.employeeId ?? "—"}`,
      `Department: ${data.employee.department ?? "—"}`,
      `Designation: ${data.employee.designation ?? "—"}`,
      `Period: ${data.employee.period ?? bp.name}`,
    ];
    doc.text(empLines.join("\n"), m.left, y + 14, { width: contentW, lineGap: 4 });
    y += 14 + empLines.length * 13 + 10;

    if (data.sections?.length) {
      for (const sec of data.sections) {
        ensureSpace(34);
        const color = sec.kind === "deduction" ? "#dc2626" : sec.kind === "employer" ? "#64748b" : (theme.primaryColor || "#16a34a");
        doc.fontSize(11).fillColor(color).font("Helvetica-Bold").text(sec.title, m.left, y);
        y += 16;
        doc.font("Helvetica").fontSize(9.5);
        for (const rw of sec.rows) {
          ensureSpace(14);
          doc.fillColor("#0e1e2c").text(rw.label, m.left + 8, y, { continued: true });
          doc.fillColor("#0e1e2c").text(inr(rw.amount), { align: "right", width: contentW + 8 });
          y += 14;
        }
        y += 8;
      }
    } else {
      if (data.earnings.length) {
        doc.fontSize(11).fillColor(theme.primaryColor || "#16a34a").font("Helvetica-Bold").text("Earnings", m.left, y);
        y += 16;
        doc.font("Helvetica").fontSize(9.5);
        for (const e of data.earnings) {
          ensureSpace(14);
          doc.fillColor("#0e1e2c").text(e.label, m.left + 8, y, { continued: true });
          doc.fillColor("#0e1e2c").text(inr(e.amount), { align: "right", width: contentW + 8 });
          y += 14;
        }
        doc.fillColor(theme.primaryColor || "#16a34a").font("Helvetica-Bold")
          .text(`Total Earnings    ${inr(data.payroll.gross)}`, m.left + 8, y);
        y += 20;
      }
      if (data.deductions.length) {
        doc.fillColor("#dc2626").fontSize(11).font("Helvetica-Bold").text("Deductions", m.left, y);
        y += 16;
        doc.font("Helvetica").fontSize(9.5);
        for (const d of data.deductions) {
          ensureSpace(14);
          doc.fillColor("#0e1e2c").text(d.label, m.left + 8, y, { continued: true });
          doc.fillColor("#0e1e2c").text(inr(d.amount), { align: "right", width: contentW + 8 });
          y += 14;
        }
        doc.fillColor("#dc2626").font("Helvetica-Bold")
          .text(`Total Deductions    ${inr(data.deductions.reduce((s, d) => s + d.amount, 0))}`, m.left + 8, y);
        y += 20;
      }
      if (data.employer?.length) {
        doc.fillColor("#64748b").fontSize(10).font("Helvetica-Bold").text("Employer Contributions", m.left, y);
        y += 14;
        doc.font("Helvetica").fontSize(9);
        for (const ec of data.employer) {
          doc.fillColor("#64748b").text(`${ec.label}: ${inr(ec.amount)}`, m.left + 8, y);
          y += 12;
        }
        y += 6;
      }
    }

    if (data.attendance?.length) {
      doc.fillColor("#475569").fontSize(10).font("Helvetica-Bold").text("Attendance Summary", m.left, y);
      y += 14;
      doc.font("Helvetica").fontSize(9);
      for (const a of data.attendance) {
        doc.fillColor("#475569").text(`${a.label}: ${a.value}`, m.left + 8, y);
        y += 12;
      }
      y += 6;
    }

    doc.rect(m.left, y, contentW, 1).fillColor(theme.secondaryColor || "#94a3b8").fill();
    y += 10;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0e1e2c");
    doc.text(`Gross Earnings      ${inr(data.payroll.gross)}`, m.left, y, { align: "right", width: contentW });
    y += 18;
    doc.fillColor("#dc2626").text(`Total Deductions    ${inr(data.deductions.reduce((s, d) => s + d.amount, 0))}`, m.left, y, { align: "right", width: contentW });
    y += 18;
    doc.fillColor(theme.primaryColor || "#0f766e").fontSize(13)
      .text(`Net Pay             ${inr(data.payroll.net)}`, m.left, y, { align: "right", width: contentW });
    y += 24;
    if (data.tax) {
      doc.fontSize(9).fillColor("#64748b").font("Helvetica")
        .text(
          `Tax regime: ${String(data.tax.regime ?? "—")} · Annual tax ${inr(Number(data.tax.annualTax) || 0)} · Monthly ${inr(Number(data.tax.monthlyTax) || 0)}`,
          m.left, y, { width: contentW }
        );
    }
    doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
      .text(
        "This is a computer-generated payslip. Amounts are shown in Indian Rupees (₹).",
        m.left, doc.page.height - 34, { width: contentW }
      );

    doc.end();
  });
}
