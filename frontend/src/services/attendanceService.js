/**
 * Attendance Service
 * Talks to the real backend (VITE_API_URL → /api).
 */

import api from "./api.js";

export const getMyAttendance = async ({ employeeId, day, month, year } = {}) => {
  const res = await api.get("/attendance", { params: { employeeId, day, month, year, limit: 100 } });
  return res.data; // { data, total }
};

export const getTeamSummary = async ({ month, year } = {}) => {
  const res = await api.get("/attendance/summary", { params: { month, year } });
  return res.data; // { data }
};

export const checkIn = async (employeeId, method = "Web") => {
  const res = await api.post("/attendance/check-in", { employeeId, method });
  return res.data;
};

export const checkOut = async (employeeId) => {
  const res = await api.post("/attendance/check-out", { employeeId });
  return res.data;
};

export const uploadAttendanceFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  // axios sets the multipart boundary automatically when posting FormData.
  // Supports: xlsx, xlsm, xlsb, xls, xltx, xltm, xlt, xlam, xla, xlw, csv, tsv, txt, prn, dif, slk, xml
  const res = await api.post("/attendance/upload", formData, { timeout: 300000 });
  return res.data.data; // { imported, skipped, errors, data: rows[] }
};

export const clearUploadedAttendance = async () => {
  const res = await api.post("/attendance/clear-upload");
  return res.data.data; // { punches, leaveRequests }
};
