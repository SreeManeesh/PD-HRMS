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
