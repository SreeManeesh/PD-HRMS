import AdminEditableText from "./AdminEditableText.jsx";

export default function PageHeader({ title, subtitle, titleKey, subtitleKey, children }) {
  const autoTitleKey = titleKey || (typeof title === "string" ? `page.${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.title` : null);
  const autoSubKey = subtitleKey || (typeof title === "string" ? `page.${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.subtitle` : null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "24px",
        flexWrap: "wrap",
        gap: "14px",
        paddingBottom: "20px",
        borderBottom: "1px solid var(--border)",
        animation: "slideUp 0.3s ease",
      }}
    >
      <div>
        <h1 style={{
          fontSize: "21px",
          fontWeight: 800,
          color: "var(--text)",
          letterSpacing: "-0.3px",
          lineHeight: 1.25,
          margin: 0,
        }}>
          {autoTitleKey ? (
            <AdminEditableText labelKey={autoTitleKey} defaultText={title} />
          ) : (
            title
          )}
        </h1>
        {subtitle && (
          <p style={{ fontSize: "13.5px", color: "var(--subtext)", marginTop: "4px", marginBottom: 0 }}>
            {autoSubKey ? (
              <AdminEditableText labelKey={autoSubKey} defaultText={subtitle} />
            ) : (
              subtitle
            )}
          </p>
        )}
      </div>

      {children && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {children}
        </div>
      )}
    </div>
  );
}
