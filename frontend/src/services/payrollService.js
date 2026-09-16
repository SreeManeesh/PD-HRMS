/**
 * Payroll Service
 * Talks to the real backend (VITE_API_URL → /api).
 */

import api from "./api.js";

export const getPayrollRuns = async () => {
  const res = await api.get("/payroll/runs");
  return res.data;
};

export const getPayrollYears = async () => {
  const res = await api.get("/payroll/years");
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

export const getEmployeePayrollSummary = async (employeeId, month, year) => {
  const res = await api.get("/payroll/employee-summary", { params: { employeeId, month, year } });
  return res.data; // { data }
};

/** Batched payroll summaries for all active employees (annual/monthly views). */
export const getEmployeePayrollSummaries = async (month, year) => {
  const res = await api.get("/payroll/employee-summaries", { params: { month, year } });
  return res.data; // { data: rows[] }
};

/**
 * Create a Draft payroll run for a month/year (start of the
 * run → process → approve → distribute flow).
 */
export const createPayrollRun = async (month, year) => {
  const res = await api.post("/payroll/runs", { month, year });
  return res.data;
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

/** Company-level pay config (rates used to build payslips). */
export const getPayrollConfig = async () => {
  const res = await api.get("/company/payroll-config");
  return res.data; // { data }
};

/** Update company-level pay config. */
export const updatePayrollConfig = async (payload) => {
  const res = await api.put("/company/payroll-config", payload);
  return res.data; // { data }
};

// ── Master Wage Rates ──────────────────────────────────────────────────
export const getWageRates = async (params) => {
  const res = await api.get("/payroll/wage-rates", { params });
  return res.data;
};

export const createWageRate = async (data) => {
  const res = await api.post("/payroll/wage-rates", data);
  return res.data;
};

export const updateWageRate = async (id, data) => {
  const res = await api.put(`/payroll/wage-rates/${id}`, data);
  return res.data;
};

export const deleteWageRate = async (id) => {
  const res = await api.delete(`/payroll/wage-rates/${id}`);
  return res.data;
};

/** Joined per-employee Basic + monthly gross (wage rates + overrides + earnings). */
export const getEmployeeWages = async () => {
  const res = await api.get("/payroll/employee-wages");
  return res.data; // { data: [...] }
};

export const runPayrollForSkillGroup = async ({ skillType, month, year }) => {
  const res = await api.post("/payroll/run-skill-group", { skillType, month, year });
  return res.data;
};

export const runPayrollForIndividualEmployee = async ({ employeeId, month, year }) => {
  const res = await api.post("/payroll/run-employee", { employeeId, month, year });
  return res.data;
};

// ── Pay Rules & Incentive Slabs ────────────────────────────────────────
export const getPayrollComponentConfigs = async () => {
  const res = await api.get("/payroll/components");
  return res.data;
};

export const createPayrollComponentConfig = async (data) => {
  const res = await api.post("/payroll/components", data);
  return res.data;
};

export const updatePayrollComponentConfig = async (id, data) => {
  const res = await api.put(`/payroll/components/${id}`, data);
  return res.data;
};

export const deletePayrollComponentConfig = async (id) => {
  const res = await api.delete(`/payroll/components/${id}`);
  return res.data;
};

// ── Salary Advances & Loan Recovery ────────────────────────────────────
export const getSalaryAdvances = async (params) => {
  const res = await api.get("/payroll/advances", { params });
  return res.data;
};

export const createSalaryAdvance = async (data) => {
  const res = await api.post("/payroll/advances", data);
  return res.data;
};

export const updateSalaryAdvance = async (id, data) => {
  const res = await api.put(`/payroll/advances/${id}`, data);
  return res.data;
};

// ── Production Logs ────────────────────────────────────────────────────
export const getProductionRecords = async (params) => {
  const res = await api.get("/payroll/production", { params });
  return res.data;
};

export const createProductionRecord = async (data) => {
  const res = await api.post("/payroll/production", data);
  return res.data;
};

// ── Contractor Billing & Summaries ────────────────────────────────────
export const getContractors = async () => {
  const res = await api.get("/payroll/contractors");
  return res.data;
};

export const createContractor = async (data) => {
  const res = await api.post("/payroll/contractors", data);
  return res.data;
};

export const updateContractor = async (id, data) => {
  const res = await api.put(`/payroll/contractors/${id}`, data);
  return res.data;
};

export const getContractorPayrollReport = async (month, year) => {
  const res = await api.get("/payroll/contractors/report", { params: { month, year } });
  return res.data;
};

