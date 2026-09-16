/**
 * Employee Service
 * Talks to the real backend (VITE_API_URL → /api).
 */

import api from "./api.js";

export const getEmployees = async ({ search = "", department = "", status = "", skillType = "", limit = 100 } = {}) => {
  const res = await api.get("/employees", {
    params: { search, department, status, skillType, limit },
  });
  return res.data;
};

export const getEmployee = async (id) => {
  const res = await api.get(`/employees/${id}`);
  return res.data;
};

export const createEmployee = async (payload) => {
  const res = await api.post("/employees", payload);
  return res.data;
};

export const updateEmployee = async (id, payload) => {
  const res = await api.put(`/employees/${id}`, payload);
  return res.data;
};

export const deleteEmployee = async (id) => {
  const res = await api.delete(`/employees/${id}`);
  return res.data;
};

export const uploadEmployeePhoto = async (id, formData) => {
  const res = await api.post(`/employees/${id}/photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30000,
  });
  return res.data;
};

export const previewBulkEmployees = async (formData) => {
  const res = await api.post("/employees/bulk/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return res.data;
};

export const bulkUploadEmployees = async (formData) => {
  const res = await api.post("/employees/bulk", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
  });
  return res.data;
};

export const undoBulkEmployees = async (batchId) => {
  const res = await api.post("/employees/bulk/undo", { batchId });
  return res.data;
};

export const getWizardSession = async () => {
  const res = await api.get("/wizard/session");
  return res.data?.data ?? {};
};
