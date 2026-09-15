/**
 * Pluggable APM / Crash Telemetry Wrapper (Backend)
 * Supports Sentry or OpenTelemetry when configured, with graceful fallback to logger.
 */
import { logger } from "./logger";

let isApmEnabled = false;
let sentryClient: any = null;

export function initBackendApm(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    // Dynamic import / optional require to prevent crash if optional package is omitted
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/node");
    if (Sentry && typeof Sentry.init === "function") {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || "production",
        tracesSampleRate: 0.1,
      });
      sentryClient = Sentry;
      isApmEnabled = true;
      logger.info("APM / Sentry backend monitoring initialized");
    }
  } catch {
    logger.warn("SENTRY_DSN set but @sentry/node is not installed. Falling back to internal logger.");
  }
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (isApmEnabled && sentryClient) {
    try {
      sentryClient.captureException(error, { extra: context });
      return;
    } catch {
      // Fallback
    }
  }

  // Graceful fallback to application structured logger
  logger.error({ err: error, context }, "Captured unhandled exception in backend APM");
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (isApmEnabled && sentryClient) {
    try {
      sentryClient.captureMessage(message, level);
      return;
    } catch {
      // Fallback
    }
  }

  if (level === "error") {
    logger.error({ message }, "[APM message]");
  } else if (level === "warning") {
    logger.warn({ message }, "[APM message]");
  } else {
    logger.info({ message }, "[APM message]");
  }
}
