import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

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

export function buildWizardUrl(token: string): string {
  return `${env.WIZARD_URL}/?token=${encodeURIComponent(token)}`;
}