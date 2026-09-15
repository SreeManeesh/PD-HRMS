/**
 * Leave Management Page — Module 6
 * Enterprise CRM Professional Redesign
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  XCircle,
  Paperclip,
  FileText,
  Download,
  Eye,
  Trash2,
  UploadCloud,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import Modal from "../../components/shared/Modal.jsx";
import InitialsAvatar from "../../components/shared/InitialsAvatar.jsx";
import {
  getLeaveRequests,
  getLeaveTypes,
  applyLeave,
  approveLeave,
  rejectLeave,
  decideAbsentLeave,
} from "../../services/leaveService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { leaveStatusMeta } from "../../mock/leave.js";
import { parseLeaveDetails, formatFileSize, renderSortableHeader } from "../../utils/leaveUtils.jsx";
import "./Leave.css";







/**
 * Apply Leave Modal Form
 */
function ApplyLeaveModal({ isOpen, onClose, leaveTypes, employeeId, onSaved }) {
  const [form, setForm] = useState({
    leaveTypeId: "",
    reasonCategory: "General / Personal",
    startDate: "",
    endDate: "",
    isHalfDay: false,
    halfDaySession: "First Half (Morning)",
    handoverTo: "",
    emergencyContact: "",
    reason: "",
    attachment: null,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.leaveTypeId) e.leaveTypeId = "Select a leave type";
    if (!form.startDate) e.startDate = "Required";
    if (!form.isHalfDay && !form.endDate) e.endDate = "Required";
    if (!form.isHalfDay && form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = "End date cannot be before start date";
    if (!form.reason.trim()) e.reason = "Please provide a reason";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const daysBetween = () => {
    if (form.isHalfDay) return 0.5;
    if (!form.startDate || !form.endDate) return 0;
    return Math.max(0, Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5 MB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((p) => ({
        ...p,
        attachment: {
          name: file.name,
          size: file.size,
          type: file.type,
          data: reader.result,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await applyLeave({
        employeeId,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.isHalfDay ? form.startDate : form.endDate,
        reason: form.reason.trim(),
        days: daysBetween(),
        reasonCategory: form.reasonCategory,
        isHalfDay: form.isHalfDay,
        halfDaySession: form.halfDaySession,
        handoverTo: form.handoverTo.trim(),
        emergencyContact: form.emergencyContact.trim(),
        attachment: form.attachment,
      });
      setForm({
        leaveTypeId: "",
        reasonCategory: "General / Personal",
        startDate: "",
        endDate: "",
        isHalfDay: false,
        halfDaySession: "First Half (Morning)",
        handoverTo: "",
        emergencyContact: "",
        reason: "",
        attachment: null,
      });
      onClose();
      await onSaved?.();
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || "Failed to submit leave request.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = (key) => ({
    width: "100%",
    height: "38px",
    padding: "0 12px",
    border: `1px solid ${errors[key] ? "var(--red)" : "var(--border)"}`,
    borderRadius: "var(--radius-sm)",
    fontSize: "13.5px",
    color: "var(--text)",
    outline: "none",
    background: "var(--card)",
    transition: "border-color 0.15s ease",
  });

  return (
    <Modal isOpen={isOpen} title="Apply for Leave" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "80vh", overflowY: "auto", paddingRight: "4px" }}>
        
        {/* Row 1: Leave Type & Reason Category */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Leave Type *</label>
            <select
              value={form.leaveTypeId}
              onChange={(e) => setForm((p) => ({ ...p, leaveTypeId: e.target.value }))}
              style={inputStyle("leaveTypeId")}
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name} (max {t.maxDays} days)</option>
              ))}
            </select>
            {errors.leaveTypeId && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors.leaveTypeId}</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Reason Category</label>
            <select
              value={form.reasonCategory}
              onChange={(e) => setForm((p) => ({ ...p, reasonCategory: e.target.value }))}
              style={inputStyle("reasonCategory")}
            >
              <option value="General / Personal">General / Personal</option>
              <option value="Medical / Health">Medical / Health</option>
              <option value="Family Emergency">Family Emergency</option>
              <option value="Vacation / Travel">Vacation / Travel</option>
              <option value="Bereavement">Bereavement</option>
              <option value="Maternity / Paternity">Maternity / Paternity</option>
              <option value="Statutory / Legal">Statutory / Legal</option>
            </select>
          </div>
        </div>

        {/* Half Day Option */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--background)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.isHalfDay}
              onChange={(e) => setForm((p) => ({ ...p, isHalfDay: e.target.checked, endDate: e.target.checked ? p.startDate : p.endDate }))}
              style={{ width: "16px", height: "16px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            Apply as Half-Day Leave
          </label>
          {form.isHalfDay && (
            <select
              value={form.halfDaySession}
              onChange={(e) => setForm((p) => ({ ...p, halfDaySession: e.target.value }))}
              style={{
                height: "30px",
                fontSize: "12px",
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
              }}
            >
              <option value="First Half (Morning)">First Half (Morning)</option>
              <option value="Second Half (Afternoon)">Second Half (Afternoon)</option>
            </select>
          )}
        </div>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: form.isHalfDay ? "1fr" : "1fr 1fr", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>
              {form.isHalfDay ? "Leave Date *" : "Start Date *"}
            </label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value, ...(p.isHalfDay ? { endDate: e.target.value } : {}) }))}
              style={inputStyle("startDate")}
            />
            {errors.startDate && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors.startDate}</span>}
          </div>

          {!form.isHalfDay && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                style={inputStyle("endDate")}
              />
              {errors.endDate && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors.endDate}</span>}
            </div>
          )}
        </div>

        {daysBetween() > 0 && (
          <div
            style={{
              background: "var(--primary-light)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              fontSize: "13px",
              color: "var(--primary)",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid rgba(15, 118, 110, 0.2)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <CalendarDays size={16} /> Total Duration: <strong>{daysBetween()} day{daysBetween() > 1 ? "s" : ""}</strong>
            </span>
            {form.isHalfDay && <span style={{ fontSize: "12px", opacity: 0.9 }}>Session: {form.halfDaySession}</span>}
          </div>
        )}

        {/* Handover and Emergency Contact */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Handover / Reliever Colleague</label>
            <input
              type="text"
              placeholder="e.g. Robert King (EMP010)"
              value={form.handoverTo}
              onChange={(e) => setForm((p) => ({ ...p, handoverTo: e.target.value }))}
              style={inputStyle("handoverTo")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Emergency Contact Number</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={form.emergencyContact}
              onChange={(e) => setForm((p) => ({ ...p, emergencyContact: e.target.value }))}
              style={inputStyle("emergencyContact")}
            />
          </div>
        </div>

        {/* Reason */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Reason *</label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            rows={3}
            placeholder="Provide context for your leave request…"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: `1px solid ${errors.reason ? "var(--red)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "13.5px",
              color: "var(--text)",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              background: "var(--card)",
            }}
          />
          {errors.reason && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors.reason}</span>}
        </div>

        {/* Supporting Document / File Upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Paperclip size={13} /> Supporting Document or Medical Certificate (Optional)
          </label>
          
          {form.attachment ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                <FileText size={20} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <div style={{ overflow: "hidden" }}>
                  <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {form.attachment.name}
                  </p>
                  <span style={{ fontSize: "11px", color: "var(--subtext)" }}>
                    {formatFileSize(form.attachment.size)} · {form.attachment.type || "Document"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, attachment: null }))}
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
                title="Remove attachment"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "16px",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--card)",
                cursor: "pointer",
                transition: "border-color 0.2s",
              }}
            >
              <UploadCloud size={18} style={{ color: "var(--subtext)" }} />
              <span style={{ fontSize: "12.5px", color: "var(--subtext)" }}>
                Click to attach file <b style={{ color: "var(--primary)" }}>PDF, PNG, JPG or DOC</b> (max 5 MB)
              </span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 20px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "none",
              color: "var(--label)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "9px 22px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--primary)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "13px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Submitting…" : "Submit Leave Application"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Leave Details Inspection Modal
 */
function LeaveDetailsModal({ request, onClose }) {
  if (!request) return null;
  const details = parseLeaveDetails(request.reason);
  const meta = leaveStatusMeta[request.status] || leaveStatusMeta.Pending;

  const handleDownload = () => {
    if (!details.attachment?.data) return;
    const a = document.createElement("a");
    a.href = details.attachment.data;
    a.download = details.attachment.name || "leave_attachment";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal isOpen={Boolean(request)} title="Leave Request Details" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        
        {/* Header Summary */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 18px", background: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <InitialsAvatar firstName={request.employeeName?.split(" ")[0]} lastName={request.employeeName?.split(" ")[1]} size={42} />
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text)" }}>
                {request.employeeName}
              </h3>
              <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
                Employee ID: {request.employeeId} · Applied on {request.appliedOn ? new Date(request.appliedOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
              </span>
            </div>
          </div>
          <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} />
        </div>

        {/* Grid info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ background: "var(--card)", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Leave Type & Category</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{request.leaveTypeName || "—"}</span>
              {details.category && (
                <span className="leave-category-pill">
                  {details.category}
                </span>
              )}
            </div>
          </div>

          <div style={{ background: "var(--card)", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Leave Period</span>
            <div style={{ marginTop: "4px", fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>
              {new Date(request.startDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              {request.startDate !== request.endDate && ` – ${new Date(request.endDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
              <span style={{ display: "block", fontSize: "12px", color: "var(--primary)", fontWeight: 700, marginTop: "2px" }}>
                {request.days} day{request.days === 1 ? "" : "s"} {details.isHalfDay ? `(${details.halfDaySession})` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Handover & Emergency Contact */}
        {(details.handoverTo || details.emergencyContact) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {details.handoverTo && (
              <div style={{ background: "var(--card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Handover Colleague</span>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{details.handoverTo}</p>
              </div>
            )}
            {details.emergencyContact && (
              <div style={{ background: "var(--card)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Emergency Contact</span>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", fontWeight: 600, color: "var(--text)", fontFamily: "monospace" }}>{details.emergencyContact}</p>
              </div>
            )}
          </div>
        )}

        {/* Reason Text */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase" }}>Reason for Absence</span>
          <div style={{ padding: "12px 14px", background: "var(--background)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: "13.5px", color: "var(--text)", lineHeight: 1.5 }}>
            {details.summary || request.reason || "No detailed notes provided."}
          </div>
        </div>

        {/* Supporting Document */}
        {details.attachment && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
              <Paperclip size={13} /> Attached Document
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileText size={24} style={{ color: "var(--primary)" }} />
                <div>
                  <p style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "var(--text)" }}>{details.attachment.name}</p>
                  <span style={{ fontSize: "11.5px", color: "var(--subtext)" }}>
                    {formatFileSize(details.attachment.size)} · {details.attachment.type || "Document"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Download size={14} /> Download File
              </button>
            </div>
            {details.attachment.type?.startsWith("image/") && details.attachment.data && (
              <div style={{ marginTop: "8px", textAlign: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", maxHeight: "250px", background: "#000" }}>
                <img loading="lazy" src={details.attachment.data} alt="Attachment preview" style={{ maxHeight: "250px", maxWidth: "100%", objectFit: "contain" }} />
              </div>
            )}
          </div>
        )}

        {/* Decision details */}
        {request.status !== "Pending" && request.status !== "Absent" && (
          <div style={{ padding: "12px 14px", background: request.status === "Approved" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)", border: `1px solid ${request.status === "Approved" ? "#86efac" : "#fca5a5"}`, borderRadius: "var(--radius-sm)" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: request.status === "Approved" ? "#15803d" : "#b91c1c", textTransform: "uppercase" }}>
              Decision by {request.approverName || "Approver"} {request.approvedOn ? `on ${new Date(request.approvedOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
            </span>
            {request.comments && (
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text)" }}>{request.comments}</p>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 20px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Leave Decision Modal (Approve / Reject)
 */
function LeaveDecisionModal({ request, action, onClose, onCompleted }) {
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rejecting = action === "reject";

  const submit = async (event) => {
    event.preventDefault();
    const cleanComments = comments.trim();
    if (rejecting && !cleanComments) {
      setError("Please enter a rejection reason. The employee will see this message.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (rejecting) {
        if (request.id) await rejectLeave(request.id, cleanComments);
        else await decideAbsentLeave({ employeeId: request.employeeId, date: request.startDate, action: "reject", comments: cleanComments });
      } else {
        if (request.id) await approveLeave(request.id, cleanComments);
        else await decideAbsentLeave({ employeeId: request.employeeId, date: request.startDate, action: "approve", comments: cleanComments });
      }
      await onCompleted();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unable to update this leave request.");
    } finally {
      setSaving(false);
    }
  };

  const isAbsent = request?.status === "Absent";

  return (
    <Modal
      isOpen={Boolean(request && action)}
      title={rejecting ? (isAbsent ? "Reject Absent Day" : "Reject Leave Request") : (isAbsent ? "Approve Absent Day" : "Approve Leave Request")}
      onClose={saving ? undefined : onClose}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ padding: "12px 14px", background: "var(--background)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
          <strong style={{ color: "var(--text)", fontSize: "14px" }}>{request?.employeeName}</strong>
          <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
            {isAbsent ? "Absent day" : `${request?.leaveTypeName} · ${request?.days} day${request?.days === 1 ? "" : "s"}`}
          </span>
          <small style={{ color: "var(--label)", fontSize: "11.5px", marginTop: "2px" }}>
            {request?.startDate ? `Duration: ${request.startDate} ${request.endDate && request.endDate !== request.startDate ? `to ${request.endDate}` : ""}` : request?.reason || "No application reason provided"}
          </small>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <label htmlFor="leave-decision-comments" style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>
            {rejecting ? "Rejection reason *" : "Approval comment (optional)"}
          </label>
          <textarea
            id="leave-decision-comments"
            value={comments}
            onChange={(event) => { setComments(event.target.value); setError(""); }}
            maxLength={1000}
            rows={4}
            placeholder={rejecting ? "Explain clearly why this request is being rejected…" : "Add a note for the employee…"}
            autoFocus
            style={{
              width: "100%",
              padding: "10px 12px",
              border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "13.5px",
              color: "var(--text)",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              background: "var(--card)",
            }}
          />
          <div style={{ alignSelf: "flex-end", color: "var(--subtext)", fontSize: "11px" }}>{comments.length}/1000</div>
        </div>

        {error && <div style={{ color: "var(--red)", background: "var(--red-light)", padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ padding: "8px 18px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--label)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: rejecting ? "var(--red)" : "var(--green)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : rejecting ? "Reject with reason" : "Approve request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Main Leave Module Component
 */
export default function Leave() {
  const { user, permissions } = useAuth();
  const [requests, setRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [decision, setDecision] = useState({ request: null, action: "" });
  const [clearMsg, setClearMsg] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const canApprove = permissions.includes("leave:approve");
  const canApply = permissions.includes("leave:write");

  const [selectedDetail, setSelectedDetail] = useState(null);
  
  // Search, sort, and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState({ field: "appliedOn", order: "desc" });
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState({ startDate: "", endDate: "" });
  const [categoryFilter, setCategoryFilter] = useState("");

  const loadData = useCallback(async () => {
    const [reqRes, ltRes] = await Promise.all([
      getLeaveRequests(canApprove ? {} : { employeeId: user.id }),
      getLeaveTypes(),
    ]);
    setRequests(reqRes.data);
    setLeaveTypes(ltRes.data);
  }, [canApprove, user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData().catch(() => undefined).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  // Apply all filters: status, search, leave type, date range, category
  const filtered = requests
    .filter((r) => !statusFilter || r.status === statusFilter)
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        (r.employeeName?.toLowerCase() || "").includes(query) ||
        (r.employeeId?.toLowerCase() || "").includes(query) ||
        (r.leaveTypeName?.toLowerCase() || "").includes(query) ||
        (r.reason?.toLowerCase() || "").includes(query)
      );
    })
    .filter((r) => !leaveTypeFilter || r.leaveTypeId === leaveTypeFilter)
    .filter((r) => {
      if (!dateRangeFilter.startDate && !dateRangeFilter.endDate) return true;
      const requestStart = new Date(r.startDate);
      const filterStart = dateRangeFilter.startDate ? new Date(dateRangeFilter.startDate) : null;
      const filterEnd = dateRangeFilter.endDate ? new Date(dateRangeFilter.endDate) : null;
      if (filterStart && requestStart < filterStart) return false;
      if (filterEnd && new Date(r.endDate) > filterEnd) return false;
      return true;
    })
    .filter((r) => {
      if (!categoryFilter) return true;
      const details = parseLeaveDetails(r.reason);
      return details.category === categoryFilter;
    })
    .sort((a, b) => {
      let aVal, bVal;
      switch (sortConfig.field) {
        case "employeeName":
          aVal = a.employeeName || "";
          bVal = b.employeeName || "";
          break;
        case "leaveTypeName":
          aVal = a.leaveTypeName || "";
          bVal = b.leaveTypeName || "";
          break;
        case "startDate":
          aVal = new Date(a.startDate);
          bVal = new Date(b.startDate);
          break;
        case "days":
          aVal = Number(a.days || 0);
          bVal = Number(b.days || 0);
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        case "appliedOn":
        default:
          aVal = new Date(a.appliedOn);
          bVal = new Date(b.appliedOn);
      }
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return sortConfig.order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.order === "asc" ? aVal - bVal : bVal - aVal;
    });

  // Calculate paginated slice
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRequests = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const statusCounts = requests.reduce((counts, request) => {
    counts[request.status] = (counts[request.status] || 0) + 1;
    return counts;
  }, {});
  
  // Unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set();
    requests.forEach((r) => {
      const details = parseLeaveDetails(r.reason);
      if (details.category) cats.add(details.category);
    });
    return Array.from(cats).sort();
  }, [requests]);

  const handleSort = (field) => {
    setSortConfig((prev) => ({
      field,
      order: prev.field === field && prev.order === "asc" ? "desc" : "asc",
    }));
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    statusFilter ||
    leaveTypeFilter ||
    categoryFilter ||
    dateRangeFilter.startDate ||
    dateRangeFilter.endDate
  );

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setLeaveTypeFilter("");
    setCategoryFilter("");
    setDateRangeFilter({ startDate: "", endDate: "" });
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <MainLayout>
        <Spinner />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* Page Header */}
        <PageHeader
          title="Leave Management"
          subtitle="Enterprise workforce absence tracking and approval decisions"
        >
          {canApply && (
            <button
              id="apply-leave-btn"
              type="button"
              onClick={() => setShowApply(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 18px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
            >
              <Plus size={16} /> Apply Leave
            </button>
          )}
        </PageHeader>

        {clearMsg && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              marginBottom: "16px",
              background: clearMsg.ok ? "var(--green-light)" : "var(--red-light)",
              color: clearMsg.ok ? "var(--green)" : "var(--red)",
              border: `1px solid ${clearMsg.ok ? "rgba(4, 120, 87, 0.2)" : "rgba(185, 28, 28, 0.2)"}`,
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{clearMsg.text}</span>
            <button
              onClick={() => setClearMsg(null)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Leave Requests & Approvals Tab Content */}
        <div>
            {/* KPI Ribbon */}
            <div className="leave-kpi-grid">
              {[
                { key: "", label: "All Requests", count: requests.length, icon: CalendarDays, color: "var(--primary)" },
                { key: "Pending", label: "Pending Approvals", count: statusCounts["Pending"] || 0, icon: Clock3, color: "var(--amber)" },
                { key: "Approved", label: "Approved Requests", count: statusCounts["Approved"] || 0, icon: CheckCircle2, color: "var(--green)" },
                { key: "Rejected", label: "Rejected / Absent", count: (statusCounts["Rejected"] || 0) + (statusCounts["Absent"] || 0), icon: XCircle, color: "var(--red)" },
              ].map((kpi) => {
                const Icon = kpi.icon;
                const isSelected = statusFilter === kpi.key;
                return (
                  <button
                    type="button"
                    key={kpi.label}
                    className={`leave-kpi-card ${isSelected ? "active" : ""}`}
                    style={{ "--kpi-color": kpi.color }}
                    onClick={() => {
                      setStatusFilter(isSelected ? "" : kpi.key);
                      setCurrentPage(1);
                    }}
                  >
                    <div className="leave-kpi-icon-wrap">
                      <Icon size={22} />
                    </div>
                    <div className="leave-kpi-info">
                      <span className="leave-kpi-label">{kpi.label}</span>
                      <span className="leave-kpi-value">{kpi.count}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* CRM Search & Filter Toolbar */}
            <div className="leave-crm-toolbar">
              <div className="leave-toolbar-primary-row">
                <div className="leave-search-wrap">
                  <Search size={16} className="leave-search-icon" />
                  <input
                    type="text"
                    className="leave-search-input"
                    placeholder="Search requests by employee name, ID, leave type, or reason…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="leave-search-clear"
                      onClick={() => setSearchQuery("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  className="leave-filter-select"
                  value={leaveTypeFilter}
                  onChange={(e) => {
                    setLeaveTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All Leave Types</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
                </select>

                <select
                  className="leave-filter-select"
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  className="leave-filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">All Statuses</option>
                  {["Pending", "Approved", "Rejected", "Cancelled", "Absent"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <div className="leave-date-pill-group">
                  <label>From</label>
                  <input
                    type="date"
                    className="leave-date-input"
                    value={dateRangeFilter.startDate}
                    onChange={(e) => {
                      setDateRangeFilter((p) => ({ ...p, startDate: e.target.value }));
                      setCurrentPage(1);
                    }}
                  />
                  <label>To</label>
                  <input
                    type="date"
                    className="leave-date-input"
                    value={dateRangeFilter.endDate}
                    onChange={(e) => {
                      setDateRangeFilter((p) => ({ ...p, endDate: e.target.value }));
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>

              <div className="leave-toolbar-secondary-row">
                <span>
                  Showing <strong>{filtered.length}</strong> of <strong>{requests.length}</strong> leave request{requests.length !== 1 ? "s" : ""}
                </span>

                {hasActiveFilters && (
                  <button
                    type="button"
                    className="leave-reset-filters-btn"
                    onClick={resetFilters}
                  >
                    <X size={14} /> Reset All Filters
                  </button>
                )}
              </div>
            </div>

            {/* Requests Data Table */}
            <div className="leave-table-card">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No matching leave requests"
                  subtitle={hasActiveFilters ? "Try clearing search queries or filters to view all records." : "There are currently no leave requests filed."}
                />
              ) : (
                <div className="leave-table-wrap">
                  <table className="leave-table">
                    <thead>
                      <tr>
                        {renderSortableHeader("Employee", "employeeName", sortConfig, handleSort)}
                        {renderSortableHeader("Leave Type", "leaveTypeName", sortConfig, handleSort)}
                        {renderSortableHeader("Dates", "startDate", sortConfig, handleSort)}
                        {renderSortableHeader("Days", "days", sortConfig, handleSort)}
                        <th>Category & Reason</th>
                        <th>Document</th>
                        {renderSortableHeader("Status", "status", sortConfig, handleSort)}
                        <th>Decision Details</th>
                        {renderSortableHeader("Applied On", "appliedOn", sortConfig, handleSort)}
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRequests.map((req) => {
                        const meta = leaveStatusMeta[req.status] || leaveStatusMeta.Pending;
                        const details = parseLeaveDetails(req.reason);
                        const names = (req.employeeName || "").split(" ");
                        return (
                          <tr key={`${req.id}-${req.employeeId}-${req.startDate}-${req.status}`}>
                            <td>
                              <div className="leave-emp-cell">
                                <InitialsAvatar firstName={names[0]} lastName={names[1]} size={32} />
                                <div className="leave-emp-info">
                                  <span className="leave-emp-name">{req.employeeName}</span>
                                  <span className="leave-emp-id">{req.employeeId}</span>
                                </div>
                              </div>
                            </td>

                            <td style={{ fontWeight: 600, color: "var(--text)" }}>
                              {req.leaveTypeName || "—"}
                            </td>

                            <td>
                              <div className="leave-date-badge">
                                <span className="leave-date-text">
                                  {new Date(req.startDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                  {req.startDate !== req.endDate && ` – ${new Date(req.endDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
                                </span>
                                {details.isHalfDay && (
                                  <span className="leave-session-tag">
                                    Half Day · {details.halfDaySession?.includes("First") ? "AM" : "PM"}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td>
                              <span className="leave-days-pill">
                                {req.days}d
                              </span>
                            </td>

                            <td style={{ maxWidth: "240px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                {details.category && (
                                  <span className="leave-category-pill">
                                    {details.category}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: "12.5px",
                                    color: "var(--subtext)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={details.summary || req.reason}
                                >
                                  {details.summary || req.reason || "—"}
                                </span>
                              </div>
                            </td>

                            <td>
                              {details.attachment ? (
                                <button
                                  type="button"
                                  className="leave-doc-btn"
                                  onClick={() => setSelectedDetail(req)}
                                  title={details.attachment.name}
                                >
                                  <Paperclip size={13} style={{ color: "var(--primary)" }} />
                                  {details.attachment.name.length > 12 ? details.attachment.name.slice(0, 10) + "…" : details.attachment.name}
                                </button>
                              ) : (
                                <span style={{ fontSize: "12px", color: "var(--subtext)" }}>—</span>
                              )}
                            </td>

                            <td>
                              <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} />
                            </td>

                            <td style={{ minWidth: "180px" }}>
                              {req.status === "Absent" ? (
                                <span style={{ fontSize: "12px", color: "var(--red)", fontWeight: 600 }}>
                                  Marked absent (Biometrics)
                                </span>
                              ) : req.status === "Pending" ? (
                                <span style={{ fontSize: "12px", color: "var(--amber)", fontWeight: 600 }}>
                                  Pending approval
                                </span>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
                                    {req.approverName || "Approver"}
                                  </span>
                                  {req.approvedOn && (
                                    <span style={{ fontSize: "11px", color: "var(--subtext)" }}>
                                      {new Date(req.approvedOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td style={{ fontSize: "12px", color: "var(--subtext)", whiteSpace: "nowrap" }}>
                              {new Date(req.appliedOn + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>

                            <td style={{ textAlign: "right" }}>
                              <div className="leave-action-group" style={{ justifyContent: "flex-end" }}>
                                {canApprove && (req.status === "Pending" || req.status === "Absent") && req.employeeId !== user.id && (
                                  <>
                                    <button
                                      type="button"
                                      className="leave-btn-approve"
                                      onClick={() => setDecision({ request: req, action: "approve" })}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="leave-btn-reject"
                                      onClick={() => setDecision({ request: req, action: "reject" })}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="leave-btn-details"
                                  onClick={() => setSelectedDetail(req)}
                                  title="Inspect full details"
                                >
                                  <Eye size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table Footer / Pagination */}
              {filtered.length > 0 && (
                <div className="leave-table-footer">
                  <span>
                    Showing {(safePage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
                  </span>
                  <div className="leave-pagination-nav">
                    <button
                      type="button"
                      className="leave-page-btn"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                    >
                      <ChevronLeft size={14} style={{ verticalAlign: "middle" }} /> Prev
                    </button>
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="leave-page-btn"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                    >
                      Next <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Modals */}
      <ApplyLeaveModal
        isOpen={showApply}
        onClose={() => setShowApply(false)}
        leaveTypes={leaveTypes}
        employeeId={user.id}
        onSaved={loadData}
      />
      <LeaveDecisionModal
        request={decision.request}
        action={decision.action}
        onClose={() => setDecision({ request: null, action: "" })}
        onCompleted={loadData}
      />
      <LeaveDetailsModal
        request={selectedDetail}
        onClose={() => setSelectedDetail(null)}
      />
    </MainLayout>
  );
}
