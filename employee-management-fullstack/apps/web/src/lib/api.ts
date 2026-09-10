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

export async function api<T>(path:string, options:RequestInit={}) : Promise<T> {
  const token=localStorage.getItem('hrms_token');
  const headers=new Headers(options.headers);
  if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  if(token) headers.set('Authorization',`Bearer ${token}`);
  const res=await fetch(`${BASE}${path}`,{...options,headers});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export { BASE };