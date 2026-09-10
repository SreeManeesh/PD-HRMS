const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

// The hosting HRMS app opens the wizard in an iframe and passes a short-lived
// wizard JWT via ?token= (same browser session, cross-origin localStorage is
// not shared). Persist it under the key the API layer already reads.
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('hrms_token', token);
      params.delete('token');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    /* non-browser env */
  }
})();

let bootstrapPromise: Promise<string | null> | null = null;

// Lazily acquire a token. When the wizard is embedded by HRMS a ?token= is
// already stored; running standalone, fall back to the dev/demo anonymous
// session endpoint (guarded server-side by ALLOW_ANONYMOUS_WIZARD).
async function ensureToken(): Promise<string | null> {
  const existing = localStorage.getItem('hrms_token');
  if (existing) return existing;
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/api/auth/wizard-session`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) localStorage.setItem('hrms_token', data.token);
      } catch {
        /* offline / endpoint disabled — requests will fail with 401 */
      }
      return localStorage.getItem('hrms_token');
    })();
    bootstrapPromise.finally(() => { bootstrapPromise = null; });
  }
  return bootstrapPromise;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await ensureToken();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || 'Request failed') as Error & { status?: number; issues?: unknown };
    error.status = res.status;
    error.issues = data.issues;
    throw error;
  }
  return data;
}

export { BASE };