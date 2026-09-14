import api from "./api.js";

/** Consent-register admin action for the Employee Profile consent cockpit.
 *  Goes through the HRMS backend (:4000) wizard module — the HR_ADMIN-guarded
 *  forwarder to the wizard API (:4100) — so the browser never sees the wizard
 *  service secret or the cross-origin wizard API.
 *  Body mirrors the wizard API's consent_policies contract (apps/api server.ts
 *  POST /api/consent-policies): code, title, description, purposeText,
 *  legalBasis, isStatutory, blocking, withdrawable, requiredOnOnboarding,
 *  useCase, dataFields (jsonb), validityPeriodDays. */
export const createConsentPolicy = async (payload) => {
  const res = await api.post("/api/wizard/consent-policies", payload);
  return res.data;
};
