/**
 * Structured payslip data (company + employee + payroll) for the reusable
 * PayslipTemplate. Backend calculates; frontend only displays.
 */
import api from "./api.js";

export const getPayslipStatement = async (id) => {
  const res = await api.get(`/payroll/payslips/${id}/statement`);
  return res.data.data; // { company, employee, payroll }
};