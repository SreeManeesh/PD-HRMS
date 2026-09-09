/**
 * Payroll Service
 * Talks to the real backend (VITE_API_URL → /api).
 */

import api from "./api.js";

export const getPayrollRuns = async () => {
  const res = await api.get("/payroll/runs");
  return res.data;
};

export const getPayslips = async (employeeId = "EMP001") => {
  const res = await api.get("/payroll/payslips", { params: { employeeId } });
  return res.data;
};

export const getPayslip = async (id) => {
  const res = await api.get(`/payroll/payslips/${id}`);
  return res.data;
};

/** Stored payslips that belong to a payroll run (PR-YYYY-MM). */
export const getRunPayslips = async (payrollRunId) => {
  const res = await api.get(`/payroll/runs/${payrollRunId}/payslips`);
  return res.data; // { data }
};

/** Rupee-formatted PDF download URL for a payslip (PS-YYYY-MM-EMPCODE). */
export const payslipPdfUrl = (id) =>
  `${import.meta.env.VITE_API_URL || "/api"}/payroll/payslips/${id}/pdf`;

/**
 * Download a payslip PDF via axios (carries the Bearer auth token) and return
 * the blob. The caller opens/saves it. A plain anchor can't send the auth
 * header, which is why we fetch through the axios client.
 */
export const downloadPayslipPdf = async (id) => {
  const res = await api.get(`/payroll/payslips/${id}/pdf`, { responseType: "blob" });
  const disposition = res.headers?.["content-disposition"] || "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    blob: res.data,
    filename: match ? match[1] : `payslip_${id}.pdf`,
  };
};

export const getEmployeePayrollSummary = async (employeeId, month, year) => {
  const res = await api.get("/payroll/employee-summary", { params: { employeeId, month, year } });
  return res.data; // { data }
};

/**
 * Run Payroll (high-impact — requires 4-eyes confirmation in the UI)
 */
export const runPayroll = async (payrollRunId) => {
  const res = await api.post(`/payroll/runs/${payrollRunId}/process`);
  return res.data;
};

/**
 * Approve a processed payroll run (four-eyes — requires payroll:approve).
 */
export const approvePayrollRun = async (payrollRunId) => {
  const res = await api.post(`/payroll/runs/${payrollRunId}/approve`);
  return res.data;
};

// ── Payslip Distribution ──────────────────────────────────────────────────

/** Start (or restart) distribution for a payroll run.
 *  channels: per-channel config; employeeIds: employee codes to include
 *  (empty = all); templateId: a specific payslip designer template (empty = active). */
export const startDistribution = async (payrollRunId, { channels, employeeIds = [], templateId = "" } = {}) => {
  const res = await api.post(`/payroll/runs/${payrollRunId}/distribute`, {
    channels,
    employeeIds: employeeIds.length ? employeeIds : undefined,
    templateId: templateId || undefined,
  });
  return res.data;
};

/** Delivery status for a run's latest distribution batch. */
export const getDistributionStatus = async (payrollRunId) => {
  const res = await api.get(`/payroll/runs/${payrollRunId}/distribution/status`);
  return res.data; // { data }
};

/** Past payslip distribution transactions for a month (history). */
export const getDistributionHistory = async (month, year) => {
  const res = await api.get("/payroll/distribution/history", { params: { month, year } });
  return res.data; // { data: transactions[] }
};

/** Retry failed deliveries (optionally limited to specific employees). */
export const retryDistribution = async (payrollRunId, employeeIds = []) => {
  const res = await api.post(`/payroll/runs/${payrollRunId}/distribution/retry`, { employeeIds });
  return res.data;
};

/** Download the delivery report CSV via axios (auth header). */
export const downloadDistributionReport = async (payrollRunId) => {
  const res = await api.get(`/payroll/runs/${payrollRunId}/distribution/report`, { responseType: "blob" });
  const disposition = res.headers?.["content-disposition"] || "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    blob: res.data,
    filename: match ? match[1] : `delivery_report_${payrollRunId}.csv`,
  };
};

/** Record that an employee viewed their payslip (secure portal link). */
export const markPayslipViewed = async (payslipId) => {
  const res = await api.post(`/payroll/payslips/${payslipId}/view`);
  return res.data;
};
