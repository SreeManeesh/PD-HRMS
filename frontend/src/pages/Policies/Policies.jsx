/**
 * Policy Management Page - Module 18
 * Tabs: Policy Library - My Acknowledgements - Compliance Dashboard
 */

import { useState, useEffect, useRef } from "react";
import {
  FileText,
  BadgeCheck,
  ShieldAlert,
  Plus,
  History,
  CheckCircle2,
  Upload,
  Paperclip,
  Download,
  Eye,
  ExternalLink,
  X,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import Modal from "../../components/shared/Modal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  getPolicies,
  createPolicy,
  addVersion,
  publishPolicy,
  getAcknowledgements,
  getAllAcknowledgements,
  acknowledgePolicy,
  uploadPolicyFile,
} from "../../services/Policyservice.js";
import { policyStatusMeta, ackStatusMeta } from "../../mock/Policies.js";
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");

const formatDevice = (userAgent = "") => {
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  const platform = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Android") ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : userAgent.includes("Mac OS") ? "macOS" : "device";
  return `${browser} on ${platform}`;
};

/* ---------------------------------- shared bits ---------------------------------- */

const cardStyle = {
  background: "var(--card)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

function inputStyle(hasError) {
  return {
    width: "100%", padding: "9px 12px",
    border: `1px solid ${hasError ? "var(--red)" : "var(--border)"}`,
    borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)",
    outline: "none", background: "var(--card)", fontFamily: "inherit",
  };
}

function fieldLabel(text) {
  return <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>{text}</label>;
}

function PrimaryButton({ children, ...props }) {
  return (
    <button {...props} style={{
      display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px",
      background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)",
      fontWeight: 600, fontSize: "13px", cursor: props.disabled ? "not-allowed" : "pointer",
      opacity: props.disabled ? 0.6 : 1, ...props.style,
    }}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button {...props} style={{
      padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
      background: "none", color: "var(--label)", fontWeight: 600, fontSize: "13px", cursor: "pointer", ...props.style,
    }}>
      {children}
    </button>
  );
}

function TabNav({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid var(--border)", marginBottom: "22px", overflowX: "auto" }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            display: "flex", alignItems: "center", gap: "7px", padding: "10px 16px",
            border: "none", borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
            background: "none", color: isActive ? "var(--primary)" : "var(--subtext)",
            fontWeight: 600, fontSize: "13.5px", cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <t.icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function currentVersion(policy) {
  return policy.versions.find((v) => v.id === policy.currentVersionId);
}

/* ---------------------------------- Policy Library tab ---------------------------------- */

function CreatePolicyModal({ isOpen, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("HR");
  const [scope, setScope] = useState("Company-wide");
  const [mandatory, setMandatory] = useState(true);
  const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [ackDeadlineDays, setAckDeadlineDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !effectiveDate || !summary.trim()) {
      setError("Title, summary and effective date are required.");
      return;
    }
    setSaving(true);
    setError("");

    let fileUrl = null;
    let fileName = null;
    if (file) {
      try {
        const uploadRes = await uploadPolicyFile(file);
        fileUrl = uploadRes.data?.fileUrl;
        fileName = uploadRes.data?.fileName || file.name;
      } catch (err) {
        setError("Failed to upload document: " + (err.response?.data?.message || err.message));
        setSaving(false);
        return;
      }
    }

    const policy = {
      title: title.trim(),
      category,
      scope,
      mandatoryAcknowledgement: mandatory,
      reviewCycleMonths: Number(reviewCycleMonths) || null,
      effectiveDate,
      ackDeadlineDays: mandatory ? Number(ackDeadlineDays) || null : null,
      summary: summary.trim(),
      content: content.trim() || summary.trim(),
      fileUrl,
      fileName,
    };
    try {
      const res = await createPolicy(policy);
      onSaved(res.data);
      onClose();
      setTitle(""); setSummary(""); setContent(""); setFile(null); setEffectiveDate(""); setAckDeadlineDays(14);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Author New Policy" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Policy Title *")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Workplace Code of Ethics" style={inputStyle(false)} />
        </div>
        {error && <p style={{ margin: 0, color: "var(--red)", fontSize: "12px" }}>{error}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {fieldLabel("Category")}
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle(false), height: "38px", cursor: "pointer" }}>
              {["HR", "Conduct", "IT & Security", "Safety", "Finance"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {fieldLabel("Scope")}
            <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Company-wide, or e.g. Location: Delhi" style={inputStyle(false)} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Brief Summary *")}
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="High-level overview of policy guidelines..." style={{ ...inputStyle(false), resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Full Policy Document Content (Text / Markdown)")}
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Detailed sections, clauses, responsibilities, and procedural requirements..." style={{ ...inputStyle(false), resize: "vertical", fontFamily: "monospace", fontSize: "12.5px" }} />
        </div>

        {/* File attachment option */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {fieldLabel("Attach Policy File (PDF, Word, Text)")}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="file"
              id="create-policy-file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            <label
              htmlFor="create-policy-file"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: "var(--background)",
                color: "var(--text)",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Upload size={14} /> {file ? "Replace File" : "Choose File (.pdf, .docx, .txt)"}
            </label>
            {file && (
              <span style={{ fontSize: "12px", color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--background)", padding: "4px 8px", borderRadius: "4px" }}>
                <Paperclip size={13} /> {file.name} ({(file.size / 1024).toFixed(0)} KB)
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", padding: "0 2px" }}
                >
                  <X size={13} />
                </button>
              </span>
            )}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--label)", cursor: "pointer" }}>
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          Requires mandatory employee acknowledgement
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {fieldLabel("Effective Date *")}
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} style={inputStyle(false)} />
            <p style={{ fontSize: "10.5px", color: "var(--subtext)", margin: 0 }}>Required before publishing.</p>
          </div>
          {mandatory && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {fieldLabel("Ack. Deadline (days) *")}
              <input type="number" min={1} value={ackDeadlineDays} onChange={(e) => setAckDeadlineDays(e.target.value)} style={inputStyle(false)} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Review Cycle (months)")}
          <input type="number" min={1} value={reviewCycleMonths} onChange={(e) => setReviewCycleMonths(e.target.value)} style={{ ...inputStyle(false), width: "120px" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving Policy..." : "Save Policy"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function AddVersionModal({ isOpen, onClose, policy, onSaved }) {
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [ackDeadlineDays, setAckDeadlineDays] = useState(14);
  const [requiresReacknowledgement, setRequiresReacknowledgement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!policy) return null;
  const latest = currentVersion(policy);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!summary.trim() || !effectiveDate) {
      setError("Change summary and effective date are required.");
      return;
    }
    setSaving(true);
    setError("");

    let fileUrl = latest?.fileUrl || null;
    let fileName = latest?.fileName || null;
    if (file) {
      try {
        const uploadRes = await uploadPolicyFile(file);
        fileUrl = uploadRes.data?.fileUrl;
        fileName = uploadRes.data?.fileName || file.name;
      } catch (err) {
        setError("Failed to upload document: " + (err.response?.data?.message || err.message));
        setSaving(false);
        return;
      }
    }

    const version = {
      effectiveDate,
      ackDeadlineDays: policy.mandatoryAcknowledgement ? Number(ackDeadlineDays) || null : null,
      requiresReacknowledgement,
      summary: summary.trim(),
      content: content.trim() || latest?.content || summary.trim(),
      fileUrl,
      fileName,
    };
    try {
      const res = await addVersion(policy.id, version);
      onSaved(res.data);
      onClose();
      setSummary(""); setContent(""); setFile(null); setEffectiveDate(""); setAckDeadlineDays(14);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={`New Version - ${policy.title}`} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "12px", color: "var(--subtext)", margin: 0 }}>
          Version {latest.versionNumber} remains archived in version history. This creates version {latest.versionNumber + 1} and returns policy to Draft status until republished.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Change Summary *")}
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary of revisions made in this version..." style={{ ...inputStyle(false), resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {fieldLabel("Updated Policy Document Text")}
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Updated text or full document body..." style={{ ...inputStyle(false), resize: "vertical", fontFamily: "monospace", fontSize: "12.5px" }} />
        </div>

        {/* File attachment */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {fieldLabel("Attach Updated Policy File")}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="file"
              id="version-policy-file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            <label
              htmlFor="version-policy-file"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: "var(--background)",
                color: "var(--text)",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Upload size={14} /> {file ? "Replace File" : latest?.fileUrl ? "Upload New Version Document" : "Choose File (.pdf, .docx, .txt)"}
            </label>
            {file ? (
              <span style={{ fontSize: "12px", color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--background)", padding: "4px 8px", borderRadius: "4px" }}>
                <Paperclip size={13} /> {file.name} ({(file.size / 1024).toFixed(0)} KB)
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  style={{ border: "none", background: "none", color: "var(--red)", cursor: "pointer", padding: "0 2px" }}
                >
                  <X size={13} />
                </button>
              </span>
            ) : latest?.fileName ? (
              <span style={{ fontSize: "11.5px", color: "var(--subtext)" }}>Current file: {latest.fileName}</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {fieldLabel("Effective Date *")}
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} style={inputStyle(false)} />
          </div>
          {policy.mandatoryAcknowledgement && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {fieldLabel("Ack. Deadline (days) *")}
              <input type="number" min={1} value={ackDeadlineDays} onChange={(e) => setAckDeadlineDays(e.target.value)} style={inputStyle(false)} />
            </div>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--label)", cursor: "pointer" }}>
          <input type="checkbox" checked={requiresReacknowledgement} onChange={(e) => setRequiresReacknowledgement(e.target.checked)} />
          Require all employees to re-acknowledge new version
        </label>
        {error && <p style={{ margin: 0, color: "var(--red)", fontSize: "12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving..." : "Create Version"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function VersionHistory({ policy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "10px" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 700, color: "var(--subtext)", border: "none", background: "none", cursor: "pointer", padding: 0 }}>
        <History size={13} /> {open ? "Hide" : "Show"} version history ({policy.versions.length})
      </button>
      {open && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {[...policy.versions].reverse().map((v) => (
            <div key={v.id} style={{ fontSize: "11.5px", color: "var(--text)", background: "var(--background)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
              <strong>v{v.versionNumber}</strong> | effective {fmtDate(v.effectiveDate)} | by {v.createdBy} on {fmtDate(v.createdAt)}
              {v.id === policy.currentVersionId && <span style={{ marginLeft: "6px", color: "var(--primary)", fontWeight: 700 }}>(current)</span>}
              {v.summary && <p style={{ margin: "4px 0 0", color: "var(--subtext)" }}>{v.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyDetailModal({ isOpen, onClose, policy }) {
  if (!policy) return null;
  const v = currentVersion(policy);
  const meta = policyStatusMeta[policy.status] || { color: "var(--primary)", bg: "var(--primary-light)" };

  return (
    <Modal isOpen={isOpen} title={policy.title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Top Badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, background: "var(--background)", border: "1px solid var(--border)", padding: "3px 10px", borderRadius: "99px", color: "var(--text)" }}>
              Version {v?.versionNumber || 1}
            </span>
            <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
              Category: <strong style={{ color: "var(--text)" }}>{policy.category}</strong>
            </span>
            <span style={{ fontSize: "12px", color: "var(--subtext)" }}>
              Scope: <strong style={{ color: "var(--text)" }}>{policy.scope}</strong>
            </span>
          </div>
          <StatusBadge label={policy.status} color={meta.color} bg={meta.bg} />
        </div>

        {/* Timing & Dates */}
        <div style={{ display: "flex", gap: "16px", padding: "12px 14px", background: "var(--background)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--subtext)", flexWrap: "wrap" }}>
          <div>Effective Date: <strong style={{ color: "var(--text)" }}>{fmtDate(v?.effectiveDate)}</strong></div>
          {policy.reviewCycleMonths && <div>Review Cycle: <strong style={{ color: "var(--text)" }}>Every {policy.reviewCycleMonths} months</strong></div>}
          {v?.createdBy && <div>Author: <strong style={{ color: "var(--text)" }}>{v.createdBy}</strong></div>}
          {policy.mandatoryAcknowledgement && (
            <div style={{ color: "#7c3aed", fontWeight: 700 }}>
              Mandatory Ack: Within {v?.ackDeadlineDays || 14} days
            </div>
          )}
        </div>

        {/* Attached Document Banner */}
        {v?.fileUrl && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "rgba(99, 102, 241, 0.06)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "var(--radius-sm)",
            gap: "12px",
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FileText size={22} style={{ color: "var(--primary)" }} />
              <div>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                  {v.fileName || "Attached Policy File"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--subtext)" }}>
                  Official policy attachment
                </p>
              </div>
            </div>
            <a
              href={v.fileUrl}
              target="_blank"
              rel="noreferrer"
              download={v.fileName || "policy-document"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                background: "var(--primary)",
                color: "#fff",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Download size={14} /> Download Document
            </a>
          </div>
        )}

        {/* Summary */}
        <div>
          <h4 style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--label)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Summary
          </h4>
          <p style={{ fontSize: "13.5px", color: "var(--text)", lineHeight: 1.6, margin: 0 }}>
            {v?.summary || "No summary provided."}
          </p>
        </div>

        {/* Policy Document Content */}
        {v?.content && (
          <div>
            <h4 style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--label)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Policy Document Content
            </h4>
            <div style={{
              maxHeight: "260px",
              overflowY: "auto",
              padding: "14px 16px",
              background: "var(--background)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "13px",
              color: "var(--text)",
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
            }}>
              {v.content}
            </div>
          </div>
        )}

        {/* Version History Component */}
        <VersionHistory policy={policy} />

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <SecondaryButton type="button" onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </Modal>
  );
}

function PolicyLibraryTab({ policies, canManage, onPolicyAdded, onPolicyUpdated }) {
  const [showCreate, setShowCreate] = useState(false);
  const [versionTarget, setVersionTarget] = useState(null);
  const [viewingPolicy, setViewingPolicy] = useState(null);
  const [publishError, setPublishError] = useState({});

  const handlePublish = async (id) => {
    try {
      const res = await publishPolicy(id);
      setPublishError((p) => ({ ...p, [id]: null }));
      onPolicyUpdated(res.data.policy);
    } catch (e) {
      setPublishError((p) => ({ ...p, [id]: e.message }));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>Policy Library</h2>
        {canManage && <PrimaryButton onClick={() => setShowCreate(true)}><Plus size={16} /> Author Policy</PrimaryButton>}
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={FileText} title="No policies yet" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {policies.map((p) => {
            const meta = policyStatusMeta[p.status] || { color: "var(--primary)", bg: "var(--primary-light)" };
            const v = currentVersion(p);
            return (
              <div key={p.id} style={{ ...cardStyle, padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{p.title}</h3>
                      <span style={{ fontSize: "11px", color: "var(--subtext)" }}>v{v?.versionNumber || 1}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--subtext)", marginTop: "2px" }}>{p.category} | {p.scope}</p>
                  </div>
                  <StatusBadge label={p.status} color={meta.color} bg={meta.bg} />
                </div>

                {v?.summary && <p style={{ fontSize: "13px", color: "var(--text)", marginTop: "10px", lineHeight: 1.5 }}>{v.summary}</p>}

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px", alignItems: "center" }}>
                  {p.mandatoryAcknowledgement && (
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", padding: "2px 8px", borderRadius: "99px" }}>
                      Mandatory ack. within {v?.ackDeadlineDays || 14}d
                    </span>
                  )}
                  <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--subtext)", background: "var(--background)", padding: "2px 8px", borderRadius: "99px" }}>
                    Effective {fmtDate(v?.effectiveDate)}
                  </span>
                  {p.reviewCycleMonths && (
                    <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--subtext)", background: "var(--background)", padding: "2px 8px", borderRadius: "99px" }}>
                      Review every {p.reviewCycleMonths}mo
                    </span>
                  )}
                  {v?.fileUrl && (
                    <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--primary)", background: "rgba(99, 102, 241, 0.1)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Paperclip size={11} /> Document Attached
                    </span>
                  )}
                </div>

                {publishError[p.id] && <p style={{ fontSize: "11px", color: "var(--red)", marginTop: "8px" }}>{publishError[p.id]}</p>}

                {/* Actions row: Accessible to all roles */}
                <div style={{ display: "flex", gap: "14px", marginTop: "14px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setViewingPolicy(p)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      color: "var(--primary)",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <Eye size={14} /> View Policy
                  </button>

                  {v?.fileUrl && (
                    <a
                      href={v.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={v.fileName || "policy-document"}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: "var(--subtext)",
                        textDecoration: "none",
                      }}
                    >
                      <Download size={13} /> {v.fileName ? `Download ${v.fileName.length > 22 ? v.fileName.slice(0, 20) + "…" : v.fileName}` : "Download Document"}
                    </a>
                  )}

                  {canManage && (
                    <>
                      {p.status === "Draft" && (
                        <button onClick={() => handlePublish(p.id)} style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--green, #16a34a)", border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                          Publish
                        </button>
                      )}
                      <button onClick={() => setVersionTarget(p)} style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--subtext)", border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                        New Version
                      </button>
                    </>
                  )}
                </div>

                <VersionHistory policy={p} />
              </div>
            );
          })}
        </div>
      )}

      <PolicyDetailModal isOpen={!!viewingPolicy} onClose={() => setViewingPolicy(null)} policy={viewingPolicy} />
      <CreatePolicyModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSaved={onPolicyAdded} />
      <AddVersionModal isOpen={!!versionTarget} onClose={() => setVersionTarget(null)} policy={versionTarget} onSaved={onPolicyUpdated} />
    </div>
  );
}

/* ---------------------------------- My Acknowledgements tab ---------------------------------- */

function AcknowledgeModal({ isOpen, onClose, policy, onSaved }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToBottom(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, policy]);

  const handleScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToBottom(true);
  };

  const handleAcknowledge = async () => {
    setSaving(true);
    setError("");
    const v = currentVersion(policy);
    try {
      const res = await acknowledgePolicy(policy.id, v.id);
      onSaved(res.data);
      onClose();
      setScrolledToBottom(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return null;
  const v = currentVersion(policy);

  return (
    <Modal isOpen={isOpen} title={policy.title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "11.5px", color: "var(--subtext)", margin: 0 }}>Version {v.versionNumber} | effective {fmtDate(v.effectiveDate)}</p>
        <div
          ref={contentRef}
          onScroll={handleScroll}
          style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", fontSize: "13px", color: "var(--text)", lineHeight: 1.6, background: "var(--background)" }}
        >
          <p>{v.summary || "Policy content goes here."}</p>
          <p style={{ marginTop: "12px" }}>By acknowledging, you confirm you have read and understood this policy and agree to comply with it for the duration it remains in effect.</p>
          <p style={{ marginTop: "12px", color: "var(--subtext)" }}>- End of document -</p>
        </div>
        {!scrolledToBottom && <p style={{ fontSize: "11px", color: "var(--subtext)", margin: 0 }}>Scroll to the end to enable acknowledgement.</p>}
        {error && <p style={{ fontSize: "11px", color: "var(--red)", margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <SecondaryButton type="button" onClick={onClose}>Close</SecondaryButton>
          <PrimaryButton type="button" disabled={!scrolledToBottom || saving} onClick={handleAcknowledge}>
            {saving ? "Recording..." : "I have read and acknowledge"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function MyAcknowledgementsTab({ policies, myAcks, onAcknowledged }) {
  const [target, setTarget] = useState(null);
  const mandatoryPolicies = policies.filter((p) => p.mandatoryAcknowledgement && p.status === "Published");

  const ackFor = (policy) => myAcks.find((a) => a.policyId === policy.id && a.versionId === policy.currentVersionId);

  if (mandatoryPolicies.length === 0) return <EmptyState icon={BadgeCheck} title="Nothing to acknowledge right now" />;

  return (
    <div>
      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "14px" }}>My Acknowledgements</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
        {mandatoryPolicies.map((p) => {
          const ack = ackFor(p);
          const v = currentVersion(p);
          const done = !!ack?.acknowledgedAt;
          let deadlineDate = null;
          if (v.effectiveDate && v.ackDeadlineDays) {
            deadlineDate = new Date(v.effectiveDate);
            deadlineDate.setDate(deadlineDate.getDate() + v.ackDeadlineDays);
          }
          const overdue = !done && deadlineDate && deadlineDate < new Date();

          return (
            <div key={p.id} style={{ ...cardStyle, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <div>
                  <h3 style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text)" }}>{p.title}</h3>
                  <p style={{ fontSize: "11.5px", color: "var(--subtext)" }}>Version {v.versionNumber} | {p.category}</p>
                </div>
                {done ? (
                  <StatusBadge label="Acknowledged" color={ackStatusMeta.Acknowledged.color} bg={ackStatusMeta.Acknowledged.bg} />
                ) : overdue ? (
                  <StatusBadge label="Overdue" color={ackStatusMeta.Overdue.color} bg={ackStatusMeta.Overdue.bg} />
                ) : (
                  <StatusBadge label="Not Acknowledged" color={ackStatusMeta["Not Acknowledged"].color} bg={ackStatusMeta["Not Acknowledged"].bg} />
                )}
              </div>

              {done ? (
                <p style={{ fontSize: "12px", color: "var(--green)", fontWeight: 600, marginTop: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <CheckCircle2 size={13} /> Signed on {fmtDate(ack.acknowledgedAt)} | Device: {formatDevice(ack.device)}
                </p>
              ) : (
                <>
                  {deadlineDate && <p style={{ fontSize: "11.5px", color: overdue ? "var(--red)" : "var(--subtext)", marginTop: "10px" }}>Due by {fmtDate(deadlineDate.toISOString().slice(0, 10))}</p>}
                  <PrimaryButton onClick={() => setTarget(p)} style={{ marginTop: "10px", padding: "7px 14px", fontSize: "12px" }}>Read & Acknowledge</PrimaryButton>
                </>
              )}
            </div>
          );
        })}
      </div>

      <AcknowledgeModal isOpen={!!target} onClose={() => setTarget(null)} policy={target} onSaved={onAcknowledged} />
    </div>
  );
}

/* ---------------------------------- Compliance Dashboard tab ---------------------------------- */

function ComplianceTab({ policies, allAcks, roster }) {
  const mandatoryPolicies = policies.filter((p) => p.mandatoryAcknowledgement && p.status === "Published");

  if (mandatoryPolicies.length === 0) return <EmptyState icon={ShieldAlert} title="No mandatory policies published" />;

  return (
    <div>
      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "14px" }}>Compliance Dashboard</h2>
      {mandatoryPolicies.map((p) => {
        const v = currentVersion(p);
        const scopedRoster = roster.filter((employee) => p.scope === "Company-wide" || p.scope === `Department: ${employee.department}` || p.scope === `Location: ${employee.location}`);
        const relevant = scopedRoster.map((emp) => {
          const ack = allAcks.find((a) => a.policyId === p.id && a.versionId === v.id && a.employeeId === emp.id);
          return { ...emp, acknowledged: !!ack?.acknowledgedAt };
        });
        const completed = relevant.filter((r) => r.acknowledged).length;
        const outstanding = relevant.filter((r) => !r.acknowledged);

        return (
          <div key={p.id} style={{ ...cardStyle, padding: "18px 20px", marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{p.title}</h3>
                <p style={{ fontSize: "11px", color: "var(--subtext)" }}>Version {v.versionNumber}</p>
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--primary)" }}>{completed}/{relevant.length} acknowledged</span>
            </div>
            <div style={{ height: "6px", background: "var(--border)", borderRadius: "99px", overflow: "hidden", marginBottom: "12px" }}>
              <div style={{ height: "100%", width: `${relevant.length ? (completed / relevant.length) * 100 : 0}%`, background: "var(--green)", borderRadius: "99px" }} />
            </div>
            {outstanding.length > 0 && (
              <>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>
                  Outstanding | escalates to employee, then manager after the configured overdue period
                </p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {outstanding.map((e) => (
                    <span key={e.id} style={{ fontSize: "11.5px", color: "var(--red)", background: "#fef2f2", padding: "3px 10px", borderRadius: "99px" }}>{e.name}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function Policies() {
  const { role } = useAuth();
  const canManage = ["HR", "ADMIN"].includes(role);
  const tabs = [
    { key: "library", label: "Policy Library", icon: FileText },
    { key: "myAcks", label: "My Acknowledgements", icon: BadgeCheck },
    ...(canManage ? [{ key: "compliance", label: "Compliance Dashboard", icon: ShieldAlert }] : []),
  ];
  const [activeTab, setActiveTab] = useState("library");
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [myAcks, setMyAcks] = useState([]);
  const [allAcks, setAllAcks] = useState([]);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const complianceRequest = canManage ? getAllAcknowledgements() : Promise.resolve({ data: { acknowledgements: [], employees: [] } });
    Promise.all([getPolicies(), getAcknowledgements(), complianceRequest])
      .then(([p, mine, all]) => {
        setPolicies(p.data);
        setMyAcks(mine.data);
        setAllAcks(all.data.acknowledgements);
        setRoster(all.data.employees);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canManage]);

  const handleAcknowledged = (ack) => {
    setMyAcks((prev) => {
      const exists = prev.some((a) => a.id === ack.id);
      return exists ? prev.map((a) => (a.id === ack.id ? ack : a)) : [ack, ...prev];
    });
    setAllAcks((prev) => {
      const exists = prev.some((a) => a.id === ack.id);
      return exists ? prev.map((a) => (a.id === ack.id ? ack : a)) : [ack, ...prev];
    });
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
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <PageHeader title="Policy Management" subtitle="Policy authoring, versioning and employee acknowledgement" />
        <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {error && <p style={{ padding: 12, background: "#fef2f2", color: "var(--red)", borderRadius: 8 }}>{error}</p>}

        {activeTab === "library" && (
          <PolicyLibraryTab
            policies={policies}
            canManage={canManage}
            onPolicyAdded={(p) => setPolicies((prev) => [p, ...prev])}
            onPolicyUpdated={(p) => setPolicies((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
          />
        )}

        {activeTab === "myAcks" && (
          <MyAcknowledgementsTab policies={policies} myAcks={myAcks} onAcknowledged={handleAcknowledged} />
        )}

        {activeTab === "compliance" && canManage && <ComplianceTab policies={policies} allAcks={allAcks} roster={roster} />}
      </div>
    </MainLayout>
  );
}
