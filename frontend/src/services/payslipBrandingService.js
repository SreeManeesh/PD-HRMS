/**
 * Company payslip branding service (logo / signature / signatory / website).
 * Uploads use FormData with the existing axios client (auth header attached).
 */
import api from "./api.js";

export const getCompanyBranding = async () => {
  const res = await api.get("/company/branding");
  return res.data.data;
};

export const saveCompanyBranding = async (payload) => {
  const res = await api.put("/company/branding", payload);
  return res.data.data;
};

const uploadAsset = async (url, file) => {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(url, form);
  return res.data.data;
};

export const uploadCompanyLogo = (file) => uploadAsset("/company/branding/logo", file);
export const uploadCompanySignature = (file) => uploadAsset("/company/branding/signature", file);

export const removeCompanyLogo = async () => (await api.delete("/company/branding/logo")).data.data;
export const removeCompanySignature = async () => (await api.delete("/company/branding/signature")).data.data;