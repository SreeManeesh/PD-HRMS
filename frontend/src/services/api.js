/**
 * API base instance
 * Talks to the real backend (see .env → VITE_API_URL).
 *
 * Auth flow:
 *   - Request interceptor attaches the JWT access token (hrms_token).
 *   - Response interceptor rotates the access token via the refresh token
 *     (hrms_refresh) when a 401 is returned, then retries the original request.
 *   - If rotation fails, the session is cleared and the user is sent to /login.
 *
 * AuthContext calls this for login/logout; every module service calls it too.
 */

import axios from "axios";
import { captureException } from "../lib/apm.js";

let rawBaseUrl = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: rawBaseUrl,
  timeout: 15000,
  // headers: { "Content-Type": "application/json" },
});

// ── Request interceptor ─────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("hrms_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor (silent token refresh on 401) ─────────────────────
let refreshing = null;

async function tryRefresh() {
  const refreshToken = localStorage.getItem("hrms_refresh");
  if (!refreshToken) throw new Error("No refresh token");
  const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
  const { token, refreshToken: newRefresh, permissions } = res.data?.data ?? {};
  if (!token) throw new Error("Refresh failed");
  localStorage.setItem("hrms_token", token);
  if (newRefresh) localStorage.setItem("hrms_refresh", newRefresh);
  if (permissions) localStorage.setItem("hrms_permissions", JSON.stringify(permissions));
  return token;
}

// Global toast throttling to avoid toast storms during network outages
let lastToastTime = 0;
let lastToastMessage = "";

function notifyUser(message, type = "error") {
  const now = Date.now();
  if (now - lastToastTime < 3500 && lastToastMessage === message) {
    return;
  }
  lastToastTime = now;
  lastToastMessage = message;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("hrms:toast", {
        detail: { message, type },
      })
    );
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Only attempt rotation for real auth failures, once per request.
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        // Single-flight: concurrent 401s share one refresh call.
        refreshing = refreshing || tryRefresh().finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        localStorage.removeItem("hrms_token");
        localStorage.removeItem("hrms_refresh");
        localStorage.removeItem("hrms_role");
        localStorage.removeItem("hrms_permissions");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    // Auto-retry on fallback backend port if connection was refused
    if ((error.code === "ERR_NETWORK" || !error.response) && original && !original._networkRetried) {
      original._networkRetried = true;
      if (original.baseURL && original.baseURL.includes("4000")) {
        original.baseURL = original.baseURL.replace("4000", "4001");
        return api(original);
      } else if (original.baseURL && original.baseURL !== "/api") {
        original.baseURL = "/api";
        return api(original);
      }
    }

    // Capture timeout and network failure toasts
    const isTimeout = error.code === "ECONNABORTED" || error.message?.toLowerCase().includes("timeout");
    const isNetworkError = error.code === "ERR_NETWORK" || (!error.response && !isTimeout);
    const status = error.response?.status || 0;

    if (isTimeout) {
      notifyUser("Request timed out. Please check your network connection and try again.", "warning");
      captureException(error, { reason: "API_TIMEOUT", url: original?.url });
    } else if (isNetworkError) {
      notifyUser("Unable to reach the server. Please verify your connection.", "error");
      captureException(error, { reason: "API_NETWORK_ERROR", url: original?.url });
    } else if (status >= 500) {
      notifyUser("Server error encountered. Please try again shortly.", "error");
      captureException(error, { reason: "API_5XX_ERROR", status, url: original?.url });
    }

    // Do NOT expose raw stack traces — re-throw a clean object
    // Handle Blob error bodies (responseType: "blob") by reading the JSON back.
    let message = null;
    const data = error.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const parsed = JSON.parse(text);
        message = parsed?.message || null;
      } catch {
        message = null;
      }
    } else {
      message = data?.message || null;
    }
    return Promise.reject({
      status: error.response?.status || 0,
      message: message || error.message || "An unexpected error occurred. Please try again.",
    });
  }
);

export default api;

