import api from "./api";

let cachedLabels = null;
const listeners = new Set();

export const subscribeUiLabels = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getUiLabels = async (forceRefresh = false) => {
  if (cachedLabels && !forceRefresh) return cachedLabels;
  try {
    const res = await api.get("/company/ui-labels");
    cachedLabels = res.data?.data || {};
    listeners.forEach((fn) => fn(cachedLabels));
    return cachedLabels;
  } catch (err) {
    console.error("Failed to load UI labels:", err);
    return cachedLabels || {};
  }
};

export const updateUiLabel = async (key, text) => {
  try {
    const res = await api.put("/company/ui-labels", { [key]: text });
    cachedLabels = { ...(cachedLabels || {}), ...(res.data?.data || { [key]: text }) };
    listeners.forEach((fn) => fn(cachedLabels));
    return cachedLabels;
  } catch (err) {
    console.error("Failed to update UI label:", err);
    throw err;
  }
};
