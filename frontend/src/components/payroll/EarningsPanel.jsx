import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Filter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Percent,
  HelpCircle,
  Users,
  Play,
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import Spinner from "../shared/Spinner";
import EmptyState from "../shared/EmptyState";
import {
  getPayrollComponentConfigs,
  createPayrollComponentConfig,
  updatePayrollComponentConfig,
  deletePayrollComponentConfig,
  runPayrollForSkillGroup,
  getWageRates,
  getEmployeeWages,
} from "../../services/payrollService";
import { getEmployees } from "../../services/employeeService";
import { basicMonthlyFor, monthlyGrossFor, isBasicKey, splitMonthlyPackage, employeeMonthlyGross, MONTHLY_GROSS_LABEL, isMonthlyGrossBase } from "../../utils/wageRates";

export default function EarningsPanel() {
  const toast = useToast();
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkillFilter, setSelectedSkillFilter] = useState("ALL");
  const [sortField, setSortField] = useState("priority");
  const [sortOrder, setSortOrder] = useState("asc");

  // Top Earnings Table Pagination (10 per page)
  const [earningsPage, setEarningsPage] = useState(1);
  const EARNINGS_PAGE_SIZE = 10;

  // Associated Employees Table State (Search, Dept Filter, Sort, Pagination 10 per page)
  const [empSearch, setEmpSearch] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState("ALL");
  // Statewise filter — auto-synced with the Wage Rates & Overrides state
  // selector (via hrms:wage-state-selected + localStorage) so switching to
  // e.g. Maharashtra there filters associated employees here dynamically.
  // "ALL" (== "All States (Default)") shows every state.
  const [empStateFilter, setEmpStateFilter] = useState(() => {
    try {
      const s = localStorage.getItem("hrms:selectedWageState") || "ALL";
      return s === "All States (Default)" ? "ALL" : s;
    } catch {
      return "ALL";
    }
  });
  const [empSortKey, setEmpSortKey] = useState("name");
  const [empSortDir, setEmpSortDir] = useState("asc");
  const [empPage, setEmpPage] = useState(1);
  const EMP_PAGE_SIZE = 10;

  // Envelope/auto-fit help: the Help button (right of Refresh) explains the
  // green/red/blue status dots and the envelope auto-fit behaviour inline —
  // no separate disclaimer popup is shown for over-drawn configs.
  const [showHelp, setShowHelp] = useState(false);
  // Monthly Cap (₹, optional): upper limit applied to a component's value
  // BEFORE the envelope fit (mirrors backend maxCap handling).
  const [maxCapValue, setMaxCapValue] = useState("");

  // Inline editing for Priority numeric field
  const [priorityEditingId, setPriorityEditingId] = useState(null);
  const [priorityValue, setPriorityValue] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Associated Employees — fully dynamic from wage rates & overrides
  const [employeesList, setEmployeesList] = useState([]);
  const [wageRates, setWageRates] = useState([]);
  const [wageMap, setWageMap] = useState({});
  const [runningTier, setRunningTier] = useState(null);
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState(new Date().getFullYear());

  // Form Fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [skillType, setSkillType] = useState("ALL");
  const [thresholdType, setThresholdType] = useState("fixed"); // "fixed" | "percentage"
  const [thresholdValue, setThresholdValue] = useState("");
  const [percentageFrom, setPercentageFrom] = useState("Monthly gross");
  const [priority, setPriority] = useState(1);

  const loadEarnings = async () => {
    setLoading(true);
    try {
      const [res, empRes, wageRes, empWageRes] = await Promise.all([
        getPayrollComponentConfigs().catch(() => ({ data: [] })),
        getEmployees().catch(() => ({ data: [] })),
        getWageRates().catch(() => ({ data: [] })),
        getEmployeeWages().catch(() => ({ data: [] })),
      ]);
      const serverComps = (res.data || []).filter(
        (c) => String(c.kind || "").toLowerCase() !== "deduction",
      );
      setEmployeesList(empRes.data || []);
      setWageRates(wageRes.data || []);
      const map = {};
      (empWageRes.data || []).forEach((w) => {
        map[w.employeeCode] = w;
        if (w.employeeId) map[w.employeeId] = w;
      });
      setWageMap(map);

      if (serverComps.length > 0) {
        // Map backend components to earnings UI format
        // Backend now returns priority and percentageFrom fields.
        // NOTE: backend stores percentage in `pct` (not `value`), and fixed
        // amounts in `value` (`maxCap` is only an upper cap, not the amount).
        // No static fallback — earnings are strictly whatever is fetched from
        // wage rates + overrides + component configs. A component with no
        // configured amount reads 0 instead of an invented default.
        const mapped = serverComps.map((c, idx) => {
          const calcType = c.calcType === "percentage" ? "percentage" : "fixed";
          const numOr = (...args) => {
            const fallback = args.pop();
            for (const v of args) {
              const n = Number(v);
              if (v !== null && v !== undefined && v !== "" && !Number.isNaN(n)) return n;
            }
            return fallback;
          };
          return {
            id: c.id,
            name: c.name,
            code: c.code || c.name.toUpperCase().replace(/\s+/g, "_"),
            skillType: c.applicableCategory || "ALL",
            thresholdType: calcType,
            thresholdValue:
              calcType === "percentage"
                ? numOr(c.pct, c.value, 0)
                : numOr(c.value, 0),
            percentageFrom: c.percentageFrom && !isMonthlyGrossBase(c.percentageFrom) ? c.percentageFrom : MONTHLY_GROSS_LABEL,
            maxCap: c.maxCap != null && c.maxCap !== "" ? Number(c.maxCap) : null,
            priority: c.priority ?? (idx + 1),
            isActive: c.isActive ?? true,
          };
        });
        setEarnings(mapped);
      } else {
        // No static data — empty until wage rates / overrides create components
        setEarnings([]);
      }
    } catch {
      setEarnings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEarnings();
  }, []);

  // Re-fetch when the tab regains focus / becomes visible so salary edits
  // made in EmployeeProfile (a different route) are reflected in gross
  // earnings without requiring a hard reload. Also refresh when wage rates
  // change (back-and-forth sync: wage edits update earnings + employees).
  // Plus auto-sync the statewise employee filter when the Wage Rates panel
  // state selector changes (e.g. switched to Maharashtra).
  useEffect(() => {
    const refresh = () => loadEarnings();
    const onWageState = (e) => {
      const s = e?.detail?.state || "ALL";
      setEmpStateFilter(s === "All States (Default)" ? "ALL" : s);
      setEmpPage(1);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("hrms:employees-changed", refresh);
    window.addEventListener("hrms:wage-rates-changed", refresh);
    window.addEventListener("hrms:wage-state-selected", onWageState);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadEarnings();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("hrms:employees-changed", refresh);
      window.removeEventListener("hrms:wage-rates-changed", refresh);
      window.removeEventListener("hrms:wage-state-selected", onWageState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName("");
    setCode("");
    setSkillType("ALL");
    setThresholdType("fixed");
    setThresholdValue("");
    setMaxCapValue("");
    setPercentageFrom("Monthly gross");
    setPriority(earnings.length + 1);
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    if (isBasicKey(item.code, item.name)) {
      toast("Basic wages are pulled from Wage Rates & overrides (skill/state-wise) and are non-editable.", "error");
      return;
    }
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setSkillType(item.skillType || "ALL");
    setThresholdType(item.thresholdType || "fixed");
    setThresholdValue(String(item.thresholdValue || ""));
    setMaxCapValue(item.maxCap != null && item.maxCap !== "" ? String(item.maxCap) : "");
    setPercentageFrom(item.percentageFrom || "Monthly gross");
    setPriority(item.priority || 1);
    setShowModal(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Please enter a component name", "error");
      return;
    }
    // Basic wages are system-driven (wage rates + overrides) — locked.
    if (isBasicKey(code, name) || (editingItem && isBasicKey(editingItem.code, editingItem.name))) {
      toast("Basic wages are pulled from Wage Rates & overrides (skill/state-wise) and are non-editable.", "error");
      return;
    }
    const val = parseFloat(thresholdValue);
    if (isNaN(val) || val < 0) {
      toast("Please enter a valid numeric threshold value", "error");
      return;
    }
    // Monthly Cap (optional upper limit applied before the envelope fit)
    const cap =
      maxCapValue.trim() !== "" && !Number.isNaN(parseFloat(maxCapValue))
        ? parseFloat(maxCapValue)
        : null;
    if (cap != null && cap < 0) {
      toast("Monthly cap must be a positive number", "error");
      return;
    }

    setSaving(true);
    const compCode = (
      code.trim() || name.toUpperCase().replace(/\s+/g, "_")
    ).replace(/[^A-Z0-9_]/g, "");
    const payload = {
      name: name.trim(),
      code: compCode,
      kind: "earning",
      calcType: thresholdType === "percentage" ? "percentage" : "fixed",
      applicableCategory: skillType,
      value: thresholdType === "percentage" ? null : val,
      pct: thresholdType === "percentage" ? val : null,
      maxCap: cap,
      sourceField: "ctc",
      percentageFrom: thresholdType === "percentage" ? percentageFrom : null,
      priority: Number(priority) || 1,
      isActive: true,
    };

    try {
      if (editingItem && !String(editingItem.id).startsWith("e-")) {
        await updatePayrollComponentConfig(editingItem.id, payload);

        // Optimistic update for edits (immediate UI feedback)
        const localEntry = {
          ...payload,
          skillType: skillType,
          thresholdValue: val,
          thresholdType,
          maxCap: cap,
          percentageFrom: thresholdType === "percentage" ? percentageFrom : "",
        };
        setEarnings((prev) =>
          prev.map((item) =>
            item.id === editingItem.id ? { ...item, ...localEntry } : item,
          ),
        );
      } else if (!editingItem) {
        // For new items: create then reload to get real server ID + priority
        await createPayrollComponentConfig(payload);
        await loadEarnings();
      }

      toast(`Earning component "${name}" saved successfully!`);
      setShowModal(false);
      try { window.dispatchEvent(new CustomEvent("hrms:payroll-components-changed")); } catch { /* ignore */ }
    } catch (err) {
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to save component",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, compName, compCode = "") => {
    if (isBasicKey(compCode, compName)) {
      toast("Basic wages are system-driven and non-deletable. Edit the Wage Rate instead.", "error");
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to remove "${compName}" from earnings?`,
      )
    )
      return;
    try {
      if (!String(id).startsWith("e-")) {
        await deletePayrollComponentConfig(id);
      }
      setEarnings((prev) => prev.filter((item) => item.id !== id));
      toast(`Removed "${compName}"`);
      try { window.dispatchEvent(new CustomEvent("hrms:payroll-components-changed")); } catch { /* ignore */ }
    } catch (err) {
      toast(
        err.response?.data?.message ||
          err.message ||
          "Failed to remove component",
        "error",
      );
    }
  };

  const handleSavePriority = async (id, newPriority) => {
    const target = earnings.find((e) => e.id === id);
    if (target && isBasicKey(target.code, target.name)) {
      toast("Basic wages are wage-driven and non-editable.", "error");
      setPriorityEditingId(null);
      return;
    }
    const num = parseInt(newPriority, 10);
    if (isNaN(num) || num < 1) {
      toast("Priority must be a positive integer", "error");
      return;
    }
    try {
      if (!String(id).startsWith("e-")) {
        await updatePayrollComponentConfig(id, { priority: num });
      }
      setEarnings((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, priority: num } : item,
        ),
      );
      setPriorityEditingId(null);
      toast(`Updated priority to #${num}`);
      try { window.dispatchEvent(new CustomEvent("hrms:payroll-components-changed")); } catch { /* ignore */ }
    } catch {
      toast("Could not update priority", "error");
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field)
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortOrder === "asc" ? (
      <ArrowUp size={12} style={{ color: "var(--primary)" }} />
    ) : (
      <ArrowDown size={12} style={{ color: "var(--primary)" }} />
    );
  };

  // Existing earning components available for "Percentage From" select.
  // Single dynamic base first: the employee's Monthly gross (₹).
  const existingComponentOptions = useMemo(() => {
    const names = earnings.map((e) => e.name).filter((n) => n !== name);
    const legacy = new Set(["Basic Salary", "Gross Pay", "Basic + DA", "Gross Wages", "Basic"]);
    return [
      MONTHLY_GROSS_LABEL,
      ...names.filter((n) => !legacy.has(n)),
    ];
  }, [earnings, name]);

  // Filter & Sort
  const processedEarnings = useMemo(() => {
    let list = [...earnings];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const n = item.name.toLowerCase();
        const c = item.code.toLowerCase();
        const sk = (item.skillType || "").toLowerCase();
        return n.includes(q) || c.includes(q) || sk.includes(q);
      });
    }

    if (selectedSkillFilter !== "ALL") {
      const normFilter = selectedSkillFilter.toLowerCase().replace(/[^a-z]/g, "");
      list = list.filter((item) => {
        const normItem = (item.skillType || "ALL").toLowerCase().replace(/[^a-z]/g, "");
        return normItem === "all" || normItem === normFilter;
      });
    }

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === "priority") {
        valA = Number(a.priority || 999);
        valB = Number(b.priority || 999);
      } else if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "skillType") {
        valA = (a.skillType || "").toLowerCase();
        valB = (b.skillType || "").toLowerCase();
      } else if (sortField === "thresholdValue") {
        valA = Number(a.thresholdValue || 0);
        valB = Number(b.thresholdValue || 0);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [earnings, searchQuery, selectedSkillFilter, sortField, sortOrder]);

  // Top Earnings Table pagination (10 per page)
  const earningsPageCount = Math.max(1, Math.ceil(processedEarnings.length / EARNINGS_PAGE_SIZE));
  const safeEarningsPage = Math.min(Math.max(1, earningsPage), earningsPageCount);
  const pagedEarnings = useMemo(() => {
    return processedEarnings.slice((safeEarningsPage - 1) * EARNINGS_PAGE_SIZE, safeEarningsPage * EARNINGS_PAGE_SIZE);
  }, [processedEarnings, safeEarningsPage]);

  // Active Earning Components (sorted by priority)
  const activeEarningComponents = useMemo(() => {
    const list = earnings.filter((e) => e.isActive !== false);
    list.sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
    return list;
  }, [earnings]);

  // Doctrine: monthly salary (base pay) = Basic (locked state/skill minimum
  // wage) + allowances; gross earnings === monthly salary, always.
  // E.g. monthly ₹40,000, state minimum ₹22,000 → basic ₹22,000 and the
  // ₹18,000 remainder is divided into the allowance components. Basic is
  // FIXED (never a residual); allowances scale to fit the remainder.
  const isBasicComponent = (c) => isBasicKey(c?.code, c?.name);
  const isEligibleForEmployee = (emp, c, applicableEarningCodes, hasAllowanceFilter, { bypassSkillForBasic = true } = {}) => {
    if (c?.isActive === false) return false;
    if (bypassSkillForBasic && isBasicComponent(c)) {
      return true;
    }
    const empSkill = (emp.skillType || "Skilled").toLowerCase().replace(/[^a-z]/g, "");
    const compSkill = (c.skillType || c.applicableCategory || "ALL").toLowerCase().replace(/[^a-z]/g, "");
    const skillOk = compSkill === "all" || compSkill === empSkill;
    if (!skillOk) return false;
    if (!hasAllowanceFilter) return true;
    return applicableEarningCodes.some(
      (code) =>
        code?.toUpperCase?.() === c.code?.toUpperCase?.() ||
        code?.toUpperCase?.() === c.name?.toUpperCase?.().replace(/\s+/g, "_"),
    );
  };
  const getApplicableCodes = (emp) => {
    const codes =
      emp.wizardData?.payRules?.earnings || emp.payRules?.earnings || [];
    const hasFilter = Array.isArray(codes) && codes.length > 0;
    return { codes, hasFilter };
  };
  const isPctFromGross = (c) => {
    const src = String(c?.percentageFrom || c?.sourceField || "basic").toLowerCase();
    return src.includes("gross") || src.includes("ctc") || src === "gross pay";
  };
  // Per-employee package: Basic locked to the statutory wage; the remainder
  // (monthly − basic) is divided into allowances so
  // basic + allowances === monthly salary === gross, always.
  const packageForEmployee = (emp, allActiveComps) => {
    const comps = (allActiveComps || activeEarningComponents).filter((c) => c.isActive !== false);
    const { codes: applicableEarningCodes, hasFilter: hasAllowanceFilter } = getApplicableCodes(emp);
    const eligible = comps.filter((c) =>
      isEligibleForEmployee(emp, c, applicableEarningCodes, hasAllowanceFilter, { bypassSkillForBasic: false }),
    );
    const { basicMonthly: statutoryBasic, source, isOverride, dailyRate } = basicMonthlyFor(emp, wageRates);
    const storedMonthly = Math.round((Number(emp.annualSalary) || 0) / 12);
    const isDailyEmp =
      String(emp.salaryType || "").trim().toLowerCase() === "daily" ||
      (Number(emp.dailyWageRate) > 0 && !Number(emp.annualSalary));
    const serverWage = wageMap[emp.employeeCode] || wageMap[emp.id];
    const nonBasic = eligible.filter((c) => !isBasicComponent(c));
    // No employee-defined monthly (monthly staff without a package): there is
    // NO monthly to split — never invent one from wages. Basic (the wage-rate
    // monthly rate) still shows; allowances are 0 until a package is set.
    if ((serverWage && serverWage.monthlyGross == null) || (!serverWage && !isDailyEmp && storedMonthly <= 0)) {
      return {
        basic: serverWage?.basicMonthly ?? statutoryBasic, gross: null, amounts: {},
        eligible, nonBasic,
        statutoryBasic, monthlySalary: null, allowanceRemainder: 0,
        nonCompliant: true, needsPackage: true,
        source: serverWage?.wageSource || source,
        isOverride: serverWage?.isOverride ?? isOverride,
        dailyRate: serverWage?.dailyRate ?? dailyRate,
      };
    }
    // Fixed and percentage parts must respect maxCap (>0) — mirrors backend
    // getEmployeeWages capping so threshold/formula is honoured exactly.
    const capWeight = (comp, raw) => {
      const cap = comp.maxCap != null && Number(comp.maxCap) > 0 ? Math.round(Number(comp.maxCap)) : null;
      if (cap != null && raw > cap) return cap;
      return raw;
    };
    const fixedWeights = nonBasic
      .filter((c) => c.thresholdType !== "percentage")
      .map((c) => ({ key: String(c.code || c.name), weight: capWeight(c, Math.round(Number(c.thresholdValue || 0) || 0)) }));
    const basicPctParts = nonBasic
      .filter((c) => c.thresholdType === "percentage" && !isPctFromGross(c))
      .map((c) => ({ key: String(c.code || c.name), amount: capWeight(c, Math.round((statutoryBasic * Number(c.thresholdValue || 0)) / 100)) }));
    // %‑of‑gross parts are computed from the monthly envelope (known upfront
    // since gross === monthly by doctrine — no circularity).
    const envelopeForPct = storedMonthly > 0 ? storedMonthly : monthlyGrossFor(emp, eligible, wageRates).monthlyGross;
    const grossPctParts = nonBasic
      .filter((c) => c.thresholdType === "percentage" && isPctFromGross(c))
      .map((c) => ({ key: String(c.code || c.name), amount: capWeight(c, Math.round((envelopeForPct * Number(c.thresholdValue || 0)) / 100)) }));
    const otherComp = nonBasic.find((c) => /other/i.test(String(c.code || c.name)));
    const split = splitMonthlyPackage({
      target: storedMonthly > 0 ? storedMonthly : envelopeForPct,
      basic: statutoryBasic,
      fixedWeights,
      basicPctParts,
      grossPctParts,
      otherKey: otherComp ? String(otherComp.code || otherComp.name) : "otherAllowances",
    });
    // Server join wins for basic/gross (single source of truth); re-split the
    // local allowance weights around the server figures so the row still sums
    // exactly to basic + allowances === monthly === gross.
    if (serverWage && (serverWage.basicMonthly !== split.basic || serverWage.monthlyGross !== split.gross)) {
      const sBasic = serverWage.basicMonthly ?? split.basic;
      const sGross = serverWage.monthlyGross ?? split.gross;
      const capWeightFor = (comp, raw) => {
        const cap = comp.maxCap != null && Number(comp.maxCap) > 0 ? Math.round(Number(comp.maxCap)) : null;
        if (cap != null && raw > cap) return cap;
        return raw;
      };
      const sBasicPct = nonBasic
        .filter((c) => c.thresholdType === "percentage" && !isPctFromGross(c))
        .map((c) => ({ key: String(c.code || c.name), amount: capWeightFor(c, Math.round((sBasic * Number(c.thresholdValue || 0)) / 100)) }));
      const sGrossPct = nonBasic
        .filter((c) => c.thresholdType === "percentage" && isPctFromGross(c))
        .map((c) => ({ key: String(c.code || c.name), amount: capWeightFor(c, Math.round((sGross * Number(c.thresholdValue || 0)) / 100)) }));
      const re = splitMonthlyPackage({
        target: sGross, basic: sBasic, fixedWeights,
        basicPctParts: sBasicPct, grossPctParts: sGrossPct,
        otherKey: otherComp ? String(otherComp.code || otherComp.name) : "otherAllowances",
      });
      return {
        basic: re.basic, gross: re.gross, amounts: re.amounts,
        eligible, nonBasic,
        statutoryBasic, monthlySalary: re.gross,
        allowanceRemainder: Math.max(re.gross - re.basic, 0),
        nonCompliant: serverWage.nonCompliant ?? re.nonCompliant,
        source: serverWage.wageSource || source,
        isOverride: serverWage.isOverride ?? isOverride,
        dailyRate: serverWage.dailyRate ?? dailyRate,
      };
    }
    return {
      basic: split.basic, gross: split.gross, amounts: split.amounts,
      eligible, nonBasic,
      statutoryBasic, monthlySalary: split.gross,
      allowanceRemainder: Math.max(split.gross - split.basic, 0),
      nonCompliant: serverWage?.nonCompliant ?? split.nonCompliant,
      source: serverWage?.wageSource || source,
      isOverride: serverWage?.isOverride ?? isOverride,
      dailyRate: serverWage?.dailyRate ?? dailyRate,
    };
  };
  // Configured (pre-envelope) value of a NON-BASIC component for an employee:
  // fixed = amount capped by maxCap; percentage = % of the dynamic base
  // (Monthly gross, or one level of a referenced component), also capped by
  // maxCap — mirroring the backend's maxCap handling. Used as the weight for
  // the envelope fit below and for the excess disclaimer.
  const capAmount = (comp, amt) => {
    let v = Math.max(Math.round(amt), 0);
    if (comp.maxCap != null && Number(comp.maxCap) > 0 && v > Math.round(Number(comp.maxCap))) {
      v = Math.round(Number(comp.maxCap));
    }
    return v;
  };
  const configuredComponentValue = (emp, comp, allActiveComps) => {
    const { codes: applicableEarningCodes, hasFilter: hasAllowanceFilter } = getApplicableCodes(emp);
    if (!isEligibleForEmployee(emp, comp, applicableEarningCodes, hasAllowanceFilter)) return 0;
    // Single dynamic base: employee Monthly gross (₹). Fixed = cap value,
    // percentage = % of Monthly gross (legacy Basic/Gross bases map here too).
    const monthlyBase = employeeMonthlyGross(emp);
    if (comp.thresholdType === "percentage") {
      const from = String(comp.percentageFrom || MONTHLY_GROSS_LABEL);
      if (!isMonthlyGrossBase(from)) {
        // % of another named component (one level, then Monthly gross fallback).
        const ref = (allActiveComps || activeEarningComponents).find(
          (c) => String(c.name).toLowerCase() === from.toLowerCase() || String(c.code).toLowerCase() === from.toLowerCase()
        );
        if (ref && ref !== comp) {
          if (ref.thresholdType === "percentage") {
            if (monthlyBase == null) return 0;
            return capAmount(comp, (monthlyBase * Number(ref.thresholdValue || 0) * Number(comp.thresholdValue || 0)) / 10000);
          }
          return capAmount(comp, (Number(ref.thresholdValue || 0) * Number(comp.thresholdValue || 0)) / 100);
        }
      }
      if (monthlyBase == null) return 0;
      return capAmount(comp, (monthlyBase * Number(comp.thresholdValue || 0)) / 100);
    }

    // Fixed amount (already confirmed eligible above), capped by maxCap
    return capAmount(comp, Number(comp.thresholdValue || 0));
  };

  // Rupee-exact largest-remainder scale — now mirrors backend splitMonthlyPackage:
  // only scales DOWN when configured > envelope (over-drawn). When configured <=
  // envelope the threshold/formula values are returned verbatim (no inflation)
  // so the Associated Employees table shows exactly what was configured
  // (₹2,500 stays ₹2,500, 5% of Monthly gross stays 5% etc.). Remainder, if any,
  // is implicitly otherAllowances (not shown) — matching backend's otherKey logic.
  const scaleToEnvelope = (parts, envelope) => {
    const out = new Map();
    if (envelope == null || envelope <= 0 || parts.length === 0) {
      parts.forEach((p) => out.set(p.comp.id, 0));
      return out;
    }
    const total = parts.reduce((s, p) => s + p.configured, 0);
    if (total <= envelope) {
      // Fit: return configured verbatim — thresholds are honoured exactly.
      parts.forEach((p) => out.set(p.comp.id, p.configured));
      return out;
    }
    if (total <= 0) {
      parts.forEach((p) => out.set(p.comp.id, 0));
      return out;
    }
    // Over-drawn: scale down pro-rata rupee-exact so Σ == envelope.
    const factor = envelope / total;
    const floored = parts.map((p) => {
      const raw = p.configured * factor;
      return { id: p.comp.id, base: Math.floor(raw), frac: raw - Math.floor(raw) };
    });
    let assigned = floored.reduce((s, f) => s + f.base, 0);
    let left = envelope - assigned;
    floored.sort((a, b) => b.frac - a.frac);
    let i = 0;
    while (left > 0 && floored.length > 0) {
      floored[i % floored.length].base += 1;
      left -= 1;
      i += 1;
    }
    floored.forEach((f) => out.set(f.id, f.base));
    return out;
  };

  /**
   * Per-employee earnings breakdown — thresholds honoured exactly:
   *   - Basic is wage-driven (daily × 26 from wage rates / override, never static)
   *   - Each non-basic component's value = threshold/formula capped by maxCap
   *     (fixed = ₹threshold capped, percentage = % of Monthly gross capped)
   *   - If Σ(configured) fits the envelope (monthly − basic), values are shown
   *     verbatim so ₹2,500 stays ₹2,500 and 5% shows 5% (matches the Threshold
   *     column). If Σ exceeds the envelope, values are scaled down pro-rata
   *     rupee-exact so gross never exceeds monthly gross.
   *   - monthly < basic → allowances 0, gross = basic (flagged)
   *   - no package (monthly null) → values shown as configured
   */
  const employeeEarningsBreakdown = (emp, allActiveComps) => {
    const comps = (allActiveComps || activeEarningComponents).filter((c) => c.isActive !== false);
    const basic = packageForEmployee(emp, comps).basic;
    const mg = employeeMonthlyGross(emp);
    const envelope = mg != null ? Math.max(mg - basic, 0) : null;
    const parts = comps
      .filter((c) => !isBasicComponent(c))
      .map((comp) => ({ comp, configured: configuredComponentValue(emp, comp, comps) }));
    const configuredTotal = parts.reduce((s, p) => s + p.configured, 0);
    const values =
      mg == null
        ? new Map(parts.map((p) => [p.comp.id, p.configured]))
        : scaleToEnvelope(parts, envelope);
    const displayedSum = Array.from(values.values()).reduce((s, v) => s + v, 0);
    const grossEarnings = mg == null ? basic + configuredTotal : mg < basic ? basic : basic + displayedSum;
    return {
      basic,
      mg,
      envelope,
      parts,
      values,
      configuredTotal,
      grossEarnings,
      excess: mg != null && mg >= basic ? Math.max(configuredTotal - envelope, 0) : 0,
    };
  };

  const calculateEmployeeComponent = (emp, comp, allActiveComps) => {
    // Basic stays wage-driven (locked component value); every other
    // component is envelope-fitted so Σ(all) === Monthly gross always.
    if (isBasicComponent(comp)) return packageForEmployee(emp, allActiveComps).basic;
    return employeeEarningsBreakdown(emp, allActiveComps).values.get(comp.id) ?? 0;
  };

  // Associated employees dynamic filtering & sorting
  const dynamicDepartments = useMemo(() => {
    const depts = new Set();
    employeesList.forEach((e) => {
      const d = e.department?.name || e.department;
      if (d && d.trim()) depts.add(d.trim());
    });
    return Array.from(depts);
  }, [employeesList]);

  // Resolve an employee's state for statewise filtering: profile state first,
  // then the joined wage row (backend falls back to location name), then the
  // employee's location name. Empty string when unknown.
  const empStateOf = (e) => {
    const serverWage = wageMap[e.employeeCode] || wageMap[e.id];
    const s =
      e.state ||
      serverWage?.state ||
      e.location?.name ||
      (typeof e.location === "string" ? e.location : "");
    return String(s || "").trim();
  };

  const dynamicEmpStates = useMemo(() => {
    const set = new Set();
    employeesList.forEach((e) => {
      const s = empStateOf(e);
      if (s) set.add(s);
    });
    if (empStateFilter !== "ALL" && empStateFilter) set.add(empStateFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesList, wageMap, empStateFilter]);

  const processedAssociatedEmployees = useMemo(() => {
    let list = [...employeesList];

    // Statewise filter — mirrors the Wage Rates & Overrides state selector.
    // Basic wage (= wage monthly rate, daily × 26, skill/state-wise) resolves
    // per-employee via basicMonthlyFor/wageMap, so filtering here surfaces
    // exactly the employees whose Basic follows the selected state's scale.
    if (empStateFilter !== "ALL") {
      const normFilter = empStateFilter.trim().toLowerCase();
      list = list.filter((e) => empStateOf(e).toLowerCase() === normFilter);
    }

    // Skill Filter
    if (selectedSkillFilter !== "ALL") {
      const normFilter = selectedSkillFilter
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      list = list.filter((e) => {
        const normEmp = (e.skillType || "Skilled")
          .toLowerCase()
          .replace(/[^a-z]/g, "");
        return normEmp === normFilter;
      });
    }

    // Department Filter
    if (empDeptFilter !== "ALL") {
      list = list.filter((e) => {
        const d = e.department?.name || e.department || "";
        return d.toLowerCase() === empDeptFilter.toLowerCase();
      });
    }

    // Search Filter
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase().trim();
      list = list.filter((e) => {
        const name = `${e.firstName || ""} ${e.lastName || ""}`.toLowerCase();
        const code = (e.employeeCode || e.id || "").toLowerCase();
        const desig = (e.designation?.title || e.designation || "").toLowerCase();
        const dept = (e.department?.name || e.department || "").toLowerCase();
        return name.includes(q) || code.includes(q) || desig.includes(q) || dept.includes(q);
      });
    }

    // Sorting
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (empSortKey === "name") {
        valA = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
        valB = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase();
      } else if (empSortKey === "code") {
        valA = (a.employeeCode || a.id || "").toLowerCase();
        valB = (b.employeeCode || b.id || "").toLowerCase();
      } else if (empSortKey === "skill") {
        valA = (a.skillType || "").toLowerCase();
        valB = (b.skillType || "").toLowerCase();
      } else if (empSortKey === "rate") {
        // Monthly gross (₹) from the employee — dynamic, nulls sort last.
        const mA = employeeMonthlyGross(a);
        const mB = employeeMonthlyGross(b);
        valA = mA == null ? -1 : mA;
        valB = mB == null ? -1 : mB;
      } else if (empSortKey.startsWith("comp_")) {
        const compId = empSortKey.replace("comp_", "");
        const targetComp = activeEarningComponents.find((c) => String(c.id) === compId);
        if (targetComp) {
          valA = calculateEmployeeComponent(a, targetComp, activeEarningComponents);
          valB = calculateEmployeeComponent(b, targetComp, activeEarningComponents);
        }
      }

      if (valA < valB) return empSortDir === "asc" ? -1 : 1;
      if (valA > valB) return empSortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employeesList,
    selectedSkillFilter,
    empDeptFilter,
    empStateFilter,
    empSearch,
    empSortKey,
    empSortDir,
    activeEarningComponents,
    wageRates,
    wageMap,
  ]);

  const empPageCount = Math.max(1, Math.ceil(processedAssociatedEmployees.length / EMP_PAGE_SIZE));
  const safeEmpPage = Math.min(Math.max(1, empPage), empPageCount);
  const pagedAssociatedEmployees = useMemo(() => {
    return processedAssociatedEmployees.slice(
      (safeEmpPage - 1) * EMP_PAGE_SIZE,
      safeEmpPage * EMP_PAGE_SIZE,
    );
  }, [processedAssociatedEmployees, safeEmpPage]);

  const handleEmpSort = (key) => {
    if (empSortKey === key) {
      setEmpSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setEmpSortKey(key);
      setEmpSortDir("asc");
    }
  };

  const renderEmpSortIcon = (key) => {
    if (empSortKey !== key)
      return <ArrowUpDown size={11} style={{ opacity: 0.35, marginLeft: "4px" }} />;
    return empSortDir === "asc" ? (
      <ArrowUp size={11} style={{ color: "var(--primary)", marginLeft: "4px" }} />
    ) : (
      <ArrowDown size={11} style={{ color: "var(--primary)", marginLeft: "4px" }} />
    );
  };

  const handleRunTierPayroll = async (tier) => {
    setRunningTier(tier);
    try {
      const res = await runPayrollForSkillGroup({
        skillType: tier,
        month: runMonth,
        year: runYear,
      });
      const count = res.data?.processedCount ?? 0;
      const periodLabel = `${runMonth}/${runYear}`;
      toast(
        `Successfully processed payroll for ${tier === "ALL" ? "All Tiers Combined" : tier} (${count} workers, Period ${periodLabel})!`,
      );
    } catch (err) {
      toast(
        err.response?.data?.message || err.message || "Failed to run payroll",
        "error",
      );
    } finally {
      setRunningTier(null);
    }
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
      {/* Header Banner */}
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
            <TrendingUp size={20} style={{ color: "var(--primary)" }} />
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Earnings
            </h2>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--subtext)",
              margin: 0,
              maxWidth: "780px",
            }}
          >
            Earning allowances with fixed caps and percentages of the employee's Monthly gross (₹), plus numeric calculation priorities.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={handleOpenAdd}
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
              transition: "all 0.15s ease",
            }}
          >
            <Plus size={15} /> Add Earning Component
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
          padding: "10px 14px",
          background: "var(--background)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{ position: "relative", flex: "1 1 240px", minWidth: "200px" }}
        >
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--subtext)",
            }}
          />
          <input
            type="text"
            placeholder="Search component name, code, skill…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              height: "34px",
              paddingLeft: "32px",
              paddingRight: "10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              background: "var(--card)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={13} style={{ color: "var(--subtext)" }} />
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--subtext)",
            }}
          >
            Skill Tier:
          </span>
          <select
            value={selectedSkillFilter}
            onChange={(e) => setSelectedSkillFilter(e.target.value)}
            style={{
              height: "34px",
              padding: "0 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--card)",
              color: "var(--text)",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="ALL">All Categories</option>
            <option value="Skilled">Skilled</option>
            <option value="Semi-Skilled">Semi-Skilled</option>
            <option value="Unskilled">Unskilled</option>
          </select>
        </div>

        {(searchQuery || selectedSkillFilter !== "ALL") && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedSkillFilter("ALL");
            }}
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: "var(--primary)",
              border: "1px solid var(--primary-light)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : processedEarnings.length === 0 ? (
        <EmptyState
          title="No earning components found"
          subtitle="Click 'Add Earning Component' to configure allowance rules."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--background)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th
                  onClick={() => handleSort("priority")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "110px",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Priority {renderSortIcon("priority")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("name")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Component Name {renderSortIcon("name")}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("skillType")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Skill Tier {renderSortIcon("skillType")}
                  </div>
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Threshold Type
                </th>
                <th
                  onClick={() => handleSort("thresholdValue")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--primary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    userSelect: "none",
                    background: "rgba(99, 102, 241, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Threshold / Formula {renderSortIcon("thresholdValue")}
                  </div>
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--subtext)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedEarnings.map((item, idx) => {
                const isFixed = item.thresholdType === "fixed";
                const isEditingPriority = priorityEditingId === item.id;

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom:
                        idx < pagedEarnings.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    {/* Priority Numeric Field */}
                    <td style={{ padding: "14px 16px" }}>
                      {isEditingPriority ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <input
                            type="number"
                            value={priorityValue}
                            onChange={(e) => setPriorityValue(e.target.value)}
                            autoFocus
                            style={{
                              width: "45px",
                              height: "28px",
                              padding: "0 4px",
                              fontSize: "12.5px",
                              fontWeight: 700,
                              border: "2px solid var(--primary)",
                              borderRadius: "var(--radius-sm)",
                            }}
                          />
                          <button
                            onClick={() =>
                              handleSavePriority(item.id, priorityValue)
                            }
                            style={{
                              background: "var(--green)",
                              color: "#fff",
                              border: "none",
                              borderRadius: "3px",
                              padding: "4px",
                              cursor: "pointer",
                            }}
                          >
                            <Check size={11} />
                          </button>
                        </div>
                      ) : (
                        <span
                          onClick={() => {
                            setPriorityEditingId(item.id);
                            setPriorityValue(String(item.priority || idx + 1));
                          }}
                          title="Click to edit priority"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "28px",
                            height: "28px",
                            borderRadius: "6px",
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            fontWeight: 800,
                            fontFamily: "monospace",
                            fontSize: "13px",
                            color: "var(--text)",
                            cursor: "pointer",
                          }}
                        >
                          #{item.priority}
                        </span>
                      )}
                    </td>

                    {/* Component Name — NO code subheader */}
                    <td style={{ padding: "14px 16px" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text)",
                          fontSize: "13.5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {item.name}
                        {isBasicKey(item.code, item.name) && (
                          <span
                            title="Basic wages are pulled from Wage Rates & overrides (skill/state-wise) — non-editable"
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(99,102,241,0.1)",
                              color: "var(--primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <Lock size={9} /> Wage-driven
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Skill Tier */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "99px",
                          background:
                            item.skillType === "Skilled"
                              ? "#ecfdf5"
                              : item.skillType === "Semi-Skilled"
                                ? "#eff6ff"
                                : "#fef3c7",
                          color:
                            item.skillType === "Skilled"
                              ? "#059669"
                              : item.skillType === "Semi-Skilled"
                                ? "#2563eb"
                                : "#d97706",
                          border: `1px solid ${item.skillType === "Skilled" ? "#a7f3d0" : item.skillType === "Semi-Skilled" ? "#bfdbfe" : "#fde68a"}`,
                        }}
                      >
                        {item.skillType || "ALL"}
                      </span>
                    </td>

                    {/* Threshold Type Badge */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: isFixed
                            ? "rgba(99, 102, 241, 0.1)"
                            : "rgba(16, 185, 129, 0.1)",
                          color: isFixed ? "var(--primary)" : "#059669",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {isFixed ? (
                          <span style={{ fontSize: "11px", fontWeight: 800 }}>₹</span>
                        ) : (
                          <Percent size={11} />
                        )}
                        {isFixed ? "Fixed Amount (Cap)" : "Percentage (%)"}
                      </span>
                    </td>

                    {/* Threshold Details / Formula — Basic is the wage-rate
                        monthly rate (non-editable), never a fixed amount here */}
                    <td
                      style={{
                        padding: "14px 16px",
                        background: "rgba(99, 102, 241, 0.02)",
                      }}
                    >
                      {isBasicKey(item.code, item.name) ? (
                        <div title="Basic wage = wage-rate monthly rate (daily × 26, skill/state-wise) — non-editable">
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 800,
                              color: "var(--primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Lock size={11} /> From Wage Rates
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              color: "var(--subtext)",
                              marginLeft: "4px",
                            }}
                          >
                            (daily × 26 · skill/state-wise)
                          </span>
                        </div>
                      ) : isFixed ? (
                        <div>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 800,
                              color: "var(--text)",
                              fontFamily: "monospace",
                            }}
                          >
                            ₹
                            {Number(item.thresholdValue || 0).toLocaleString(
                              "en-IN",
                            )}
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              color: "var(--subtext)",
                              marginLeft: "4px",
                            }}
                          >
                            {item.maxCap != null &&
                            Number(item.maxCap) !==
                              Number(item.thresholdValue || 0)
                              ? `(value · cap ₹${Number(item.maxCap).toLocaleString("en-IN")})`
                              : "(Monthly Cap)"}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 800,
                              color: "#059669",
                              fontFamily: "monospace",
                            }}
                          >
                            {item.thresholdValue}%
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--subtext)",
                              marginLeft: "4px",
                            }}
                          >
                            of {item.percentageFrom || "Monthly gross"}
                            {item.maxCap != null
                              ? ` · cap ₹${Number(item.maxCap).toLocaleString("en-IN")}`
                              : " (Maximum)"}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "99px",
                          background: "#f0fdf4",
                          color: "#16a34a",
                        }}
                      >
                        Active
                      </span>
                    </td>

                    {/* Actions — Basic is wage-driven (non-editable/non-deletable) */}
                    <td style={{ padding: "14px 16px" }}>
                      {isBasicKey(item.code, item.name) ? (
                        <span style={{ fontSize: "11px", color: "var(--subtext)", fontStyle: "italic", display: "flex", alignItems: "center", gap: "4px" }} title="Basic wages are pulled from Wage Rates & overrides (skill/state-wise)">
                          <Lock size={11} /> Wage-driven · non-editable
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <button
                            onClick={() => handleOpenEdit(item)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "5px 10px",
                              background: "var(--primary-light)",
                              color: "var(--primary)",
                              border: "1px solid var(--primary)",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            <Edit3 size={12} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name, item.code)}
                            style={{
                              padding: "5px 7px",
                              background: "transparent",
                              color: "var(--red)",
                              border: "none",
                              cursor: "pointer",
                              opacity: 0.7,
                            }}
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
          {processedEarnings.length > EARNINGS_PAGE_SIZE && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--background)",
                fontSize: "12.5px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <span style={{ color: "var(--subtext)" }}>
                Showing{" "}
                <b style={{ color: "var(--text)" }}>
                  {(safeEarningsPage - 1) * EARNINGS_PAGE_SIZE + 1}
                </b>
                –
                <b style={{ color: "var(--text)" }}>
                  {Math.min(processedEarnings.length, safeEarningsPage * EARNINGS_PAGE_SIZE)}
                </b>{" "}
                of <b style={{ color: "var(--text)" }}>{processedEarnings.length}</b> components
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => setEarningsPage((p) => Math.max(1, p - 1))}
                  disabled={safeEarningsPage <= 1}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: safeEarningsPage <= 1 ? "transparent" : "var(--card)",
                    color: safeEarningsPage <= 1 ? "var(--subtext)" : "var(--text)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: safeEarningsPage <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>

                {Array.from({ length: earningsPageCount }, (_, i) => i + 1).map((pNum) => (
                  <button
                    key={pNum}
                    onClick={() => setEarningsPage(pNum)}
                    style={{
                      minWidth: "26px",
                      height: "26px",
                      padding: "0 6px",
                      borderRadius: "var(--radius-sm)",
                      border: pNum === safeEarningsPage ? "1px solid var(--primary)" : "1px solid var(--border)",
                      background: pNum === safeEarningsPage ? "var(--primary)" : "var(--card)",
                      color: pNum === safeEarningsPage ? "#fff" : "var(--text)",
                      fontSize: "12px",
                      fontWeight: pNum === safeEarningsPage ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {pNum}
                  </button>
                ))}

                <button
                  onClick={() => setEarningsPage((p) => Math.min(earningsPageCount, p + 1))}
                  disabled={safeEarningsPage >= earningsPageCount}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: safeEarningsPage >= earningsPageCount ? "transparent" : "var(--card)",
                    color: safeEarningsPage >= earningsPageCount ? "var(--subtext)" : "var(--text)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: safeEarningsPage >= earningsPageCount ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Earning Component Modal */}
      {showModal && (
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
              maxWidth: "500px",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
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
                  {editingItem
                    ? "Edit Earning Component"
                    : "Add Earning Component"}
                </h3>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--subtext)",
                    margin: "4px 0 0",
                  }}
                >
                  Define component parameters, skill tier, threshold rules, and
                  calculation priority.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--subtext)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form
              id="earning-form"
              onSubmit={handleSaveModal}
              style={{
                padding: "20px 24px",
                overflowY: "auto",
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
                  placeholder="e.g. Special Allowance or House Rent Allowance"
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
                    Skill Tier *
                  </label>
                  <select
                    value={skillType}
                    onChange={(e) => setSkillType(e.target.value)}
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
                    Numeric Priority *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    required
                    placeholder="e.g. 1, 2, 3…"
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
                  <span style={{ fontSize: "11px", color: "var(--subtext)" }}>
                    Defines execution order (lower numbers calculate first).
                  </span>
                </div>
              </div>

              {/* Threshold Configuration (2 Options: Fixed vs Percentage) */}
              <div
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "14px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: "8px",
                  }}
                >
                  Threshold Mode *
                </label>
                <div
                  style={{ display: "flex", gap: "16px", marginBottom: "12px" }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      color:
                        thresholdType === "fixed"
                          ? "var(--primary)"
                          : "var(--text)",
                    }}
                  >
                    <input
                      type="radio"
                      name="thresholdType"
                      value="fixed"
                      checked={thresholdType === "fixed"}
                      onChange={() => setThresholdType("fixed")}
                    />
                    Option 1: Fixed Amount (Cap)
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      color:
                        thresholdType === "percentage"
                          ? "var(--primary)"
                          : "var(--text)",
                    }}
                  >
                    <input
                      type="radio"
                      name="thresholdType"
                      value="percentage"
                      checked={thresholdType === "percentage"}
                      onChange={() => setThresholdType("percentage")}
                    />
                    Option 2: Percentage (%)
                  </label>
                </div>

                {thresholdType === "fixed" ? (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--text)",
                        marginBottom: "4px",
                      }}
                    >
                      Fixed Amount Cap (₹) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 15000"
                      value={thresholdValue}
                      onChange={(e) => setThresholdValue(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        height: "36px",
                        padding: "0 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--card)",
                        color: "var(--text)",
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--subtext)" }}>
                      Absolute maximum amount payable for this allowance.
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text)",
                          marginBottom: "4px",
                        }}
                      >
                        Percentage % (Acts as Maximum) *
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={thresholdValue}
                        onChange={(e) => setThresholdValue(e.target.value)}
                        required
                        style={{
                          width: "100%",
                          height: "36px",
                          padding: "0 10px",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--card)",
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
                          fontWeight: 600,
                          color: "var(--text)",
                          marginBottom: "4px",
                        }}
                      >
                        Percentage Calculated From *
                      </label>
                      <select
                        value={percentageFrom}
                        onChange={(e) => setPercentageFrom(e.target.value)}
                        style={{
                          width: "100%",
                          height: "36px",
                          padding: "0 10px",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--card)",
                          color: "var(--text)",
                          fontSize: "13px",
                        }}
                      >
                        {existingComponentOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <span
                        style={{ fontSize: "11px", color: "var(--subtext)" }}
                      >
                        % of the employee's Monthly gross (₹) — dynamic.
                      </span>
                    </div>
                  </div>
                )}

                {/* Monthly Cap (optional) — caps the component's value BEFORE
                    the allowance-envelope auto-fit (mirrors backend maxCap). */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: "4px",
                    }}
                  >
                    Monthly Cap (₹, optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={maxCapValue}
                    onChange={(e) => setMaxCapValue(e.target.value)}
                    placeholder="No cap"
                    style={{
                      width: "100%",
                      height: "36px",
                      padding: "0 10px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--card)",
                      color: "var(--text)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--subtext)" }}>
                    Upper limit applied before the allowance-envelope auto-fit.
                  </span>
                </div>
              </div>
            </form>

            {/* Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
                form="earning-form"
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
                {saving ? "Saving…" : "Save Earning Component"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Associated Employees & Dynamic Earnings Mapping */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Users size={18} style={{ color: "var(--primary)" }} />
              Associated Employees —{" "}
              {selectedSkillFilter === "ALL"
                ? "All Categories"
                : selectedSkillFilter}{" "}
              · {empStateFilter === "ALL" ? "All States" : empStateFilter}{" "}
              ({processedAssociatedEmployees.length})
            </h3>
            <p
              style={{
                fontSize: "12.5px",
                color: "var(--subtext)",
                margin: "3px 0 0",
              }}
            >
              Dynamically maps active earning components ({activeEarningComponents.length}) to each employee based on skill level and pay structure. Basic follows the Wage Rates monthly scale (daily × 26, skill/state-wise) and auto-syncs with the Wage Rates state selector.
            </p>
          </div>

          {/* Action Controls — Month/Year + Run Payroll for All Combined + Refresh & Help (dynamic) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <select
                value={runMonth}
                onChange={(e) => setRunMonth(Number(e.target.value))}
                style={{
                  height: "34px",
                  padding: "0 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                }}
              >
                {[
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={runYear}
                onChange={(e) => setRunYear(Number(e.target.value))}
                style={{
                  height: "34px",
                  padding: "0 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                }}
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleRunTierPayroll("ALL")}
              disabled={!!runningTier}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 14px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: runningTier ? "not-allowed" : "pointer",
                opacity: runningTier ? 0.7 : 1,
              }}
            >
              <Play size={13} fill="#fff" />
              {runningTier === "ALL" ? "Processing…" : "Run All Tiers Combined"}
            </button>
            {/* Manual refresh — re-pulls employees + components so salary
                edits saved elsewhere are reflected in gross immediately */}
            <button
              onClick={() => loadEarnings()}
              disabled={loading}
              title="Refresh employees and recalculate gross earnings"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "7px 12px",
                background: "var(--card)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              <RefreshCw size={13} />
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            {/* Help — explains the green/red/blue status dots and the
                allowance-envelope auto-fit (replaces any disclaimer popup) */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                title="How earnings & status dots work"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 12px",
                  background: showHelp ? "var(--primary-light)" : "var(--card)",
                  color: showHelp ? "var(--primary)" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <HelpCircle size={13} />
                Help
              </button>
              {showHelp && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 998 }}
                    onClick={() => setShowHelp(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: "420px",
                      zIndex: 999,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      boxShadow: "var(--shadow-lg)",
                      padding: "16px 18px",
                      fontSize: "12.5px",
                      color: "var(--text)",
                      lineHeight: 1.55,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                      How earnings & status dots work
                    </div>
                    <div style={{ color: "var(--subtext)", marginBottom: "10px" }}>
                      Basic wage is locked (wage rate × 26, skill/state-wise).
                      The allowance envelope = Monthly gross − Basic wage. The
                      other components act as weights and are auto-fitted
                      (rupee-exact) so their sum is <strong>exactly</strong> the
                      envelope — i.e. <strong>Gross earnings always equals
                      Monthly gross</strong> after the calculations.
                    </div>
                    {[
                      {
                        c: "var(--green)",
                        t: "Monthly gross = Gross earnings and ≥ Basic wage — healthy row.",
                      },
                      {
                        c: "var(--red)",
                        t: "Gross earnings ≠ Monthly gross — happens when Monthly gross is below the Basic wage (nothing left for allowances) or no components are configured to fill the envelope.",
                      },
                      {
                        c: "var(--blue)",
                        t: "Monthly gross < Basic wage — should never be less (Basic is the statutory floor); usually appears together with red.",
                      },
                    ].map((d) => (
                      <div
                        key={d.c}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <span
                          style={{
                            width: "9px",
                            height: "9px",
                            borderRadius: "50%",
                            background: d.c,
                            flexShrink: 0,
                            marginTop: "4px",
                          }}
                        />
                        <span>{d.t}</span>
                      </div>
                    ))}
                    <div style={{ color: "var(--subtext)", marginTop: "8px" }}>
                      Dots appear next to each Monthly gross value in the
                      Associated Employees table — hover any value for exact
                      amounts. If configured components total more than the
                      envelope, values are proportionally reduced (hover a
                      component value to see configured → fitted); a Monthly Cap
                      limits a component before the fit. Use Refresh after
                      editing salaries elsewhere.
                    </div>
                  </div>
                </>
              )}
            </div>

            {selectedSkillFilter !== "ALL" && (
              <button
                onClick={() => handleRunTierPayroll(selectedSkillFilter)}
                disabled={!!runningTier}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 14px",
                  background: "var(--card)",
                  color: "var(--primary)",
                  border: "1px solid var(--primary)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  cursor: runningTier ? "not-allowed" : "pointer",
                  opacity: runningTier ? 0.7 : 1,
                }}
              >
                <Play size={13} />
                {runningTier === selectedSkillFilter
                  ? "Processing…"
                  : `Run ${selectedSkillFilter} Only`}
              </button>
            )}
          </div>
        </div>

        {/* Search & Department Filter Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "14px",
            background: "var(--background)",
            padding: "10px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              flex: 1,
            }}
          >
            {/* Search Input */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                minWidth: "220px",
                maxWidth: "340px",
                flex: 1,
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  color: "var(--subtext)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder="Search name, code, designation..."
                value={empSearch}
                onChange={(e) => {
                  setEmpSearch(e.target.value);
                  setEmpPage(1);
                }}
                style={{
                  width: "100%",
                  height: "32px",
                  padding: "0 10px 0 32px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "12px",
                }}
              />
              {empSearch && (
                <button
                  onClick={() => {
                    setEmpSearch("");
                    setEmpPage(1);
                  }}
                  style={{
                    position: "absolute",
                    right: "8px",
                    background: "none",
                    border: "none",
                    color: "var(--subtext)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Department Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Filter size={13} style={{ color: "var(--subtext)" }} />
              <select
                value={empDeptFilter}
                onChange={(e) => {
                  setEmpDeptFilter(e.target.value);
                  setEmpPage(1);
                }}
                style={{
                  height: "32px",
                  padding: "0 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "12px",
                }}
              >
                <option value="ALL">All Departments</option>
                {dynamicDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Statewise Filter — synced with Wage Rates & Overrides */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--subtext)" }}>
                State:
              </span>
              <select
                value={empStateFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmpStateFilter(v);
                  setEmpPage(1);
                  try {
                    localStorage.setItem(
                      "hrms:selectedWageState",
                      v === "ALL" ? "All States (Default)" : v,
                    );
                  } catch {
                    /* ignore */
                  }
                  window.dispatchEvent(
                    new CustomEvent("hrms:wage-state-selected", {
                      detail: { state: v === "ALL" ? "All States (Default)" : v },
                    }),
                  );
                }}
                title="Statewise filter — auto-synced with the Wage Rates state selector"
                style={{
                  height: "32px",
                  padding: "0 8px",
                  borderRadius: "var(--radius-sm)",
                  border: empStateFilter !== "ALL" ? "1px solid var(--primary)" : "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  fontSize: "12px",
                  fontWeight: 600,
                  maxWidth: "190px",
                }}
              >
                <option value="ALL">All States</option>
                {dynamicEmpStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {(empSearch || empDeptFilter !== "ALL" || empStateFilter !== "ALL") && (
              <button
                onClick={() => {
                  setEmpSearch("");
                  setEmpDeptFilter("ALL");
                  setEmpStateFilter("ALL");
                  setEmpPage(1);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  background: "none",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--subtext)",
                  fontSize: "11.5px",
                  cursor: "pointer",
                }}
              >
                <X size={11} /> Reset Filters
              </button>
            )}
          </div>

          <div style={{ fontSize: "12px", color: "var(--subtext)" }}>
            Showing{" "}
            <strong>
              {processedAssociatedEmployees.length === 0
                ? 0
                : (safeEmpPage - 1) * EMP_PAGE_SIZE + 1}
            </strong>
            –
            <strong>
              {Math.min(
                safeEmpPage * EMP_PAGE_SIZE,
                processedAssociatedEmployees.length,
              )}
            </strong>{" "}
            of <strong>{processedAssociatedEmployees.length}</strong> employees
          </div>
        </div>

        {/* Associated Employees Table with Dynamic Earning Component Columns */}
        {processedAssociatedEmployees.length === 0 ? (
          <EmptyState
            title="No employees found"
            subtitle={
              empSearch || empDeptFilter !== "ALL" || empStateFilter !== "ALL"
                ? `No employees match your current search / department / state filter${empStateFilter !== "ALL" ? ` (state: ${empStateFilter})` : ""}.`
                : `No active employees are currently assigned to the ${selectedSkillFilter} tier.`
            }
          />
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
              background: "var(--card)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--background)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th
                    style={{
                      padding: "10px 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      width: "44px",
                    }}
                  >
                    #
                  </th>

                  <th
                    onClick={() => handleEmpSort("name")}
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      Employee {renderEmpSortIcon("name")}
                    </div>
                  </th>

                  <th
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Designation & Dept
                  </th>

                  <th
                    onClick={() => handleEmpSort("skill")}
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      Skill Tier {renderEmpSortIcon("skill")}
                    </div>
                  </th>

                  <th
                    onClick={() => handleEmpSort("rate")}
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center" }}>
                      Monthly gross (₹) {renderEmpSortIcon("rate")}
                    </div>
                  </th>

                  {/* Dynamic Columns for each Active Earning Component — component name only, no subheader */}
                  {activeEarningComponents.map((comp) => (
                    <th
                      key={comp.id}
                      onClick={() => handleEmpSort(`comp_${comp.id}`)}
                      style={{
                        padding: "10px 14px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--text)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        background: "rgba(13, 148, 136, 0.04)",
                        borderLeft: "1px solid var(--border)",
                      }}
                      title={`Calculation: ${comp.thresholdType === "percentage" ? `${comp.thresholdValue}% of ${comp.percentageFrom || "Monthly gross"}` : `Fixed ₹${comp.thresholdValue}`}${comp.maxCap != null ? ` | Monthly cap: ₹${Number(comp.maxCap).toLocaleString("en-IN")}` : ""} | Tier: ${comp.skillType || "ALL"}`}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        <span>{comp.name}</span>
                        {renderEmpSortIcon(`comp_${comp.id}`)}
                      </div>
                    </th>
                  ))}


                  <th
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--primary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                      borderLeft: "1px solid var(--border)",
                    }}
                    title="Sum of all active earning components for this employee"
                  >
                    Gross Earnings
                  </th>

                  <th
                    style={{
                      padding: "10px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--subtext)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedAssociatedEmployees.map((emp, idx) => {
                  const skill = emp.skillType || "Skilled";

                  // Envelope-aware breakdown: Basic is locked; non-basic
                  // components are auto-fitted (rupee-exact) so their sum is
                  // EXACTLY Monthly gross − Basic wage, i.e.
                  // Gross earnings === Monthly gross, always.
                  const breakdown = employeeEarningsBreakdown(emp, activeEarningComponents);
                  let rowTotalEarnings = 0;
                  const compValues = activeEarningComponents.map((comp) => {
                    const val = isBasicComponent(comp)
                      ? breakdown.basic
                      : breakdown.values.get(comp.id) ?? 0;
                    const configured = isBasicComponent(comp)
                      ? breakdown.basic
                      : breakdown.parts.find((p) => p.comp.id === comp.id)?.configured ?? 0;
                    rowTotalEarnings += val;
                    return { comp, val, configured };
                  });

                  return (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom:
                          idx < pagedAssociatedEmployees.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--hover-bg, rgba(0,0,0,0.015))")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: "12px",
                          color: "var(--subtext)",
                          fontFamily: "monospace",
                        }}
                      >
                        {(safeEmpPage - 1) * EMP_PAGE_SIZE + idx + 1}
                      </td>

                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "var(--text)",
                            fontSize: "13px",
                          }}
                        >
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: "11.5px",
                            color: "var(--subtext)",
                            fontFamily: "monospace",
                          }}
                        >
                          {emp.employeeCode || emp.id}
                        </div>
                      </td>

                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div
                          style={{
                            fontSize: "12.5px",
                            color: "var(--text)",
                            fontWeight: 500,
                          }}
                        >
                          {emp.designation?.title ||
                            emp.designation ||
                            "Staff"}
                        </div>
                        <div
                          style={{ fontSize: "11px", color: "var(--subtext)" }}
                        >
                          {emp.department?.name || emp.department || "General"}
                        </div>
                      </td>

                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "99px",
                            background: skill.toLowerCase().includes("semi")
                              ? "#eff6ff"
                              : skill.toLowerCase().includes("unskilled")
                              ? "#f8fafc"
                              : "#ecfdf5",
                            color: skill.toLowerCase().includes("semi")
                              ? "#2563eb"
                              : skill.toLowerCase().includes("unskilled")
                              ? "#64748b"
                              : "#059669",
                            border: `1px solid ${
                              skill.toLowerCase().includes("semi")
                                ? "#bfdbfe"
                                : skill.toLowerCase().includes("unskilled")
                                ? "#e2e8f0"
                                : "#a7f3d0"
                            }`,
                          }}
                        >
                          {skill}
                        </span>
                      </td>

                      {(() => {
                        const mg = breakdown.mg;
                        const basic = breakdown.basic;
                        const grossEarnings = rowTotalEarnings;
                        // Red and Blue are INDEPENDENT indicators — when both
                        // violations apply, BOTH dots are rendered together.
                        // Green shows only when neither violation applies.
                        const dots = [];
                        if (mg != null) {
                          const rupee = (n) => `₹${n.toLocaleString("en-IN")}`;
                          if (mg !== grossEarnings) {
                            dots.push({
                              color: "var(--red)",
                              title: `Monthly gross (${rupee(mg)}) ≠ Gross earnings (${rupee(grossEarnings)})`,
                            });
                          }
                          if (mg < basic) {
                            dots.push({
                              color: "var(--blue)",
                              title: `Monthly gross (${rupee(mg)}) < Basic wage (${rupee(basic)}) — should never be less`,
                            });
                          }
                          if (mg === grossEarnings && mg >= basic) {
                            dots.push({
                              color: "var(--green)",
                              title: `Monthly gross (${rupee(mg)}) = Gross earnings (${rupee(grossEarnings)}) and ≥ Basic wage (${rupee(basic)})`,
                            });
                          }
                        }
                        return (
                          <td
                            style={{
                              padding: "10px 14px",
                              fontSize: "12.5px",
                              fontFamily: "monospace",
                              whiteSpace: "nowrap",
                            }}
                            title={mg != null ? `Monthly gross (₹) ₹${mg.toLocaleString("en-IN")} — from the employee profile, updates dynamically${dots.length ? `\n${dots.map((d) => d.title).join("\n")}` : ""}` : "No monthly package set — add Monthly gross (₹) in the employee profile."}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {mg != null ? (
                                <span style={{ color: "var(--text)", fontWeight: 700 }}>
                                  ₹{mg.toLocaleString("en-IN")}
                                  <span style={{ fontSize: "10px", fontWeight: 500, color: "var(--subtext)" }}>/mo</span>
                                </span>
                              ) : (
                                <span style={{ color: "var(--subtext)", fontWeight: 700 }}>—</span>
                              )}
                              {dots.map((d) => (
                                <span
                                  key={d.color}
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: d.color,
                                    flexShrink: 0,
                                  }}
                                  title={d.title}
                                />
                              ))}
                            </div>
                            <div style={{ fontSize: "10.5px", color: "var(--subtext)" }}>
                              {mg != null ? "from employee" : "set package"}
                            </div>
                          </td>
                        );
                      })()}

                      {/* Dynamic Component Values for this Employee */}
                      {compValues.map(({ comp, val, configured }) => (
                        <td
                          key={comp.id}
                          title={
                            !isBasicComponent(comp) && val !== configured
                              ? `Auto-fitted: configured ₹${configured.toLocaleString("en-IN")} → ₹${val.toLocaleString("en-IN")} so Gross earnings = Monthly gross (envelope ₹${(breakdown.envelope ?? 0).toLocaleString("en-IN")})`
                              : undefined
                          }
                          style={{
                            padding: "10px 14px",
                            fontSize: "12.5px",
                            fontFamily: "monospace",
                            whiteSpace: "nowrap",
                            borderLeft: "1px solid var(--border)",
                            background: "rgba(13, 148, 136, 0.015)",
                            color: val > 0 ? "var(--text)" : "var(--subtext)",
                            fontWeight: val > 0 ? 600 : 400,
                          }}
                        >
                          {val > 0 ? (
                            `₹${val.toLocaleString("en-IN")}`
                          ) : (
                            <span style={{ opacity: 0.4 }}>—</span>
                          )}
                        </td>
                      ))}

                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "13px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: "var(--primary)",
                          whiteSpace: "nowrap",
                          borderLeft: "1px solid var(--border)",
                          background: "transparent",
                        }}
                        title="Sum of all active earning components for this employee"
                      >
                        {`₹${rowTotalEarnings.toLocaleString("en-IN")}`}
                      </td>

                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "99px",
                            background: "#f0fdf4",
                            color: "#16a34a",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          {emp.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Strictly 10 per page pagination bar */}
        {processedAssociatedEmployees.length > EMP_PAGE_SIZE && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginTop: "16px",
              padding: "12px 16px",
              background: "var(--background)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: "12.5px", color: "var(--subtext)" }}>
              Showing{" "}
              <strong>{(safeEmpPage - 1) * EMP_PAGE_SIZE + 1}</strong>
              –
              <strong>
                {Math.min(
                  safeEmpPage * EMP_PAGE_SIZE,
                  processedAssociatedEmployees.length,
                )}
              </strong>{" "}
              of <strong>{processedAssociatedEmployees.length}</strong> employees
              (Page {safeEmpPage} of {empPageCount})
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={() => setEmpPage((p) => Math.max(1, p - 1))}
                disabled={safeEmpPage <= 1}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: safeEmpPage <= 1 ? "var(--subtext)" : "var(--text)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: safeEmpPage <= 1 ? "not-allowed" : "pointer",
                  opacity: safeEmpPage <= 1 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              {Array.from({ length: empPageCount }, (_, i) => i + 1).map((pg) => {
                const isCurrent = pg === safeEmpPage;
                if (
                  empPageCount > 7 &&
                  pg !== 1 &&
                  pg !== empPageCount &&
                  Math.abs(pg - safeEmpPage) > 1
                ) {
                  if (pg === 2 || pg === empPageCount - 1) {
                    return (
                      <span
                        key={`dots-${pg}`}
                        style={{ padding: "0 4px", color: "var(--subtext)" }}
                      >
                        …
                      </span>
                    );
                  }
                  return null;
                }
                return (
                  <button
                    key={pg}
                    onClick={() => setEmpPage(pg)}
                    style={{
                      minWidth: "30px",
                      height: "30px",
                      padding: "0 6px",
                      borderRadius: "var(--radius-sm)",
                      border: isCurrent
                        ? "1px solid var(--primary)"
                        : "1px solid var(--border)",
                      background: isCurrent ? "var(--primary)" : "var(--card)",
                      color: isCurrent ? "#fff" : "var(--text)",
                      fontSize: "12.5px",
                      fontWeight: isCurrent ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {pg}
                  </button>
                );
              })}

              <button
                onClick={() => setEmpPage((p) => Math.min(empPageCount, p + 1))}
                disabled={safeEmpPage >= empPageCount}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color:
                    safeEmpPage >= empPageCount
                      ? "var(--subtext)"
                      : "var(--text)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor:
                    safeEmpPage >= empPageCount ? "not-allowed" : "pointer",
                  opacity: safeEmpPage >= empPageCount ? 0.5 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

    </section>
  );
}
