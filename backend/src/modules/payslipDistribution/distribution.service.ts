/**
 * Payslip Distribution Workflow
 * ─────────────────────────────
 * A distribution batch attaches to a payroll run after its payslips exist.
 * For each employee the engine tries the enabled channels in priority order
 * (email → portal → sms). Email is real via SMTP when configured,
 * otherwise it is simulated so the workflow still demos end-to-end. Portal
 * publishes an in-app "Payslip Ready" notification; SMS/WhatsApp are simulated
 * delivery records (no provider credentials in this dev environment).
 */

import nodemailer from "nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { writeAuditLog } from "../../services/audit.service";
import { getPayslipPdf, parseRunPublicId } from "../payroll/payroll.service";

const CHANNEL_PRIORITY = ["email", "portal", "sms"] as const;
export type ChannelName = (typeof CHANNEL_PRIORITY)[number];

export interface DistributionChannelSetting {
  enabled: boolean;
  template?: string;
  fallback?: boolean;
  notify?: boolean;
}
export type DistributionChannels = Partial<Record<ChannelName, DistributionChannelSetting>>;

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function smtpConfigured() {
  // SMTP counts as configured only when a sender address is set and either no
  // credentials are needed or both user+pass are provided.
  return Boolean(env.SMTP_HOST && env.SMTP_FROM_EMAIL && (!env.SMTP_USER || env.SMTP_PASS));
}

function payslipPublicId(run: { month: number; year: number }, code: string): string {
  return `PS-${run.year}-${String(run.month).padStart(2, "0")}-${code}`;
}

function normalizeChannels(input: DistributionChannels): DistributionChannels {
  const def: Record<ChannelName, DistributionChannelSetting> = {
    email: { enabled: true, template: "standard" },
    portal: { enabled: true, notify: true },
    sms: { enabled: false, fallback: true },
  };
  const out: DistributionChannels = {};
  for (const channel of CHANNEL_PRIORITY) {
    out[channel] = { ...def[channel], ...(input?.[channel] ?? {}) };
  }
  return out;
}

interface EmployeeCtx {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
}

type SlipCtx = {
  id: string;
  netPay: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
};

type ChannelResult = {
  channel: ChannelName;
  ok: boolean;
  message: string;
  meta: Record<string, unknown>;
  viewedLink?: string | null;
};

// ── Channel delivery implementations ─────────────────────────────────────

interface DeliveryCtx {
  templateId?: string | null;
}

async function deliverEmail(employee: EmployeeCtx, slip: SlipCtx, run: { month: number; year: number }, template?: string, ctx?: DeliveryCtx): Promise<ChannelResult> {
  const to = employee.email?.trim();
  if (!to) return { channel: "email", ok: false, message: "Employee has no email address", meta: {} };
  const payslipId = payslipPublicId(run, employee.employeeCode);
  const period = `${MONTHS_FULL[run.month - 1]} ${run.year}`;
  const downloadLink = `${env.APP_URL}/payslip/${payslipId}`;
  const net = slip.netPay ?? 0;
  const gross = slip.earnings?.total ?? 0;

  const subject = `Payslip for ${period} - ${employee.firstName} ${employee.lastName}`;
  const bodyHtml = emailBody({
    template: template || "standard",
    companyName: env.SMTP_FROM_NAME || "HRMS",
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    period,
    gross,
    net,
    downloadLink,
    employeeId: employee.employeeCode,
  });

  if (!smtpConfigured()) {
    // Simulated delivery — SMTP is not configured in this environment.
    return {
      channel: "email",
      ok: true,
      message: "Delivered (simulated — SMTP not configured)",
      meta: { simulated: true, to, subject, downloadLink },
      viewedLink: downloadLink,
    };
  }
  try {
    // Attach the payslip generated from the selected (or active) payslip
    // template, so the emailed PDF reflects the exact generated payslip.
    const pdf = await getPayslipPdf(payslipId, undefined, ctx?.templateId ?? undefined);
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    });
    await transporter.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_EMAIL },
      to,
      subject,
      html: bodyHtml,
      attachments: [
        {
          filename: pdf.filename,
          content: pdf.buffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { channel: "email", ok: true, message: "Delivered via SMTP", meta: { to, subject }, viewedLink: downloadLink };
  } catch (error) {
    logger.error({ err: error, employeeCode: employee.employeeCode }, "Payslip email delivery failed");
    return { channel: "email", ok: false, message: "Email provider rejected the message", meta: {} };
  }
}

async function deliverPortal(employee: EmployeeCtx, slip: SlipCtx, run: { month: number; year: number }, notify: boolean): Promise<ChannelResult> {
  if (!employee.userId) return { channel: "portal", ok: false, message: "Employee has no self-service account", meta: {} };
  const payslipId = payslipPublicId(run, employee.employeeCode);
  const period = `${MONTHS_SHORT[run.month - 1]} ${run.year}`;
  if (notify !== false) {
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "New Payslip Available",
        body: `Your payslip for ${MONTHS_FULL[run.month - 1]} ${run.year} is now available in the portal.`,
        category: "Payslip Ready",
        link: `/payslip/${payslipId}`,
      },
    });
  }
  return {
    channel: "portal",
    ok: true,
    message: "Published to employee portal",
    meta: { hasNotification: notify !== false },
    viewedLink: `/payslip/${payslipId}`,
  };
}

async function deliverSms(employee: EmployeeCtx, slip: SlipCtx, run: { month: number; year: number }): Promise<ChannelResult> {
  const phone = employee.phone?.replace(/\D/g, "");
  if (!phone) return { channel: "sms", ok: false, message: "Employee has no phone number", meta: {} };
  const period = `${MONTHS_SHORT[run.month - 1]} ${run.year}`;
  return {
    channel: "sms",
    ok: true,
    message: "Delivered (simulated — SMS provider not configured)",
    meta: { simulated: true, phone, period, netPay: slip.netPay ?? 0 },
  };
}

const CHANNEL_HANDLERS: Record<ChannelName, (employee: EmployeeCtx, slip: SlipCtx, run: { month: number; year: number }, settings: DistributionChannelSetting, ctx: DeliveryCtx) => Promise<ChannelResult>> = {
  email: (e, s, r, c, ctx) => deliverEmail(e, s, r, c.template, ctx),
  portal: (e, s, r, c) => deliverPortal(e, s, r, c.notify !== false && c.notify === true),
  sms: (e, s, r) => deliverSms(e, s, r),
};

// ── Batch orchestration ───────────────────────────────────────────────────

async function runDeliveryForEmployee(
  batch: { id: string },
  recordId: string,
  employee: EmployeeCtx,
  slip: SlipCtx,
  run: { month: number; year: number },
  channels: DistributionChannels,
  ctx: DeliveryCtx = {},
) {
  const results: ChannelResult[] = [];
  let deliveredChannel: ChannelName | null = null;

  for (const channel of CHANNEL_PRIORITY) {
    const settings = channels[channel];
    if (!settings?.enabled) continue;
    const result = await CHANNEL_HANDLERS[channel](employee, slip, run, settings, ctx);
    results.push(result);
    // SMS is the designated fallback: only count it if nothing succeeded yet.
    if (channel === "sms" && deliveredChannel) break;
    if (result.ok && !deliveredChannel) deliveredChannel = channel;
  }

  const primaryOk = results.some((r) => r.ok);
  const status = primaryOk ? "Delivered" : "Failed";
  const errorMessage = !primaryOk ? (results.map((r) => r.message).join("; ") || "All channels failed") : null;

  await prisma.payslipDistributionRecord.update({
    where: { id: recordId },
    data: {
      channel: deliveredChannel ?? "",
      status,
      attempts: { increment: 1 },
      errorMessage,
      deliveredAt: primaryOk ? new Date() : null,
    },
  });

  if (results.length) {
    await prisma.payslipDistributionLog.createMany({
      data: results.map((r) => ({
        batchId: batch.id,
        channel: r.channel,
        status: r.ok ? "Delivered" : "Failed",
        message: r.message,
        meta: r.meta as object,
      })),
    });
  }

  return { primaryOk, results };
}

function toEmployeeCtx(employee: any): EmployeeCtx {
  return {
    id: employee?.id,
    employeeCode: employee?.employeeCode,
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    email: employee?.user?.email ?? employee?.personalEmail ?? null,
    phone: employee?.personalMobile ?? null,
    userId: employee?.userId ?? null,
  };
}

function toSlipCtx(slip: any): SlipCtx {
  return {
    id: slip?.id ?? "",
    netPay: Number(slip?.netPay ?? 0),
    earnings: (slip?.earnings ?? {}) as Record<string, number>,
    deductions: (slip?.deductions ?? {}) as Record<string, number>,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/** Start (or restart) distribution of a payroll run's payslips. */
export async function startDistribution(
  runId: string,
  channelsInput: DistributionChannels,
  options: { employeeIds?: string[]; templateId?: string } = {},
  actorEmployeeId?: string,
) {
  const parsed = parseRunPublicId(runId);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
    include: {
      payslips: {
        include: {
          employee: {
            select: {
              id: true, employeeCode: true, firstName: true, lastName: true,
              personalEmail: true, personalMobile: true, userId: true, user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!run) throw AppError.notFound("Payroll run not found");
  if (run.payslips.length === 0) throw AppError.badRequest("This run has no payslips yet. Process the payroll first.");

  // Employee selection: restrict distribution to the chosen employee codes.
  let payslips = run.payslips;
  const employeeIds = options.employeeIds?.map((id) => String(id).trim().toUpperCase()).filter(Boolean) ?? [];
  if (employeeIds.length) {
    const selected = new Set(employeeIds);
    payslips = payslips.filter((s) => s.employee?.employeeCode && selected.has(s.employee.employeeCode));
    if (payslips.length === 0) {
      throw AppError.badRequest("None of the selected employees have a payslip in this run");
    }
  }

  // Payslip template selection: validate it exists if a specific one is picked.
  let templateId: string | null = null;
  if (options.templateId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.templateId);
    if (!isUuid) throw AppError.badRequest("Selected payslip template not found");
    const template = await prisma.payslipTemplate.findUnique({ where: { id: options.templateId }, select: { id: true } });
    if (!template) throw AppError.badRequest("Selected payslip template not found");
    templateId = template.id;
  }

  const channels = normalizeChannels(channelsInput);
  const enabled = CHANNEL_PRIORITY.some((c) => channels[c]?.enabled);
  if (!enabled) throw AppError.badRequest("At least one distribution channel must be enabled");

  const batch = await prisma.payslipDistributionBatch.create({
    data: {
      payrollRunId: run.id,
      status: "In Progress",
      channels: channels as object,
      templateId,
      config: { employeeIds: employeeIds.length ? employeeIds : null, templateId } as object,
      total: payslips.length,
      startedBy: actorEmployeeId ?? null,
      startedAt: new Date(),
    },
  });

  let deliveredCount = 0;
  let failedCount = 0;
  const deliveryCtx: DeliveryCtx = { templateId };

  for (const slip of payslips) {
    const ctx = toEmployeeCtx(slip.employee);
    const slipCtx = toSlipCtx(slip);
    const record = await prisma.payslipDistributionRecord.create({
      data: { batchId: batch.id, payslipId: slip.id, employeeId: slip.employeeId, status: "Pending", channel: "", attempts: 0 },
    });
    const outcome = await runDeliveryForEmployee(
      { id: batch.id },
      record.id,
      ctx,
      slipCtx,
      { month: run.month, year: run.year },
      channels,
      deliveryCtx,
    );
    if (outcome.primaryOk) deliveredCount += 1;
    else failedCount += 1;
  }

  const completed = await prisma.payslipDistributionBatch.update({
    where: { id: batch.id },
    data: {
      status: failedCount === 0 ? "Completed" : "Partial",
      delivered: deliveredCount,
      failed: failedCount,
      completedAt: new Date(),
    },
  });

  await writeAuditLog({
    action: "CREATE",
    entityType: "PayslipDistributionBatch",
    entityId: batch.id,
    actorUserId: actorEmployeeId ?? undefined,
    newValue: { runId: runId, total: payslips.length, deliveredCount, failedCount, channels, templateId },
  });

  return { data: { ...completed, runId: runId } };
}

/** Delivery status for a run's latest distribution batch. */
export async function distributionStatus(runId: string) {
  const parsed = parseRunPublicId(runId);
  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month: parsed.month, year: parsed.year } } });
  if (!run) throw AppError.notFound("Payroll run not found");

  const batch = await prisma.payslipDistributionBatch.findFirst({
    where: { payrollRunId: run.id },
    orderBy: { createdAt: "desc" },
    include: {
      records: {
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
      logs: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!batch) {
    return { data: { started: false, run: { id: runId, month: run.month, year: run.year } } };
  }

  const channelStats: Record<string, { channel: string; sent: number; delivered: number; failed: number }> = {};
  for (const log of batch.logs) {
    const stat = (channelStats[log.channel] ??= { channel: log.channel, sent: 0, delivered: 0, failed: 0 });
    stat.sent += 1;
    if (log.status === "Delivered") stat.delivered += 1;
    else stat.failed += 1;
  }

  const failedList = batch.records
    .filter((r) => r.status === "Failed")
    .map((r) => ({
      employeeId: r.employee?.employeeCode ?? r.employeeId,
      name: r.employee ? `${r.employee.firstName} ${r.employee.lastName}`.trim() : "—",
      channel: r.channel || "all",
      error: r.errorMessage,
      attempts: r.attempts,
    }));

  const pending = batch.total - batch.delivered - batch.failed;

  return {
    data: {
      started: true,
      id: batch.id,
      status: batch.status,
      total: batch.total,
      delivered: batch.delivered,
      failed: batch.failed,
      pending: Math.max(pending, 0),
      channels: Object.values(channelStats),
      failed_list: failedList,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      run: { id: runId, month: run.month, year: run.year },
    },
  };
}

/** Retry failed deliveries for a run. Optionally limited to specific employees. */
export async function retryFailedDeliveries(runId: string, employeeIds?: string[]) {
  const parsed = parseRunPublicId(runId);
  const run = await prisma.payrollRun.findUnique({
    where: { month_year: { month: parsed.month, year: parsed.year } },
    include: { payslips: true },
  });
  if (!run) throw AppError.notFound("Payroll run not found");

  const batch = await prisma.payslipDistributionBatch.findFirst({
    where: { payrollRunId: run.id },
    orderBy: { createdAt: "desc" },
    include: {
      records: {
        where: { status: "Failed", ...(employeeIds?.length ? { employee: { employeeCode: { in: employeeIds } } } : {}) },
        include: {
          employee: {
            select: {
              id: true, employeeCode: true, firstName: true, lastName: true,
              personalEmail: true, personalMobile: true, userId: true, user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!batch) throw AppError.notFound("No distribution batch found for this run");

  const channels = (batch.channels ?? { email: { enabled: true } }) as DistributionChannels;
  const deliveryCtx: DeliveryCtx = { templateId: batch.templateId };
  let deliveredCount = 0;

  for (const record of batch.records) {
    const slip = run.payslips.find((s) => s.id === record.payslipId);
    if (!slip) continue;
    const outcome = await runDeliveryForEmployee({ id: batch.id }, record.id, toEmployeeCtx(record.employee), toSlipCtx(slip), { month: run.month, year: run.year }, channels, deliveryCtx);
    if (outcome.primaryOk) deliveredCount += 1;
  }

  const stats = await Promise.all([
    prisma.payslipDistributionRecord.count({ where: { batchId: batch.id, status: "Delivered" } }),
    prisma.payslipDistributionRecord.count({ where: { batchId: batch.id, status: "Failed" } }),
  ]);
  await prisma.payslipDistributionBatch.update({
    where: { id: batch.id },
    data: { delivered: stats[0], failed: stats[1], status: stats[1] === 0 ? "Completed" : batch.status, completedAt: new Date() },
  });

  return { data: { retried: batch.records.length, delivered: deliveredCount } };
}

/** Mark a payslip as viewed (called from the employee payslip portal page). */
export async function markPayslipViewed(publicPayslipId: string, access?: { employeeId?: string; role?: string }) {
  // publicPayslipId is PS-YYYY-MM-EMPCODE — resolve to the stored payslip UUID.
  const parts = publicPayslipId.split("-");
  if (parts.length < 4 || parts[0] !== "PS" || !/^\d{4}$/.test(parts[1]) || !/^\d{2}$/.test(parts[2])) {
    return { data: { updated: false } };
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const employeeCode = parts.slice(3).join("-");
  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });
  const employee = await prisma.employee.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!run || !employee) return { data: { updated: false } };
  const payslip = await prisma.payslip.findUnique({
    where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: employee.id } },
    select: { id: true },
  });
  if (!payslip) return { data: { updated: false } };
  // Scope tracking to the employee themselves; HR/Admin can record views broadly.
  const isEmployee = access?.role === "EMPLOYEE";
  const record = await prisma.payslipDistributionRecord.findFirst({
    where: { payslipId: payslip.id, ...(isEmployee ? { employeeId: access?.employeeId } : {}) },
    select: { id: true },
  });
  if (!record) return { data: { updated: false } };
  await prisma.payslipDistributionRecord.updateMany({ where: { id: record.id }, data: { viewedAt: new Date() } });
  return { data: { updated: true } };
}

/** CSV delivery report for a run. */
export async function distributionReport(runId: string): Promise<string> {
  const parsed = parseRunPublicId(runId);
  const run = await prisma.payrollRun.findUnique({ where: { month_year: { month: parsed.month, year: parsed.year } } });
  if (!run) throw AppError.notFound("Payroll run not found");
  const batch = await prisma.payslipDistributionBatch.findFirst({
    where: { payrollRunId: run.id },
    orderBy: { createdAt: "desc" },
    include: {
      records: {
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!batch) throw AppError.notFound("No distribution batch found for this run");

  const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [
    "Period,Employee,Employee ID,Channel,Status,Attempts,Error,Delivered At,Viewed At",
  ];
  for (const r of batch.records) {
    lines.push([
      `${MONTHS_SHORT[run.month - 1]} ${run.year}`,
      r.employee ? `${r.employee.firstName} ${r.employee.lastName}`.trim() : "",
      r.employee?.employeeCode ?? "",
      r.channel || "—",
      r.status,
      r.attempts,
      r.errorMessage ?? "",
      r.deliveredAt ? r.deliveredAt.toISOString() : "",
      r.viewedAt ? r.viewedAt.toISOString() : "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

// ── Email template rendering ──────────────────────────────────────────────

function emailBody(input: { template: string; companyName: string; name: string; period: string; gross: number; net: number; downloadLink: string; employeeId: string }) {
  const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
  if (input.template === "minimal") {
    return `
      <div style="font-family:Arial;max-width:520px;margin:auto;padding:24px">
        <p>Dear ${input.name},</p>
        <p>Your payslip for <strong>${input.period}</strong> is ready.</p>
        <p>Net Pay: <strong>${fmt(input.net)}</strong></p>
        <p><a href="${input.downloadLink}" style="background:#16a34a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block">View Payslip</a></p>
        <p style="font-size:12px;color:#666">${input.companyName} — do not reply to this email.</p>
      </div>`;
  }
  const accent = input.template === "professional" ? "#1a5276" : "#0f766e";
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:10px;overflow:hidden">
          <tr><td style="background:${accent};padding:22px 28px;color:#fff">
            <h2 style="margin:0;font-size:20px">${input.companyName} — Payslip</h2>
            <div style="opacity:.85;font-size:12px;margin-top:2px">${input.period}</div>
          </td></tr>
          <tr><td style="padding:26px 28px">
            <h3 style="margin:0 0 4px">Dear ${input.name},</h3>
            <p style="margin:0 0 16px;color:#334155">Please find your payslip for the month of <strong>${input.period}</strong>.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:8px">
              <tr><td style="padding:12px 16px;color:#475569">Gross Salary</td><td style="padding:12px 16px;text-align:right;font-weight:bold">${fmt(input.gross)}</td></tr>
              <tr><td style="padding:12px 16px;color:#475569">Net Pay</td><td style="padding:12px 16px;text-align:right;font-weight:bold;color:${accent}">${fmt(input.net)}</td></tr>
              <tr><td style="padding:12px 16px;color:#475569">Employee ID</td><td style="padding:12px 16px;text-align:right;font-family:monospace">${input.employeeId}</td></tr>
            </table>
            <p style="margin:18px 0 0">
              <a href="${input.downloadLink}" style="background:${accent};color:#fff;padding:11px 22px;text-decoration:none;border-radius:6px;display:inline-block">Download Payslip</a>
            </p>
            <p style="font-size:12px;color:#64748b;margin-top:20px">This is a system-generated email — please do not reply. For discrepancies contact HR.</p>
          </td></tr>
          <tr><td style="background:#f8fafc;padding:14px 28px;text-align:center;font-size:11px;color:#94a3b8">© ${input.companyName} · Confidential</td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
}