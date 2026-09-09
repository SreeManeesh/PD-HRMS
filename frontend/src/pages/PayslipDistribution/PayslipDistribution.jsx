/**
 * Payslip Distribution — complete distribution workflow dashboard.
 * Generate → Prepare channels → Delivery engine → Tracking & logs.
 * HR/admin selects a payroll run, configures channels (email / portal /
 * portal / sms-fallback), sends, then tracks delivery per employee and
 * retries failures or downloads the delivery report.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Mail, Globe, MessageSquare, Send, RotateCcw, Download,
  Users, CheckCircle2, XCircle, Clock, Wallet,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import {
  getPayrollRuns, getRunPayslips, startDistribution, getDistributionStatus,
  retryDistribution, downloadDistributionReport,
} from "../../services/payrollService.js";
import { listPayslipTemplates } from "../../services/payslipDesignerService.js";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-checked={checked}
      role="switch"
      style={{
        width: 40, height: 22, borderRadius: 99, padding: 0, border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--primary)" : "#cbd5e1", transition: "background 0.15s", flexShrink: 0, position: "relative", opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
      }} />
    </button>
  );
}

function ChannelRow({ icon: Icon, title, subtitle, bg, border, enabled, onToggle, extra, note }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", border: `1px solid ${border || "var(--border)"}`, borderRadius: "var(--radius)", background: bg || "var(--card)", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: "260px" }}>
        <Toggle checked={enabled} onChange={onToggle} />
        <div style={{ width: 34, height: 34, borderRadius: "var(--radius)", background: enabled ? "var(--primary-light)" : "var(--background)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={17} style={{ color: enabled ? "var(--primary)" : "var(--subtext)" }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--subtext)" }}>{subtitle}</div>
        </div>
      </div>
      {extra}
      {note && <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--amber, #d97706)" }}>{note}</span>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "16px 18px", flex: "1 1 150px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: "var(--radius)", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

const CHANNEL_ICONS = { email: Mail, portal: Globe, sms: MessageSquare };

export function PayslipDistributionPanel() {
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState("");
  const [candidates, setCandidates] = useState([]);   // { employeeId, employeeName } from run payslips
  const [selected, setSelected] = useState(new Set());
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [channels, setChannels] = useState({
    email: { enabled: true, template: "standard" },
    portal: { enabled: true, notify: true },
    sms: { enabled: false, fallback: true },
  });
  const [status, setStatus] = useState(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState(null);

  const setChannel = (name, patch) => setChannels((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));

  // Load runs; pick the newest processed run.
  useEffect(() => {
    setLoadingRuns(true);
    Promise.all([getPayrollRuns(), listPayslipTemplates()])
      .then(([runRes, tmplRes]) => {
        const list = runRes.data || [];
        setRuns(list);
        setTemplates(tmplRes.data || []);
        setRunId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => setMsg({ ok: false, text: "Could not load payroll runs or payslip templates" }))
      .finally(() => setLoadingRuns(false));
  }, []);

  // Load status + candidate employees whenever the selected run changes.
  useEffect(() => {
    if (!runId) return;
    setLoadingStatus(true);
    Promise.all([
      getDistributionStatus(runId).catch(() => ({ data: { started: false } })),
      getRunPayslips(runId).catch(() => ({ data: [] })),
    ])
      .then(([s, p]) => {
        const slips = p.data || [];
        const deDuped = [];
        const seen = new Set();
        for (const slip of slips) {
          if (!seen.has(slip.employeeId)) {
            seen.add(slip.employeeId);
            deDuped.push({ employeeId: slip.employeeId, employeeName: slip.employeeName, gross: slip.earnings?.total ?? 0, net: slip.netPay ?? 0 });
          }
        }
        setCandidates(deDuped);
        setSelected((cur) => {
          const next = new Set(deDuped.map((c) => c.employeeId));
          if (cur.size > 0) deDuped.forEach((c) => { if (cur.has(c.employeeId)) next.add(c.employeeId); });
          return next;
        });
        setStatus(s.data || { started: false });
      })
      .catch(() => setStatus({ started: false }))
      .finally(() => setLoadingStatus(false));
  }, [runId]);

  const toggleEmployee = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = (on) => setSelected(new Set(on ? candidates.map((c) => c.employeeId) : []));

  const refreshStatus = useCallback(async () => {
    if (!runId) return;
    setLoadingStatus(true);
    try {
      const s = await getDistributionStatus(runId);
      setStatus(s.data || { started: false });
    } catch {
      setStatus({ started: false });
    } finally {
      setLoadingStatus(false);
    }
  }, [runId]);

  const handleSend = async () => {
    if (!runId) return;
    if (selected.size === 0) { setMsg({ ok: false, text: "Select at least one employee to distribute to." }); return; }
    setSending(true);
    setMsg(null);
    try {
      await startDistribution(runId, { channels, employeeIds: [...selected], templateId });
      setMsg({ ok: true, text: `Distribution started for ${selected.size} employee${selected.size === 1 ? "" : "s"} using ${templateId ? "the selected template" : "the active template"}.` });
      await refreshStatus();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || e.message || "Could not start distribution" });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    if (!runId) return;
    setRetrying(true);
    setMsg(null);
    try {
      const res = await retryDistribution(runId, status?.failed_list?.map((r) => r.employeeId) || []);
      setMsg({ ok: true, text: `Retried ${res.data?.retried ?? 0} failed deliveries.` });
      await refreshStatus();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || e.message || "Could not retry deliveries" });
    } finally {
      setRetrying(false);
    }
  };

  const handleReport = async () => {
    if (!runId) return;
    try {
      const res = await downloadDistributionReport(runId);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Could not download the report" });
    }
  };

  const run = runs.find((r) => r.id === runId);
  const progress = status?.total ? Math.round(((status.delivered ?? 0) / status.total) * 100) : 0;
  const started = status?.started === true;

  return (
    <div style={{ maxWidth: "1480px", margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <PageHeader title="Payslip Distribution" subtitle="Generate → Prepare channels → Deliver → Track deliveries" />

        {msg && (
          <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 600, background: msg.ok ? "var(--green-light, #f0fdf4)" : "var(--red-light)", color: msg.ok ? "#16a34a" : "var(--red)", border: `1px solid ${msg.ok ? "#bbf7d0" : "var(--red)"}` }}>{msg.text}</div>
        )}

        {/* Run selector */}
        <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <Wallet size={16} style={{ color: "var(--primary)" }} />
            <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Payroll run</label>
            <select
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, background: "var(--card)", outline: "none", cursor: "pointer", minWidth: 220 }}
            >
              {loadingRuns ? <option>Loading runs…</option> : runs.length === 0 ? <option value="">No payroll runs</option> : runs.map((r) => (
                <option key={r.id} value={r.id}>{r.period} · {r.status} · {r.totalEmployees ?? 0} emp · Net {fmt(r.netPayroll)}</option>
              ))}
            </select>
            <span style={{ fontSize: 12.5, color: "var(--subtext)" }}>
              {candidates.length ? `${candidates.length} payslip${candidates.length === 1 ? "" : "s"} ready` : "…"}
            </span>
          </div>
          {run && <p style={{ fontSize: 12, color: "var(--subtext)", margin: 0 }}>Status: <strong>{run.status}</strong> · Net payroll: {fmt(run.netPayroll)}</p>}
        </section>

        {/* Employees & payslip template */}
        <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: "var(--text)" }}>Employees & Payslip Template</h2>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Payslip template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, background: "var(--card)", outline: "none", cursor: "pointer", minWidth: 260 }}
            >
              <option value="">Active payslip template (published)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.isActive ? " (active)" : ""}{t.status === "Published" ? " · Published" : ""}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Employees to receive payslips
              <span style={{ fontWeight: 500, color: "var(--subtext)", marginLeft: 8 }}>{selected.size} of {candidates.length} selected</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => toggleAll(true)} disabled={!candidates.length} style={{ padding: "6px 14px", background: "var(--primary-light)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Select All</button>
              <button onClick={() => toggleAll(false)} disabled={!candidates.length} style={{ padding: "6px 14px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear</button>
            </div>
          </div>

          {loadingStatus ? (
            <Spinner />
          ) : candidates.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--subtext)" }}>No payslips found for this run yet — process the payroll first.</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 0" }}>
              {candidates.map((c) => {
                const checked = selected.has(c.employeeId);
                return (
                  <label key={c.employeeId} onClick={() => toggleEmployee(c.employeeId)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: checked ? "var(--primary-light, #f0fdff)" : "transparent", borderBottom: "1px solid var(--border)" }}>
                    <input type="checkbox" checked={checked} onChange={() => {}} style={{ cursor: "pointer" }} />
                    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.employeeName}</span>
                      <span style={{ fontSize: 11.5, color: "var(--subtext)", fontFamily: "monospace" }}>{c.employeeId} · Net {fmt(c.net)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Channel configuration */}
        <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: "var(--text)" }}>Distribution Channels</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ChannelRow
              icon={Mail} title="Email" subtitle="Send as PDF attachment with a customizable template"
              enabled={channels.email.enabled}
              onToggle={(v) => setChannel("email", { enabled: v })}
              extra={(
                <select
                  value={channels.email.template}
                  onChange={(e) => setChannel("email", { template: e.target.value })}
                  style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12.5, background: "var(--card)", outline: "none", cursor: "pointer" }}
                >
                  <option value="standard">Standard Template</option>
                  <option value="professional">Professional Template</option>
                  <option value="minimal">Minimal Template</option>
                </select>
              )}
            />
            <ChannelRow
              icon={Globe} title="Employee Portal" subtitle="Publish to self-service portal and send in-app notification"
              enabled={channels.portal.enabled}
              onToggle={(v) => setChannel("portal", { enabled: v })}
              bg="var(--primary-light, #f0fdff)"
              border="var(--border-focus, var(--border))"
              extra={(
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle checked={channels.portal.notify} onChange={(v) => setChannel("portal", { notify: v })} disabled={!channels.portal.enabled} />
                  <span style={{ fontSize: 12, color: "var(--subtext)" }}>Notify</span>
                </div>
              )}
            />
            <ChannelRow
              icon={MessageSquare} title="SMS (Fallback)" subtitle="Send SMS with a download link if other channels fail"
              enabled={channels.sms.enabled}
              onToggle={(v) => setChannel("sms", { enabled: v })}
              bg="#fffbeb" border="#fcd34d"
              note="Fallback channel"
              extra={(
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Toggle checked={channels.sms.fallback} onChange={(v) => setChannel("sms", { fallback: v })} disabled={!channels.sms.enabled} />
                  <span style={{ fontSize: 12, color: "var(--subtext)" }}>Fallback</span>
                </div>
              )}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button
              id="send-payslips-btn"
              onClick={handleSend}
              disabled={sending || !runId}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 22px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontWeight: 700, cursor: sending || !runId ? "not-allowed" : "pointer", opacity: sending || !runId ? 0.6 : 1 }}
            >
              {sending ? <Spinner size={14} /> : <Send size={16} />}
              {sending ? "Sending…" : "Send Payslips Now"}
            </button>
            <button
              onClick={handleReport}
              disabled={!started}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 20px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontWeight: 600, cursor: started ? "pointer" : "not-allowed", opacity: started ? 1 : 0.5 }}
            >
              <Download size={15} /> Download Report
            </button>
          </div>
        </section>

        {/* Delivery dashboard */}
        <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: "var(--text)" }}>Delivery Tracking</h2>

          {loadingStatus ? (
            <Spinner />
          ) : !started || !status ? (
            <EmptyState title="No distribution yet" subtitle="Configure the channels above and click “Send Payslips Now”." />
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <StatCard icon={Users} label="Total" value={fmt(status.total)} color="var(--text)" />
                <StatCard icon={CheckCircle2} label="Delivered" value={fmt(status.delivered ?? 0)} color="#16a34a" />
                <StatCard icon={XCircle} label="Failed" value={fmt(status.failed ?? 0)} color="#dc2626" />
                <StatCard icon={Clock} label="Pending" value={fmt(status.pending ?? 0)} color="#d97706" />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ height: 12, background: "var(--background)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, borderRadius: 99, background: (status.failed ?? 0) > 0 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "linear-gradient(90deg,#10b981,#0284c7)", transition: "width 0.4s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--subtext)", marginTop: 6 }}>
                  <span>{status.delivered ?? 0} delivered · {status.failed ?? 0} failed</span>
                  <span>{progress}%</span>
                </div>
              </div>

              {/* Channel breakdown */}
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>Channel Breakdown</h3>
              {status.channels?.length ? (
                <div style={{ overflowX: "auto", marginBottom: 20 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                        {["Channel", "Sent", "Delivered", "Failed", "Success Rate"].map((h) => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {status.channels.map((c, i) => {
                        const Icon = CHANNEL_ICONS[c.channel] || Send;
                        const rate = c.sent ? Math.round((c.delivered / c.sent) * 100) : 0;
                        return (
                          <tr key={`${c.channel}-${i}`} style={{ borderBottom: i < status.channels.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td style={{ padding: "11px 16px", fontWeight: 600, fontSize: 13, color: "var(--text)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Icon size={14} style={{ color: "var(--primary)" }} /> {c.channel}</span>
                            </td>
                            <td style={{ padding: "11px 16px", fontSize: 13, fontFamily: "monospace" }}>{c.sent}</td>
                            <td style={{ padding: "11px 16px", fontSize: 13, fontFamily: "monospace", color: "#16a34a", fontWeight: 600 }}>{c.delivered}</td>
                            <td style={{ padding: "11px 16px", fontSize: 13, fontFamily: "monospace", color: "#dc2626" }}>{c.failed}</td>
                            <td style={{ padding: "11px 16px", fontSize: 13, fontFamily: "monospace" }}>{rate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--subtext)", marginBottom: 20 }}>No channel activity recorded.</p>
              )}

              {/* Failed deliveries */}
              {status.failed_list?.length > 0 && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", margin: "0 0 10px" }}>Failed Deliveries ({status.failed_list.length})</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                          {["Employee", "Employee ID", "Channel", "Error", "Action"].map((h) => (
                            <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {status.failed_list.map((r, i) => (
                          <tr key={`${r.employeeId}-${i}`} style={{ borderBottom: i < status.failed_list.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td style={{ padding: "11px 16px", fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{r.name}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12.5, fontFamily: "monospace", color: "var(--subtext)" }}>{r.employeeId}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12.5, textTransform: "capitalize" }}>{r.channel}</td>
                            <td style={{ padding: "11px 16px", fontSize: 12.5, color: "var(--red)" }}>{r.error}</td>
                            <td style={{ padding: "11px 16px" }}>
                              <button
                                onClick={handleRetry}
                                disabled={retrying}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "var(--primary-light)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                              >
                                {retrying ? <Spinner size={12} /> : <RotateCcw size={12} />} Retry
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
  );
}

export default function PayslipDistribution() {
  return <MainLayout><PayslipDistributionPanel /></MainLayout>;
}