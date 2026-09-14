import { useState, useEffect } from "react";
import { Plus, Sliders, CheckCircle2, AlertCircle, Layers, Award, Moon, Factory, Utensils } from "lucide-react";
import { getPayrollComponentConfigs, createPayrollComponentConfig, deletePayrollComponentConfig } from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";

export default function PayRulesPanel({ locations = [] }) {
  const toast = useToast();
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("earning");
  const [calcType, setCalcType] = useState("fixed");
  const [metric, setMetric] = useState("payableDays");
  const [value, setValue] = useState("");
  const [applicableCategory, setApplicableCategory] = useState("ALL");
  const [locationId, setLocationId] = useState("");
  const [minAttendanceDays, setMinAttendanceDays] = useState("");
  const [maxCap, setMaxCap] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [slabsJson, setSlabsJson] = useState('[{"min": 26, "max": 31, "value": 1500}, {"min": 24, "max": 25.5, "value": 750}]');

  const loadComponents = async () => {
    setLoading(true);
    try {
      const res = await getPayrollComponentConfigs();
      setComponents(res.data || []);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to load components", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComponents();
  }, []);

  const applyPreset = (type) => {
    if (type === "food_allowance_s10") {
      setName("Food Allowance");
      setCode("FOOD_ALLOW");
      setKind("earning");
      setCalcType("fixed");
      setValue("1000");
      setApplicableCategory("Skilled");
      const fLoc = locations.find((l) => l.name?.toLowerCase().includes("factory")) || locations[0];
      setLocationId(fLoc?.id || "");
      setMinAttendanceDays("25");
      setMaxCap("1000");
      setEffectiveFrom("2026-04-01");
      setEffectiveTo("");
      setSlabsJson("");
    } else if (type === "transport_allowance_s10") {
      setName("Transport Allowance");
      setCode("TRANSPORT_ALLOW");
      setKind("earning");
      setCalcType("fixed");
      setValue("1500");
      setApplicableCategory("ALL");
      setLocationId("");
      setMinAttendanceDays("");
      setMaxCap("");
      setEffectiveFrom("2026-01-01");
      setEffectiveTo("");
      setSlabsJson("");
    } else if (type === "night_slabs") {
      setName("Night Shift Allowance");
      setCode("NIGHT_ALLOW");
      setKind("earning");
      setCalcType("slab");
      setMetric("nightShifts");
      setSlabsJson(JSON.stringify([
        { min: 0, max: 9.99, value: 0 },
        { min: 10, max: 14.99, value: 1000 },
        { min: 15, max: 99999, value: 1500 }
      ], null, 2));
      setValue("");
      setMinAttendanceDays("");
      setMaxCap("");
    } else if (type === "night_per_shift") {
      setName("Night Shift Allowance (Per Shift)");
      setCode("NIGHT_ALLOW");
      setKind("earning");
      setCalcType("per_shift");
      setMetric("nightShifts");
      setValue("100");
      setSlabsJson("");
      setMinAttendanceDays("");
      setMaxCap("");
    } else if (type === "production_slabs") {
      setName("Production Incentive");
      setCode("PROD_INC");
      setKind("earning");
      setCalcType("slab");
      setMetric("productionUnits");
      setSlabsJson(JSON.stringify([
        { min: 0, max: 799.99, value: 0 },
        { min: 800, max: 999.99, value: 1000 },
        { min: 1000, max: 1199.99, value: 2000 },
        { min: 1200, max: 99999, value: 3000 }
      ], null, 2));
      setValue("");
      setMinAttendanceDays("");
      setMaxCap("");
    } else if (type === "attendance_bonus") {
      setName("Attendance Bonus");
      setCode("ATT_BONUS");
      setKind("earning");
      setCalcType("slab");
      setMetric("payableDays");
      setSlabsJson(JSON.stringify([
        { min: 26, max: 31, value: 1500 },
        { min: 24, max: 25.5, value: 750 },
        { min: 0, max: 23.99, value: 0 }
      ], null, 2));
      setValue("");
      setMinAttendanceDays("");
      setMaxCap("");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let parsedSlabs = undefined;
      if (calcType === "slab" || calcType === "threshold") {
        try {
          parsedSlabs = JSON.parse(slabsJson);
        } catch {
          toast("Invalid slabs JSON formatting", "error");
          setSaving(false);
          return;
        }
      }

      const payload = {
        name,
        code: code.toUpperCase().replace(/\s+/g, "_"),
        kind,
        calcType,
        metric: (calcType === "slab" || calcType === "threshold" || calcType === "per_day" || calcType === "per_shift" || calcType === "per_hour") ? metric : null,
        value: value ? parseFloat(value) : null,
        applicableCategory: applicableCategory || "ALL",
        locationId: locationId || null,
        minAttendanceDays: minAttendanceDays ? parseInt(minAttendanceDays, 10) : null,
        maxCap: maxCap ? parseFloat(maxCap) : null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        slabs: parsedSlabs,
        isActive: true,
      };

      await createPayrollComponentConfig(payload);
      toast(`Configured ${name} successfully!`);
      setShowAddModal(false);
      setName("");
      setCode("");
      setValue("");
      setApplicableCategory("ALL");
      setLocationId("");
      setMinAttendanceDays("");
      setMaxCap("");
      setEffectiveFrom("");
      setEffectiveTo("");
      loadComponents();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to create rule", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, compName) => {
    if (!window.confirm(`Delete rule "${compName}"?`)) return;
    try {
      await deletePayrollComponentConfig(id);
      setComponents((prev) => prev.filter((c) => c.id !== id));
      toast(`Rule ${compName} removed`);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to remove component", "error");
    }
  };

  const getRuleIcon = (code, metric) => {
    if (code.includes("BONUS") || metric === "payableDays") return <Award size={18} style={{ color: "var(--amber)" }} />;
    if (code.includes("NIGHT") || metric === "nightShifts") return <Moon size={18} style={{ color: "#8b5cf6" }} />;
    if (code.includes("PROD") || metric === "productionUnits") return <Factory size={18} style={{ color: "#0ea5e9" }} />;
    if (code.includes("FOOD")) return <Utensils size={18} style={{ color: "#10b981" }} />;
    return <Layers size={18} style={{ color: "var(--primary)" }} />;
  };

  return (
    <section style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Sliders size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Allowance & Incentive Rules</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "99px", display: "inline-flex", alignItems: "center" }}>
              Dynamic Calculation Rules
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--subtext)", margin: 0, maxWidth: "780px" }}>
            Manage calculation rules for attendance bonuses, night shift differentials, tiered production incentives, and minimum attendance thresholds.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "9px 16px", background: "var(--primary)", color: "#fff",
            border: "none", borderRadius: "var(--radius-sm)", fontSize: "13px",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={15} /> Add Pay Rule
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : components.length === 0 ? (
        <EmptyState title="No dynamic pay rules configured" subtitle="Create configurable allowances, attendance bonuses, or incentive tiers." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
          {components.map((comp) => {
            const slabs = Array.isArray(comp.slabs) ? comp.slabs : [];
            return (
              <div
                key={comp.id}
                style={{
                  background: "var(--background)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "14px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {getRuleIcon(comp.code, comp.metric)}
                      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", margin: 0 }}>{comp.name}</h3>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--subtext)" }}>
                      {comp.calcType.toUpperCase()}
                    </span>
                  </div>

                  <p style={{ fontSize: "12px", color: "var(--subtext)", margin: "0 0 8px 0", fontFamily: "monospace" }}>
                    Code: {comp.code} · {comp.kind.toUpperCase()}
                  </p>

                  {/* Metadata Badges: Category, Location, Threshold, Cap, Effective Dates */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "#e0e7ff", color: "#3730a3" }}>
                      Category: {comp.applicableCategory || "ALL"}
                    </span>
                    {comp.locationId && (
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "#fef3c7", color: "#92400e" }}>
                        📍 {locations.find((l) => l.id === comp.locationId)?.name || "Factory A"}
                      </span>
                    )}
                    {comp.minAttendanceDays && (
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "#ecfdf5", color: "#065f46" }}>
                        ✓ Min {comp.minAttendanceDays} days
                      </span>
                    )}
                    {comp.maxCap && (
                      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                        Cap: ₹{Number(comp.maxCap).toLocaleString("en-IN")}
                      </span>
                    )}
                    {comp.effectiveFrom && (
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", background: "#f3e8ff", color: "#6b21a8" }}>
                        From: {new Date(comp.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>

                  {/* Slabs breakdown */}
                  {slabs.length > 0 ? (
                    <div style={{ background: "var(--card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", padding: "10px", marginTop: "8px" }}>
                      <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", margin: "0 0 8px 0" }}>
                        Incentive Slabs ({comp.metric || "Metric"})
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {slabs.map((s, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px" }}>
                            <span style={{ color: "var(--text)", fontWeight: 500 }}>
                              {s.min} – {s.max > 99999 ? "∞" : s.max} {comp.metric ? comp.metric.replace(/([A-Z])/g, " $1").toLowerCase() : "units"}
                            </span>
                            <span style={{ fontWeight: 700, color: s.value > 0 ? "var(--green)" : "var(--subtext)", fontFamily: "monospace" }}>
                              {s.value > 0 ? `+₹${Number(s.value).toLocaleString("en-IN")}` : "₹0"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "var(--card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", padding: "10px", marginTop: "8px" }}>
                      <span style={{ fontSize: "12.5px", color: "var(--subtext)" }}>
                        {comp.calcType === "per_shift"
                          ? "Rate per Shift: "
                          : comp.calcType === "per_day"
                          ? "Rate per Day: "
                          : comp.calcType === "per_hour"
                          ? "Rate per Hour: "
                          : "Fixed / Standard Amount: "}
                      </span>
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", fontFamily: "monospace" }}>
                        ₹{Number(comp.value || 0).toLocaleString("en-IN")}
                        {comp.calcType === "per_shift" ? " / shift" : comp.calcType === "per_day" ? " / day" : comp.calcType === "per_hour" ? " / hr" : ""}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
                  <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                    <CheckCircle2 size={12} /> Active in Payroll Engine
                  </span>
                  <button
                    onClick={() => handleDelete(comp.id, comp.name)}
                    style={{ background: "transparent", border: "none", color: "var(--red)", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", opacity: 0.8 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "var(--card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: "500px", padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Create Dynamic Pay Rule</h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", marginBottom: "12px" }}>Add an attendance bonus slab, production incentive, or allowance rule.</p>

            {/* Quick Presets */}
            <div style={{ marginBottom: "14px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                1-Click Quick Presets:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => applyPreset("food_allowance_s10")}
                  style={{ fontSize: "11px", fontWeight: 700, padding: "5px 9px", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 10: Food Allowance (Skilled, Factory A, ₹1k, 25+ d, Eff: Apr 2026)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("transport_allowance_s10")}
                  style={{ fontSize: "11px", fontWeight: 700, padding: "5px 9px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 10: Transport Allowance (Fixed ₹1,500, All Categories)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("night_slabs")}
                  style={{ fontSize: "11px", fontWeight: 600, padding: "4px 8px", background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 7: Night Slabs (10–14: ₹1k, 15+: ₹1.5k)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("night_per_shift")}
                  style={{ fontSize: "11px", fontWeight: 600, padding: "4px 8px", background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 7: Night Per-Shift (₹100/shift)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("production_slabs")}
                  style={{ fontSize: "11px", fontWeight: 600, padding: "4px 8px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 8: Production Slabs (&lt;800 to 1200+)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("attendance_bonus")}
                  style={{ fontSize: "11px", fontWeight: 600, padding: "4px 8px", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: "4px", cursor: "pointer" }}
                >
                   Scenario 6: Attendance Bonus Slabs
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Rule Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Attendance Bonus"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!code) setCode(e.target.value.toUpperCase().replace(/\s+/g, "_"));
                    }}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Unique Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. ATT_BONUS"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Calculation Type *</label>
                  <select
                    value={calcType}
                    onChange={(e) => setCalcType(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    <option value="slab">Slab-Based Ladder</option>
                    <option value="fixed">Fixed Allowance</option>
                    <option value="threshold">Threshold Minimum</option>
                    <option value="per_shift">Per Shift (e.g. Night Shift ₹100/shift)</option>
                    <option value="per_day">Per Day Worked</option>
                    <option value="per_hour">Per Hour</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Evaluation Metric</label>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    disabled={calcType === "fixed"}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    <option value="payableDays">Payable Days (Attendance)</option>
                    <option value="nightShifts">Night Shifts Count</option>
                    <option value="productionUnits">Production Units</option>
                    <option value="overtimeHours">Overtime Hours</option>
                  </select>
                </div>
              </div>

              {(calcType === "fixed" || calcType === "per_shift" || calcType === "per_day" || calcType === "per_hour") ? (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>
                    {calcType === "per_shift" ? "Rate per Shift (₹) *" : calcType === "per_day" ? "Rate per Day (₹) *" : calcType === "per_hour" ? "Rate per Hour (₹) *" : "Fixed Amount (₹) *"}
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    required
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Slabs (JSON Array) *</label>
                  <textarea
                    rows={4}
                    value={slabsJson}
                    onChange={(e) => setSlabsJson(e.target.value)}
                    placeholder='[{"min": 26, "max": 31, "value": 1500}]'
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "12px", fontFamily: "monospace" }}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Component Type *</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    <option value="earning">Earning (+)</option>
                    <option value="deduction">Deduction (−)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Applicable Category</label>
                  <select
                    value={applicableCategory}
                    onChange={(e) => setApplicableCategory(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    <option value="ALL">ALL Categories</option>
                    <option value="Skilled">Skilled Workers</option>
                    <option value="Semi-Skilled">Semi-Skilled Workers</option>
                    <option value="Unskilled">Unskilled Workers</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Applicable Location</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  >
                    <option value="">All Locations</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Max Amount Cap (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={maxCap}
                    onChange={(e) => setMaxCap(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Min Attendance Days (Qualification Threshold)</label>
                <input
                  type="number"
                  placeholder="e.g. 25 (worker must work at least 25 days to qualify)"
                  value={minAttendanceDays}
                  onChange={(e) => setMinAttendanceDays(e.target.value)}
                  style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Effective From</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Effective To (Optional)</label>
                  <input
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", color: "var(--text)", fontSize: "13px" }}
                  />
                </div>
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
                  {saving ? "Saving…" : "Save Pay Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
