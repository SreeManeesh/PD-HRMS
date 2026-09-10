/**
 * Registration Wizard Modal
 * Full-screen modal that embeds the employee-management-fullstack registration
 * wizard in an iframe. On successful wizard submission the wizard posts a
 * message back so this component can mirror a core employee record into the
 * HRMS Employees list.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, RefreshCcw } from "lucide-react";
import { getWizardSession, createEmployee } from "../../services/employeeService.js";
import { useToast } from "../../context/ToastContext.jsx";

export default function RegistrationWizardModal({ isOpen, onClose, onRegistered }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [src, setSrc] = useState("");
  const [wizardOrigin, setWizardOrigin] = useState("");
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const listenerRef = useRef(null);

  const open = useCallback(async () => {
    setStatus("loading");
    setError("");
    setRegistered(false);
    try {
      const session = await getWizardSession();
      if (!session?.url) throw new Error("Wizard session returned no URL");
      setSrc(session.url);
      try {
        setWizardOrigin(new URL(session.wizardUrl || session.url).origin);
      } catch {
        setWizardOrigin("");
      }
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Could not open the employee registration wizard.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      open();
    }
  }, [isOpen, open]);

  // Mirror a created employee into the HRMS list when the wizard reports success.
  useEffect(() => {
    if (!isOpen) return;
    const handler = async (e) => {
      if (e.data?.source !== "employee-wizard") return;
      if (wizardOrigin && e.origin !== wizardOrigin) return;
      // Sidebar navigation from inside the wizard → close modal and route.
      if (e.data?.type === "NAVIGATE" && e.data?.href) {
        onClose();
        navigate(e.data.href);
        return;
      }
      if (e.data?.type !== "EMPLOYEE_REGISTERED") return;
      const p = e.data.payload || {};
      try {
        await createEmployee({
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          email: p.email || undefined,
          designation: p.designation || undefined,
          department: p.department || undefined,
          employmentType: p.employmentType || undefined,
          dateOfJoining: p.dateOfJoining || undefined,
          state: p.state || undefined,
          country: p.country || undefined,
        });
        setRegistered(true);
        toast("Employee registered in HRMS");
        onRegistered?.();
      } catch (err) {
        toast(err?.message || "Employee was created in the wizard but could not be mirrored to HRMS", "error");
      }
    };
    window.addEventListener("message", handler);
    listenerRef.current = handler;
    return () => window.removeEventListener("message", handler);
  }, [isOpen, wizardOrigin, toast, onRegistered, onClose, navigate]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        background: "var(--background)",
      }}
    >
      <style>{`@keyframes hrmsSpin{to{transform:rotate(360deg)}}`}</style>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Employee Registration</h2>
          {registered && (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#16a34a", background: "#f0fdf4", padding: "3px 10px", borderRadius: "99px" }}>
              Registered in HRMS ✓
            </span>
          )}
        </div>
        <button
          aria-label="Close registration wizard"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--subtext)",
            padding: "6px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      {status === "loading" && (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", color: "var(--subtext)" }}>
            <Loader2 size={28} style={{ animation: "hrmsSpin 1s linear infinite" }} />
            <span style={{ fontSize: "13px" }}>Opening registration wizard…</span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{ maxWidth: "420px", textAlign: "center", display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ fontSize: "14px", color: "var(--text)", fontWeight: 600 }}>Could not open the registration wizard</p>
            <p style={{ fontSize: "13px", color: "var(--subtext)", whiteSpace: "pre-wrap" }}>{error}</p>
            <div>
              <button
                onClick={open}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "9px 18px", background: "var(--primary)", color: "#fff",
                  border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer",
                }}
              >
                <RefreshCcw size={15} /> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {status === "ready" && (
        <iframe
          title="Employee Registration Wizard"
          src={src}
          style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
        />
      )}
    </div>
  );
}