import { useState, useEffect } from "react";
import {
  Plus,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Layers,
  Award,
  Moon,
  Factory,
  Utensils,
  Edit3,
  Trash2,
  X,
} from "lucide-react";
import {
  getPayrollComponentConfigs,
  createPayrollComponentConfig,
  updatePayrollComponentConfig,
  deletePayrollComponentConfig,
} from "../../services/payrollService";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";

export default function PayRulesPanel({ locations = [] }) {
  const toast = useToast();
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);

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
  const [slabsJson, setSlabsJson] = useState(
    '[{"min": 26, "max": 31, "value": 1500}, {"min": 24, "max": 25.5, "value": 750}]',
  );

  const loadComponents = async () => {
    setLoading(true);
    try {
      const res = await getPayrollComponentConfigs();
      setComponents(res.data || []);
    } catch (err) {
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to load components",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComponents();
  }, []);

  const resetForm = () => {
    setEditingRuleId(null);
    setName("");
    setCode("");
    setKind("earning");
    setCalcType("fixed");
    setMetric("payableDays");
    setValue("");
    setApplicableCategory("ALL");
    setLocationId("");
    setMinAttendanceDays("");
    setMaxCap("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setSlabsJson(
      '[{"min": 26, "max": 31, "value": 1500}, {"min": 24, "max": 25.5, "value": 750}]',
    );
  };

  const handleStartEdit = (comp) => {
    setEditingRuleId(comp.id);
    setName(comp.name || "");
    setCode(comp.code || "");
    setKind(comp.kind || "earning");
    setCalcType(comp.calcType || "fixed");
    setMetric(comp.metric || "payableDays");
    setValue(
      comp.value !== null && comp.value !== undefined ? String(comp.value) : "",
    );
    setApplicableCategory(comp.applicableCategory || "ALL");
    setLocationId(comp.locationId || "");
    setMinAttendanceDays(
      comp.minAttendanceDays ? String(comp.minAttendanceDays) : "",
    );
    setMaxCap(comp.maxCap ? String(comp.maxCap) : "");
    setEffectiveFrom(
      comp.effectiveFrom ? String(comp.effectiveFrom).slice(0, 10) : "",
    );
    setEffectiveTo(
      comp.effectiveTo ? String(comp.effectiveTo).slice(0, 10) : "",
    );
    setSlabsJson(comp.slabs ? JSON.stringify(comp.slabs, null, 2) : "[]");
    setShowAddModal(true);
  };

  const applyPreset = (presetKey) => {
    if (presetKey === "food_allowance_s10") {
      setName("Food Allowance");
      setCode("FOOD_ALLOW");
      setKind("earning");
      setCalcType("fixed");
      setValue("1000");
      setApplicableCategory("Skilled");
      const facA =
        locations.find((l) => l.name.toLowerCase().includes("factory a"))?.id ||
        "";
      setLocationId(facA);
      setMinAttendanceDays("25");
      setMaxCap("1000");
      setEffectiveFrom("2026-04-01");
      setEffectiveTo("");
      toast("Applied Scenario 10 Food Allowance preset");
    } else if (presetKey === "transport_allowance_s10") {
      setName("Transport Allowance");
      setCode("TRANSPORT_ALLOW");
      setKind("earning");
      setCalcType("fixed");
      setValue("1500");
      setApplicableCategory("ALL");
      setLocationId("");
      setMinAttendanceDays("");
      setMaxCap("1500");
      setEffectiveFrom("2026-01-01");
      setEffectiveTo("");
      toast("Applied Scenario 10 Transport Allowance preset");
    } else if (presetKey === "attendance_bonus") {
      setName("Attendance Bonus");
      setCode("ATT_BONUS");
      setKind("earning");
      setCalcType("slab");
      setMetric("payableDays");
      setSlabsJson(
        JSON.stringify(
          [
            { min: 26, max: 31, value: 1500 },
            { min: 24, max: 25.5, value: 750 },
            { min: 0, max: 23.5, value: 0 },
          ],
          null,
          2,
        ),
      );
      toast("Applied Attendance Bonus preset");
    } else if (presetKey === "night_slabs") {
      setName("Night Shift Allowance");
      setCode("NIGHT_ALLOW");
      setKind("earning");
      setCalcType("threshold");
      setMetric("nightShifts");
      setSlabsJson(
        JSON.stringify(
          [
            { min: 0, max: 9.5, value: 0 },
            { min: 10, max: 14.5, value: 1000 },
            { min: 15, max: 999, value: 1500 },
          ],
          null,
          2,
        ),
      );
      toast("Applied Night Shift Tiered Slabs preset");
    } else if (presetKey === "night_per_shift") {
      setName("Night Shift Allowance (Per-Shift)");
      setCode("NIGHT_ALLOW_PER_SHIFT");
      setKind("earning");
      setCalcType("per_shift");
      setMetric("nightShifts");
      setValue("100");
      toast("Applied Night Shift ₹100/shift preset");
    } else if (presetKey === "prod_incentive") {
      setName("Production Incentive");
      setCode("PROD_INC");
      setKind("earning");
      setCalcType("threshold");
      setMetric("productionUnits");
      setSlabsJson(
        JSON.stringify(
          [
            { min: 0, max: 799, value: 0 },
            { min: 800, max: 999, value: 1000 },
            { min: 1000, max: 1199, value: 2000 },
            { min: 1200, max: 999999, value: 3000 },
          ],
          null,
          2,
        ),
      );
      toast("Applied Production Incentive preset");
    }
  };

  const handleSubmitForm = async (e) => {
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
        metric:
          calcType === "slab" ||
          calcType === "threshold" ||
          calcType === "per_day" ||
          calcType === "per_shift" ||
          calcType === "per_hour"
            ? metric
            : null,
        value: value ? parseFloat(value) : null,
        applicableCategory: applicableCategory || "ALL",
        locationId: locationId || null,
        minAttendanceDays: minAttendanceDays
          ? parseInt(minAttendanceDays, 10)
          : null,
        maxCap: maxCap ? parseFloat(maxCap) : null,
        effectiveFrom: effectiveFrom
          ? new Date(effectiveFrom).toISOString()
          : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        slabs: parsedSlabs,
        isActive: true,
      };

      if (editingRuleId) {
        await updatePayrollComponentConfig(editingRuleId, payload);
        toast(`Pay rule "${name}" updated successfully!`);
      } else {
        await createPayrollComponentConfig(payload);
        toast(`Configured "${name}" successfully!`);
      }

      setShowAddModal(false);
      resetForm();
      loadComponents();
    } catch (err) {
      toast(
        err.response?.data?.message || err.message || "Failed to save rule",
        "error",
      );
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
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to remove component",
        "error",
      );
    }
  };

  const getRuleIcon = (code, metric) => {
    if (code.includes("BONUS") || metric === "payableDays")
      return <Award size={18} style={{ color: "var(--amber)" }} />;
    if (code.includes("NIGHT") || metric === "nightShifts")
      return <Moon size={18} style={{ color: "#8b5cf6" }} />;
    if (code.includes("PROD") || metric === "productionUnits")
      return <Factory size={18} style={{ color: "#0ea5e9" }} />;
    if (code.includes("FOOD"))
      return <Utensils size={18} style={{ color: "#10b981" }} />;
    return <Layers size={18} style={{ color: "var(--primary)" }} />;
  };

  return (
    <section
      style={{
        background: "var(--card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "6px",
            }}
          >
            <Sliders size={20} style={{ color: "var(--primary)" }} />
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Allowance & Incentive Rules
            </h2>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: "var(--primary-light)",
                color: "var(--primary)",
                padding: "2px 8px",
                borderRadius: "99px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Dynamic Calculation Rules
            </span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--subtext)",
              margin: 0,
              maxWidth: "780px",
            }}
          >
            calculation rules for attendance bonuses, night shift differentials,
            tiered production incentives, and minimum attendance thresholds.
            Rules evaluate dynamically during payroll processing.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 16px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={15} /> Add Pay Rule
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : components.length === 0 ? (
        <EmptyState
          title="No dynamic pay rules configured"
          subtitle="Create configurable allowances, attendance bonuses, or incentive tiers."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "16px",
          }}
        >
          {components.map((comp) => {
            const slabs = Array.isArray(comp.slabs) ? comp.slabs : [];
            const locObj = locations.find((l) => l.id === comp.locationId);
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {getRuleIcon(comp.code, comp.metric)}
                      <h3
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "var(--text)",
                          margin: 0,
                        }}
                      >
                        {comp.name}
                      </h3>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "99px",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--subtext)",
                      }}
                    >
                      {comp.calcType.toUpperCase()}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontFamily: "monospace",
                        color: "var(--subtext)",
                        background: "var(--card)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {comp.code}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color:
                          comp.kind === "deduction"
                            ? "var(--red)"
                            : "var(--primary)",
                        background:
                          comp.kind === "deduction"
                            ? "#fef2f2"
                            : "var(--primary-light)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {comp.kind === "deduction" ? "Deduction" : "Earning"}
                    </span>
                    {comp.applicableCategory &&
                      comp.applicableCategory !== "ALL" && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#059669",
                            background: "#ecfdf5",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid #a7f3d0",
                          }}
                        >
                          {comp.applicableCategory}
                        </span>
                      )}
                    {locObj && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#2563eb",
                          background: "#eff6ff",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        {locObj.name}
                      </span>
                    )}
                    {comp.minAttendanceDays > 0 && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#d97706",
                          background: "#fffbeb",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid #fde68a",
                        }}
                      >
                        Min {comp.minAttendanceDays}d att.
                      </span>
                    )}
                    {comp.maxCap > 0 && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--text)",
                          background: "var(--card)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                        }}
                      >
                        Cap: ₹{comp.maxCap.toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>

                  {/* Effective Dates */}
                  {(comp.effectiveFrom || comp.effectiveTo) && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--subtext)",
                        marginBottom: "8px",
                      }}
                    >
                      Effective:{" "}
                      {comp.effectiveFrom
                        ? new Date(comp.effectiveFrom).toLocaleDateString(
                            "en-IN",
                            { day: "2-digit", month: "short", year: "numeric" },
                          )
                        : "Immediate"}
                      {comp.effectiveTo
                        ? ` to ${new Date(comp.effectiveTo).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                        : " onwards"}
                    </div>
                  )}

                  {/* Slabs or Value */}
                  {comp.calcType === "slab" || comp.calcType === "threshold" ? (
                    <div
                      style={{
                        background: "var(--card)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        padding: "10px",
                        marginTop: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--subtext)",
                          textTransform: "uppercase",
                          marginBottom: "6px",
                        }}
                      >
                        Evaluation Metric:{" "}
                        <span
                          style={{
                            color: "var(--text)",
                            fontFamily: "monospace",
                          }}
                        >
                          {comp.metric}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {slabs.map((s, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "12px",
                              padding: "3px 0",
                              borderBottom:
                                i < slabs.length - 1
                                  ? "1px dashed var(--border)"
                                  : "none",
                            }}
                          >
                            <span style={{ color: "var(--subtext)" }}>
                              {s.max
                                ? `${s.min} – ${s.max} ${comp.metric === "payableDays" ? "days" : comp.metric === "nightShifts" ? "shifts" : "units"}`
                                : `${s.min}+ ${comp.metric === "payableDays" ? "days" : comp.metric === "nightShifts" ? "shifts" : "units"}`}
                            </span>
                            <span
                              style={{
                                fontWeight: 700,
                                color: "var(--text)",
                                fontFamily: "monospace",
                              }}
                            >
                              ₹{Number(s.value || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: "var(--card)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        padding: "10px",
                        marginTop: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{ fontSize: "12px", color: "var(--subtext)" }}
                      >
                        {comp.calcType === "per_shift"
                          ? "Rate per Shift: "
                          : comp.calcType === "per_day"
                            ? "Rate per Day: "
                            : comp.calcType === "per_hour"
                              ? "Rate per Hour: "
                              : "Fixed / Standard Amount: "}
                      </span>
                      <span
                        style={{
                          fontSize: "15px",
                          fontWeight: 800,
                          color: "var(--text)",
                          fontFamily: "monospace",
                        }}
                      >
                        ₹{Number(comp.value || 0).toLocaleString("en-IN")}
                        {comp.calcType === "per_shift"
                          ? " / shift"
                          : comp.calcType === "per_day"
                            ? " / day"
                            : comp.calcType === "per_hour"
                              ? " / hr"
                              : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions: Edit & Remove */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#16a34a",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <CheckCircle2 size={12} /> Active in Payroll Engine
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <button
                      onClick={() => handleStartEdit(comp)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--primary)",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(comp.id, comp.name)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--red)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: 0.8,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal with Fix for UI Overflow */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              width: "100%",
              maxWidth: "540px",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Sticky Header */}
            <div
              style={{
                padding: "20px 24px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--card)",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: 0,
                  }}
                >
                  {editingRuleId
                    ? "Edit Dynamic Pay Rule"
                    : "Create Dynamic Pay Rule"}
                </h3>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--subtext)",
                    margin: "4px 0 0",
                  }}
                >
                  {editingRuleId
                    ? "Update calculation type, rates, thresholds or applicability."
                    : "Add an attendance bonus slab, production incentive, or allowance rule."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--subtext)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {!editingRuleId && (
                <div
                  style={{
                    marginBottom: "16px",
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: "6px",
                    }}
                  >
                    1-Click Quick Presets:
                  </span>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset("food_allowance_s10")}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "5px 9px",
                        background: "#ecfdf5",
                        color: "#065f46",
                        border: "1px solid #a7f3d0",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Food Allowance (Skilled, Factory A, ₹1k, 25+ d)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("transport_allowance_s10")}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "5px 9px",
                        background: "#f0fdf4",
                        color: "#15803d",
                        border: "1px solid #bbf7d0",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Transport Allowance (Fixed ₹1,500)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("night_slabs")}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 8px",
                        background: "#f5f3ff",
                        color: "#6d28d9",
                        border: "1px solid #ddd6fe",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Night Slabs (10–14: ₹1k, 15+: ₹1.5k)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("night_per_shift")}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 8px",
                        background: "#f5f3ff",
                        color: "#6d28d9",
                        border: "1px solid #ddd6fe",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Night Per-Shift (₹100/shift)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("prod_incentive")}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 8px",
                        background: "#e0f2fe",
                        color: "#0369a1",
                        border: "1px solid #bae6fd",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Production Slabs (&lt;800: ₹0, 800-999: ₹1k, 1000-1199:
                      ₹2k, 1200+: ₹3k)
                    </button>
                  </div>
                </div>
              )}

              <form
                id="pay-rule-form"
                onSubmit={handleSubmitForm}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: "4px",
                    }}
                  >
                    Component Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Night Shift Allowance or Food Allowance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      height: "36px",
                      padding: "0 10px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--background)",
                      color: "var(--text)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Component Code *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FOOD_ALLOW"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Component Type *
                    </label>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    >
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Applicable Skill Category
                    </label>
                    <select
                      value={applicableCategory}
                      onChange={(e) => setApplicableCategory(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    >
                      <option value="ALL">All Categories</option>
                      <option value="Skilled">Skilled</option>
                      <option value="Semi-Skilled">Semi-Skilled</option>
                      <option value="Unskilled">Unskilled</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Location / Branch
                    </label>
                    <select
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    >
                      <option value="">All Locations</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Min Attendance Days
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 25"
                      value={minAttendanceDays}
                      onChange={(e) => setMinAttendanceDays(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Maximum Amount Cap (₹)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1000"
                      value={maxCap}
                      onChange={(e) => setMaxCap(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Calculation Type *
                    </label>
                    <select
                      value={calcType}
                      onChange={(e) => setCalcType(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    >
                      <option value="fixed">Fixed Amount</option>
                      <option value="per_day">Rate per Day Present</option>
                      <option value="per_shift">Rate per Shift Worked</option>
                      <option value="per_hour">Rate per Hour (OT)</option>
                      <option value="slab">Continuous Slab Tiers</option>
                      <option value="threshold">Step Threshold Slabs</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Driver Metric
                    </label>
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      disabled={calcType === "fixed"}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                        opacity: calcType === "fixed" ? 0.6 : 1,
                      }}
                    >
                      <option value="payableDays">Payable Days</option>
                      <option value="presentDays">Present Days</option>
                      <option value="nightShifts">Night Shifts Count</option>
                      <option value="productionUnits">
                        Production Output Units
                      </option>
                      <option value="overtimeHours">Overtime Hours</option>
                    </select>
                  </div>
                </div>

                {calcType !== "slab" && calcType !== "threshold" ? (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Amount / Unit Rate (₹) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 100"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Slabs JSON (Range & Amount)
                    </label>
                    <textarea
                      rows={5}
                      value={slabsJson}
                      onChange={(e) => setSlabsJson(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "12px",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Effective From
                    </label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Effective To (Optional)
                    </label>
                    <input
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--background)",
                        color: "var(--text)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Sticky Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                background: "var(--card)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                style={{
                  padding: "8px 16px",
                  background: "var(--background)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="pay-rule-form"
                disabled={saving}
                style={{
                  padding: "8px 18px",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving
                  ? "Saving…"
                  : editingRuleId
                    ? "Update Pay Rule"
                    : "Save Pay Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
