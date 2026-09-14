/**
 * Pluggable APM / Crash Reporting Wrapper (Frontend)
 * Supports Sentry / OpenTelemetry if configured, with graceful fallback.
 */

let isInitialized = false;

export function initApm() {
  if (isInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn && typeof window !== "undefined" && window.Sentry) {
    try {
      window.Sentry.init({
        dsn,
        environment: import.meta.env.MODE || "production",
        tracesSampleRate: 0.1,
      });
      isInitialized = true;
      console.info("[APM] Initialized crash monitoring");
    } catch (e) {
      console.warn("[APM] Failed to initialize crash monitoring", e);
    }
  } else {
    isInitialized = true;
  }
}

export function captureException(error, context = {}) {
  if (typeof window !== "undefined" && window.Sentry?.captureException) {
    window.Sentry.captureException(error, { extra: context });
  } else if (import.meta.env.DEV) {
    console.debug("[APM Dev Exception Captured]:", error, context);
  }
}

export function captureMessage(message, level = "info") {
  if (typeof window !== "undefined" && window.Sentry?.captureMessage) {
    window.Sentry.captureMessage(message, level);
  } else if (import.meta.env.DEV) {
    console.debug(`[APM Dev Message (${level})]:`, message);
  }
}

export function setApmUser(user) {
  if (typeof window !== "undefined" && window.Sentry?.setUser) {
    if (user) {
      window.Sentry.setUser({
        id: user.id || user.userId,
        email: user.email,
        username: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : undefined,
      });
    } else {
      window.Sentry.setUser(null);
    }
  }
}
