const API_URL =
    (import.meta.env.VITE_API_URL || "http://localhost:4001/api").replace("localhost:4000", "localhost:4001");

const BACKEND_URL = API_URL.replace(/\/api\/?$/, "");

export function getFileUrl(url) {
    if (!url) return "";

    if (
        url.startsWith("http://") ||
        url.startsWith("https://")
    ) {
        return url;
    }

    return `${BACKEND_URL}${url}`;
}