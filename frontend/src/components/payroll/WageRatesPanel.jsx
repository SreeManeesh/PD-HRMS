import { useState, useEffect } from "react";
import { Plus, Edit3, Trash2, Check, X, MapPin, Briefcase, ShieldCheck, Filter } from "lucide-react";
import { getWageRates, createWageRate, updateWageRate, deleteWageRate } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";

export const INDIAN_STATES = [
  "All States (Default)",
  "Maharashtra",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Gujarat",
  "Uttar Pradesh",
  "Haryana",
  "West Bengal",
  "Telangana",
  "Rajasthan",
  "Kerala",
  "Madhya Pradesh",
  "Andhra Pradesh",
  "Punjab",
];

export default function WageRatesPanel({ locations = [] }) {
  const toast = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDailyRate, setEditDailyRate] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter state
  const [selectedStateFilter, setSelectedStateFilter] = useState("All States (Default)");

  // Form state
  const [formCategory, setFormCategory] = useState("Skilled");
  const [formDailyRate, setFormDailyRate] = useState("");
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formState, setFormState] = useState("All States (Default)");
  const [formLocationId, setFormLocationId] = useState("");

  const loadRates = async (stateFilter = selectedStateFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (stateFilter && stateFilter !== "All States (Default)") {
        params.state = stateFilter;
      }
      const res = await getWageRates(params);
      setRates(res.data || []);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load wage rates", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRates(selectedStateFilter);
  }, [selectedStateFilter]);

  const handleStartEdit = (rate) => {
    setEditingId(rate.id);
    setEditDailyRate(String(rate.dailyRate));
  };

  const handleSaveEdit = async (id) => {
    const val = parseFloat(editDailyRate);
    if (isNaN(val) || val <= 0) {
      toast("Please enter a valid daily rate", "error");
      return;
    }
    setSaving(true);
    try {
      await updateWageRate(id, { dailyRate: val });
      setRates((prev) => prev.map((r) => (r.id === id ? { ...r, dailyRate: val, hourlyRate: Math.round((val / 8) * 100) / 100 } : r)));
      setEditingId(null);
      toast(`Rate updated to ₹${val.toLocaleString("en-IN")}/day. Live payroll picks this automatically!`);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Could not update rate", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const dRate = parseFloat(formDailyRate);
    if (isNaN(dRate) || dRate <= 0) {
      toast("Please enter a valid daily wage rate", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        skillCategory: formCategory,
        dailyRate: dRate,
        hourlyRate: formHourlyRate ? parseFloat(formHourlyRate) : Math.round((dRate / 8) * 100) / 100,
        state: formState && formState !== "All States (Default)" ? formState : null,
        locationId: formLocationId || null,
        isActive: true,
      };
      await createWageRate(payload);
      toast(`Wage rate for ${formCategory} (${formState}) saved successfully`);
      setShowAddModal(false);
      setFormDailyRate("");
      setFormHourlyRate("");
      setFormLocationId("");
      setFormState("All States (Default)");
      loadRates(selectedStateFilter);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to create rate", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, category) => {
    if (!window.confirm(`Are you sure you want to deactivate or remove the ${category} wage rate?`)) return;
    try {
      await deleteWageRate(id);
      setRates((prev) => prev.filter((r) => r.id !== id));
      toast("Wage rate deleted");
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to delete rate", "error");
    }
  };

  const getCategoryBadge = (cat) => {
    const c = String(cat).toLowerCase();
    if (c.includes("skilled") && !c.includes("semi")) {
      return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
    }
    if (c.includes("semi")) {
      return { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
    }
    return { bg: "#fef3c7", color: "#d97706", border: "#fde68a" };
  };

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Briefcase size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Wage Rates & State-Wise Minimum Wage Scales</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <ShieldCheck size={12} /> Statutory Compliance
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "750px" }}>
            Define statutory minimum wage rates categorized by skill level across Indian states and territories. Rate changes update payroll computations dynamically without code redeployment.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Indian States Dropdown Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 8px" }}>
            <Filter size={14} style={{ color: "var(--subtext)" }} />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>State:</span>
            <select
              value={selectedStateFilter}
              onChange={(e) => setSelectedStateFilter(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--text)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "9px 16px", background: "var(--primary)", color: "#fff",
              border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px",
              fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
            }}
          >
            <Plus size={15} /> Add Wage Rate
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : rates.length === 0 ? (
        <EmptyState
          title={`No wage rates found for ${selectedStateFilter}`}
          subtitle="Click 'Add Wage Rate' to establish state minimum rates for Skilled, Semi-Skilled, and Unskilled categories."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                {["Skill Category", "Indian State / Jurisdiction", "Site / Location", "Daily Rate (₹)", "Hourly Rate (₹)", "Effective From", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.map((rate, idx) => {
                const badge = getCategoryBadge(rate.skillCategory);
                const isEditing = editingId === rate.id;
                const stateDisplay = rate.state || "All States (Default)";
                const locName = rate.location?.name || "All Sites";
                const effectiveDate = rate.effectiveFrom ? new Date(rate.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Immediate";

                return (
                  <tr key={rate.id} style={{ borderBottom: idx < rates.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.12s" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: "99px", background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                        {rate.skillCategory}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", fontWeight: 600, color: rate.state ? "var(--text)" : "var(--subtext)" }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: rate.state ? "rgba(16, 185, 129, 0.1)" : "var(--background)",
                        border: "1px solid var(--border)",
                        color: rate.state ? "#059669" : "var(--subtext)",
                      }}>
                        {stateDisplay}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: rate.location ? "var(--text)" : "var(--subtext)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {rate.location && <MapPin size={13} style={{ color: "var(--primary)" }} />}
                        <span style={{ fontWeight: rate.location ? 600 : 400 }}>{locName}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--subtext)" }}>₹</span>
                          <input
                            type="number"
                            value={editDailyRate}
                            onChange={(e) => setEditDailyRate(e.target.value)}
                            autoFocus
                            style={{ width: "95px", height: "32px", padding: "0 8px", border: "2px solid var(--primary)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", fontWeight: 700, fontFamily: "monospace" }}
                          />
                        </div>
                      ) : (
                        <span style={{ fontSize: "14.5px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>
                          ₹{Number(rate.dailyRate).toLocaleString("en-IN")}
                          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--subtext)" }}>/day</span>
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "13px", color: "var(--subtext)", fontFamily: "monospace" }}>
                      {rate.hourlyRate ? `₹${Number(rate.hourlyRate).toLocaleString("en-IN")}/hr` : `₹${Math.round(Number(rate.dailyRate) / 8)}/hr`}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: "12.5px", color: "var(--subtext)" }}>
                      {effectiveDate}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: rate.isActive ? "#f0fdf4" : "#fef2f2", color: rate.isActive ? "#16a34a" : "#dc2626" }}>
                        {rate.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={() => handleSaveEdit(rate.id)}
                            disabled={saving}
                            title="Save"
                            style={{ padding: "6px 10px", background: "var(--green, #16a34a)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600 }}
                          >
                            <Check size={13} /> Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            title="Cancel"
                            style={{ padding: "6px 8px", background: "var(--background)", color: "var(--subtext)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => handleStartEdit(rate)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px", background: "var(--primary-light)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                          >
                            <Edit3 size={12} /> Edit Rate
                          </button>
                          <button
                            onClick={() => handleDelete(rate.id, rate.skillCategory)}
                            title="Delete"
                            style={{ padding: "5px 7px", background: "transparent", color: "var(--red)", border: "none", cursor: "pointer", opacity: 0.7 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "480px", padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Configure Indian State Wage Rate</h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "18px" }}>Define a baseline category rate or a state-specific statutory minimum wage scale.</p>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Skill Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  style={{ width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13.5px" }}
                >
                  <option value="Skilled">Skilled</option>
                  <option value="Semi-Skilled">Semi-Skilled</option>
                  <option value="Unskilled">Unskilled</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Indian State / Jurisdiction *</label>
                <select
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                  style={{ width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13.5px" }}
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <span style={{ fontSize: "11px", color: "var(--subtext)" }}>Rates apply to all employees in this state or location unless individually overridden.</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Daily Wage Rate (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 950"
                  value={formDailyRate}
                  onChange={(e) => setFormDailyRate(e.target.value)}
                  required
                  style={{ width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13.5px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Hourly Wage Rate (₹) (Optional)</label>
                <input
                  type="number"
                  placeholder="Derived automatically (Daily / 8)"
                  value={formHourlyRate}
                  onChange={(e) => setFormHourlyRate(e.target.value)}
                  style={{ width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13.5px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Branch / Site Specific Override (Optional)</label>
                <select
                  value={formLocationId}
                  onChange={(e) => setFormLocationId(e.target.value)}
                  style={{ width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13.5px" }}
                >
                  <option value="">All Branches within State</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: "8px 16px", background: "var(--background)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: "8px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  {saving ? "Saving…" : "Save Wage Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
