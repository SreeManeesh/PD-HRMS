/**
 * Leave Service
 * Talks to the real backend (VITE_API_URL → /api).
 */

import api from "./api.js";

export const getLeaveTypes = async () => {
  const res = await api.get("/leave/types");
  return res.data;
};

export const getMyLeaveBalance = async (employeeId, year) => {
  const res = await api.get("/leave/balance", { params: { employeeId, year } });
  return res.data;
};

export const getLeaveRequests = async ({ employeeId, status } = {}) => {
  const res = await api.get("/leave/requests", { params: { employeeId, status } });
  return res.data; // { data, total }
};

export const getAttendanceDigest = async ({ month, year } = {}) => {
  const res = await api.get("/leave/attendance-digest", { params: { month, year } });
  return res.data; // { data }
};

export const applyLeave = async (payload) => {
  const res = await api.post("/leave/apply", payload);
  return res.data;
};

export const approveLeave = async (requestId, comments = "") => {
  const res = await api.put(`/leave/${requestId}/approve`, { comments });
  return res.data;
};

export const rejectLeave = async (requestId, comments = "") => {
  const res = await api.put(`/leave/${requestId}/reject`, { comments });
  return res.data;
};

/** Decide (approve/reject) an uploaded Absent day that has no leave request. */
export const decideAbsentLeave = async ({ employeeId, date, action, comments = "" }) => {
  const res = await api.put("/leave/absent/decide", { employeeId, date, action, comments });
  return res.data;
};
