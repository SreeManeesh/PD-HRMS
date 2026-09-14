import { useState, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { getUiLabels, updateUiLabel, subscribeUiLabels } from "../../services/uiConfigService";

export default function AdminEditableText({
  labelKey,
  defaultText,
  tag = "span",
  style = {},
  className = "",
  inputStyle = {},
  multiline = false,
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [currentText, setCurrentText] = useState(defaultText);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(defaultText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Initial fetch
    getUiLabels().then((labels) => {
      if (labels && labels[labelKey]) {
        setCurrentText(labels[labelKey]);
        setDraftText(labels[labelKey]);
      }
    });

    // Subscribe to label updates across the application
    const unsubscribe = subscribeUiLabels((labels) => {
      if (labels && labels[labelKey] !== undefined) {
        setCurrentText(labels[labelKey]);
      }
    });

    return unsubscribe;
  }, [labelKey, defaultText]);

  const handleStartEdit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftText(currentText);
    setIsEditing(true);
  };

  const handleCancel = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setDraftText(currentText);
    setIsEditing(false);
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!draftText.trim()) {
      toast("Text cannot be empty", "error");
      return;
    }
    setSaving(true);
    try {
      await updateUiLabel(labelKey, draftText.trim());
      setCurrentText(draftText.trim());
      setIsEditing(false);
      toast("Label updated and saved for all users", "success");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to update label", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !multiline) {
      handleSave(e);
    } else if (e.key === "Escape") {
      handleCancel(e);
    }
  };

  const Tag = tag;

  if (isEditing) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "var(--card)",
          padding: "2px 6px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--primary)",
          boxShadow: "0 0 0 2px rgba(99, 102, 241, 0.15)",
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {multiline ? (
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={2}
            style={{
              fontSize: "13px",
              color: "var(--text)",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              minWidth: "220px",
              ...inputStyle,
            }}
          />
        ) : (
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              fontSize: "inherit",
              fontWeight: "inherit",
              color: "var(--text)",
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              minWidth: "160px",
              ...inputStyle,
            }}
          />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          title="Save (Enter)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: saving ? "not-allowed" : "pointer",
            padding: 0,
          }}
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          title="Cancel (Esc)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            background: "var(--background)",
            color: "var(--subtext)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <span
      className={`admin-editable-wrapper ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        position: "relative",
      }}
    >
      <Tag style={style}>{currentText}</Tag>
      {isAdmin && (
        <button
          type="button"
          onClick={handleStartEdit}
          title="Edit text (Admin)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "3px",
            background: "transparent",
            color: "var(--subtext)",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            opacity: 0.65,
            transition: "opacity 0.15s ease, color 0.15s ease, transform 0.1s ease",
            verticalAlign: "middle",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.color = "var(--primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.65";
            e.currentTarget.style.color = "var(--subtext)";
          }}
        >
          <Pencil size={12} />
        </button>
      )}
    </span>
  );
}
