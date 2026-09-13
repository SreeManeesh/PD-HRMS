import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { createEmployee, type CreateEmployeeInput } from "../employees/employee.service";

/** Minimal registration payload the wizard mirrors into HRMS after a creation. */
export interface WizardMirrorPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  designation?: string;
  department?: string;
  employmentType?: string;
  dateOfJoining?: string;
  state?: string;
  country?: string;
  skillType?: string;
  annualSalary?: number;
  wizardData?: unknown;
}

/**
 * Persist a wizard-registered employee into the main HRMS database so it shows
 * up in the Employees list. Called server-to-server by the wizard API.
 *
 * Uses find-or-create for the login user (same email may already exist) and
 * auto-creates unknown designation/department names, mirroring the bulk-import
 * behaviour instead of the stricter normal-form create.
 */
export async function mirrorWizardRegistration(payload: WizardMirrorPayload) {
  const firstName = (payload.firstName ?? "").trim();
  const lastName = (payload.lastName ?? "").trim() || firstName;
  const email = (payload.email ?? "").trim();
  if (!firstName || !email) {
    throw AppError.badRequest("Mirror requires firstName and email");
  }

  const input: CreateEmployeeInput = {
    firstName,
    lastName,
    email,
    designation: payload.designation,
    department: payload.department,
    employmentType: payload.employmentType || "Full-Time",
    dateOfJoining: payload.dateOfJoining || undefined,
    state: payload.state,
    country: payload.country,
    skillType: payload.skillType,
    annualSalary: payload.annualSalary,
    wizardData: payload.wizardData,
  };
  return createEmployee(input, { autoCreateRefs: true });
}

/**
 * Employee-registration wizard bridge.
 *
 * The wizard (employee-management-fullstack) is served as a separate app and
 * embedded in the HRMS frontend via an iframe. Every wizard API request needs a
 * JWT issued by the wizard's own API, so the HRMS backend mint a short-lived
 * service token on demand (guard: WIZARD_SERVICE_SECRET shared with the wizard).
 */
export async function getWizardSessionToken(): Promise<string> {
  if (!env.WIZARD_SERVICE_SECRET) {
    throw new AppError(503, "Registration wizard is not configured (missing WIZARD_SERVICE_SECRET)");
  }

  let response: Response;
  try {
    response = await fetch(`${env.WIZARD_API_URL}/api/auth/service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.WIZARD_SERVICE_SECRET }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError(503, "Registration wizard is not reachable. Start the wizard API and try again.");
  }

  const data = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!response.ok || !data.token) {
    throw new AppError(503, data.message || "Registration wizard failed to issue a session");
  }
  return data.token;
}

export function buildWizardUrl(token: string, operator?: { name?: string; email?: string; role?: string }): string {
  const params = new URLSearchParams({ token });
  if (operator?.name) params.set("operatorName", operator.name);
  if (operator?.email) params.set("operatorEmail", operator.email);
  if (operator?.role) params.set("operatorRole", operator.role);
  return `${env.WIZARD_URL}/?${params.toString()}`;
}