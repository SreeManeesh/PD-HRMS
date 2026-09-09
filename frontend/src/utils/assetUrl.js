/** Resolve a backend-relative asset path (e.g. /uploads/company/logo/x.png)
 *  to an absolute URL the browser can load (in dev the API lives on a
 *  different origin than Vite). */
const API_ORIGIN = (import.meta.env.VITE_API_URL || "/api")
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");

export function assetUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^(https?:)?\/\//.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;
  return `${API_ORIGIN}${pathOrUrl}`;
}