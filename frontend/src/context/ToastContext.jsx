/**
 * Global toast notifications — fixed bottom-right popups triggered by any
 * save / create / update / delete action. `useToast()` returns a `toast(message, type)`
 * function; `type` is "success" | "error".
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, type = "success") => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts((t) => [...t, { id, message, type }]);
    window.setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  useEffect(() => {
    const handleGlobalToast = (e) => {
      if (e.detail?.message) {
        toast(e.detail.message, e.detail.type || "info");
      }
    };
    window.addEventListener("hrms:toast", handleGlobalToast);
    return () => window.removeEventListener("hrms:toast", handleGlobalToast);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1600, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
        {toasts.map((t) => {
          const isErr = t.type === "error";
          const isWarn = t.type === "warning";
          const isInfo = t.type === "info";
          const borderColor = isErr ? "#fecaca" : isWarn ? "#fde68a" : isInfo ? "#bfdbfe" : "#bbf7d0";
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              role="status"
              style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                padding: "12px 16px", background: "var(--card, #ffffff)", color: "var(--text, #1f2937)",
                borderRadius: 10, boxShadow: "0 4px 16px rgba(15,23,42,0.16)",
                border: `1px solid ${borderColor}`,
                fontSize: 13, fontWeight: 600,
                animation: "psToastIn 0.2s ease-out",
              }}
            >
              {isErr ? (
                <XCircle size={18} style={{ color: "#dc2626", flexShrink: 0 }} />
              ) : isWarn ? (
                <AlertCircle size={18} style={{ color: "#d97706", flexShrink: 0 }} />
              ) : isInfo ? (
                <Info size={18} style={{ color: "#2563eb", flexShrink: 0 }} />
              ) : (
                <CheckCircle2 size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
              )}
              <span>{t.message}</span>
            </div>
          );
        })}
        <style>{`@keyframes psToastIn { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }`}</style>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx?.toast || (() => {});
}