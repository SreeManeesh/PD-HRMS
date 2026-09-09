/**
 * Payslip Branding — company logo/signature + signatory + website settings.
 * HR/Admin only (backend enforced). Uploads persist via the app storage.
 */
import { useEffect, useRef, useState } from "react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import {
  getCompanyBranding, saveCompanyBranding,
  uploadCompanyLogo, uploadCompanySignature, removeCompanyLogo, removeCompanySignature,
} from "../../services/payslipBrandingService.js";

const inputStyle = {
  width: "100%", height: 40, padding: "0 12px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", fontSize: 14, color: "var(--text)", background: "var(--card)", outline: "none",
};

function BrandBlock({ title, url, onUpload, onRemove, disabled, uploading }) {
  const ref = useRef(null);
  return (
    <div style={{ background: "var(--background)", borderRadius: "var(--radius)", padding: "16px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>{title}</p>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {url ? (
          <img src={url} alt={title} style={{ width: 96, height: 96, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }} />
        ) : (
          <div style={{ width: 96, height: 96, border: "1px dashed var(--border)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--subtext)", fontSize: 12 }}>No image</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ""; }} />
          <button
            onClick={() => ref.current?.click()}
            disabled={disabled || uploading}
            style={{ padding: "8px 14px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            {uploading ? "Uploading…" : url ? "Replace Image" : "Upload Image"}
          </button>
          {url && (
            <button onClick={onRemove} disabled={disabled} style={{ padding: "8px 14px", background: "transparent", color: "var(--red)", border: "1px solid var(--red)", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PayslipBranding() {
  const [form, setForm] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [upLogo, setUpLogo] = useState(false);
  const [upSig, setUpSig] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    getCompanyBranding()
      .then((b) => {
        setForm({
          companyName: b.companyName || "", tagline: b.tagline || "", website: b.website || "",
          address: b.address || "", signatoryName: b.signatoryName || "", signatoryDesignation: b.signatoryDesignation || "",
        });
        setLogoUrl(b.logoUrl || "");
        setSignatureUrl(b.signatureUrl || "");
      })
      .catch((e) => setMsg({ ok: false, text: e.message || "Could not load branding" }));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const flash = (ok, text) => { setMsg({ ok, text }); window.setTimeout(() => setMsg(null), 4000); };

  const handleLogoUpload = async (file) => {
    setUpLogo(true);
    try { const b = await uploadCompanyLogo(file); setLogoUrl(b.logoUrl); flash(true, "Logo uploaded"); }
    catch (e) { flash(false, e.message || "Upload failed"); }
    finally { setUpLogo(false); }
  };
  const handleSigUpload = async (file) => {
    setUpSig(true);
    try { const b = await uploadCompanySignature(file); setSignatureUrl(b.signatureUrl); flash(true, "Signature uploaded"); }
    catch (e) { flash(false, e.message || "Upload failed"); }
    finally { setUpSig(false); }
  };
  const handleLogoRemove = async () => {
    setBusy(true);
    try { await removeCompanyLogo(); setLogoUrl(""); flash(true, "Logo removed"); }
    catch (e) { flash(false, e.message || "Remove failed"); }
    finally { setBusy(false); }
  };
  const handleSigRemove = async () => {
    setBusy(true);
    try { await removeCompanySignature(); setSignatureUrl(""); flash(true, "Signature removed"); }
    catch (e) { flash(false, e.message || "Remove failed"); }
    finally { setBusy(false); }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveCompanyBranding(form);
      flash(true, "Branding saved");
    } catch (e) {
      flash(false, e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <MainLayout><Spinner /></MainLayout>;

  return (
    <MainLayout>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <PageHeader title="Payslip Branding" subtitle="Company settings used on every generated payslip" />

        {msg && (
          <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, background: msg.ok ? "var(--green-light,#f0fdf4)" : "var(--red-light)", color: msg.ok ? "#16a34a" : "var(--red)", border: `1px solid ${msg.ok ? "#bbf7d0" : "var(--red)"}` }}>
            {msg.text}
          </div>
        )}

        <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Company</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[["companyName", "Company Name"], ["website", "Company Website"], ["tagline", "Company Tagline"]].map(([k, label]) => (
              <label key={k} style={{ fontSize: 12.5, color: "var(--label)" }}>
                {label}
                <input style={{ ...inputStyle, marginTop: 6 }} value={form[k]} onChange={set(k)} />
              </label>
            ))}
            <label style={{ fontSize: 12.5, color: "var(--label)", gridColumn: "1 / -1" }}>
              Company Address
              <textarea style={{ ...inputStyle, height: 70, paddingTop: 10 }} value={form.address} onChange={set("address")} />
            </label>
          </div>
          <div style={{ marginTop: 16 }}>
            <BrandBlock title="Company Logo (PNG / JPG / JPEG / SVG)" url={logoUrl} onUpload={handleLogoUpload} onRemove={handleLogoRemove} disabled={busy} uploading={upLogo} />
          </div>
        </div>

        <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Authorized Signatory</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[["signatoryName", "Signatory Name"], ["signatoryDesignation", "Signatory Designation"]].map(([k, label]) => (
              <label key={k} style={{ fontSize: 12.5, color: "var(--label)" }}>
                {label}
                <input style={{ ...inputStyle, marginTop: 6 }} value={form[k]} onChange={set(k)} />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <BrandBlock title="Signature Image (PNG / JPG / JPEG / SVG)" url={signatureUrl} onUpload={handleSigUpload} onRemove={handleSigRemove} disabled={busy} uploading={upSig} />
          </div>
        </div>

        <div>
          <button onClick={handleSave} disabled={busy} style={{ padding: "11px 26px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {busy ? "Saving…" : "Save Branding"}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}