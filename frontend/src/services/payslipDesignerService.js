/**
 * Smart Payslip Designer service.
 * Talks to the real backend (VITE_API_URL → /api/payslip).
 */

import api from "./api.js";

export const listPayslipTemplates = async () => {
  const res = await api.get("/payslip/templates");
  return res.data; // { data }
};

export const getPayslipTemplate = async (id) => {
  const res = await api.get(`/payslip/templates/${id}`);
  return res.data;
};

export const createPayslipTemplate = async (payload) => {
  const res = await api.post("/payslip/templates", payload);
  return res.data;
};

export const savePayslipDraft = async (id, blueprint, summary) => {
  const res = await api.put(`/payslip/templates/${id}`, { blueprint, summary });
  return res.data;
};

export const listPayslipVersions = async (id) => {
  const res = await api.get(`/payslip/templates/${id}/versions`);
  return res.data;
};

export const getPayslipVersion = async (id, version) => {
  const res = await api.get(`/payslip/templates/${id}/versions/${version}`);
  return res.data;
};

export const publishPayslipTemplate = async (id, version) => {
  const res = await api.post(`/payslip/templates/${id}/publish`, { version });
  return res.data;
};

export const restorePayslipVersion = async (id, version) => {
  const res = await api.post(`/payslip/templates/${id}/restore/${version}`);
  return res.data;
};

export const getComponentCatalog = async () => {
  const res = await api.get("/payslip/catalog");
  return res.data;
};

export const getDefaultNests = async () => {
  const res = await api.get("/payslip/nests");
  return res.data;
};

export const getAutoConfig = async (params) => {
  const res = await api.get("/payslip/auto-config", { params });
  return res.data;
};

export const calculateBlueprint = async (blueprint, base = {}, external = {}) => {
  const res = await api.post("/payslip/calculate", { blueprint, base, external });
  return res.data;
};

export const calculateTaxForBlueprint = async (blueprint, base = {}, regime = "NEW") => {
  const res = await api.post("/payslip/calculate-tax", { blueprint, base, regime });
  return res.data;
};

export const compareTaxForBlueprint = async (blueprint, base = {}) => {
  const res = await api.post("/payslip/compare-tax", { blueprint, base });
  return res.data;
};

export const validateBlueprint = async (blueprint) => {
  const res = await api.post("/payslip/validate", { blueprint });
  return res.data;
};

export const previewPayslip = async (id, { employeeId, month, year }) => {
  const res = await api.get(`/payslip/templates/${id}/preview`, {
    params: { employeeId, month, year },
  });
  return res.data;
};

export const getTaxSelection = async ({ employeeId, year } = {}) => {
  const res = await api.get("/payslip/tax-selection", { params: { employeeId, year } });
  return res.data;
};

export const setTaxSelection = async ({ employeeId, regime, year }) => {
  const res = await api.put("/payslip/tax-selection", { employeeId, regime, year });
  return res.data;
};