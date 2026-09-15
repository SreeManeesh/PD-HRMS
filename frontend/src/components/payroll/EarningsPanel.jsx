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
} from "../../services/payrollService";
import { getEmployees } from "../../services/employeeService";

const DEFAULT_EARNINGS = [
  {
    id: "e-basic",
    name: "Basic Salary",
    code: "BASIC",
    skillType: "ALL",
    thresholdType: "fixed",
    thresholdValue: 20000,
    percentageFrom: "",
    priority: 1,
    isActive: true,
  },
  {
    id: "e-hra",
    name: "House Rent Allowance (HRA)",
    code: "HRA",
    skillType: "ALL",
    thresholdType: "percentage",
    thresholdValue: 50,
    percentageFrom: "Basic Salary",
    priority: 2,
    isActive: true,
  },
  {
    id: "e-transport",
    name: "Transport Allowance",
    code: "TRANSPORT_ALLOW",
    skillType: "ALL",
    thresholdType: "fixed",
    thresholdValue: 1500,
    percentageFrom: "",
    priority: 3,
    isActive: true,
  },
  {
    id: "e-food",
    name: "Food Allowance",
    code: "FOOD_ALLOW",
    skillType: "Skilled",
    thresholdType: "fixed",
    thresholdValue: 1000,
    percentageFrom: "",
    priority: 4,
    isActive: true,
  },
  {
    id: "e-night",
    name: "Night Shift Allowance",
    code: "NIGHT_ALLOW",
    skillType: "ALL",
    thresholdType: "fixed",
    thresholdValue: 1500,
    percentageFrom: "",
    priority: 5,
    isActive: true,
  },
  {
    id: "e-bonus",
    name: "Attendance Bonus",
    code: "ATT_BONUS",
    skillType: "ALL",
    thresholdType: "fixed",
    thresholdValue: 1500,
    percentageFrom: "",
    priority: 6,
    isActive: true,
  },
  {
    id: "e-prod",
    name: "Production Incentive",
    code: "PROD_INC",
    skillType: "Skilled",
    thresholdType: "fixed",
    thresholdValue: 3000,
    percentageFrom: "",
    priority: 7,
    isActive: true,
  },
  {
    id: "e-special",
    name: "Special Allowance",
    code: "SPECIAL_ALLOW",
    skillType: "ALL",
    thresholdType: "percentage",
    thresholdValue: 20,
    percentageFrom: "Basic Salary",
    priority: 8,
    isActive: true,
  },
];

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
  const [empSortKey, setEmpSortKey] = useState("name");
  const [empSortDir, setEmpSortDir] = useState("asc");
  const [empPage, setEmpPage] = useState(1);
  const EMP_PAGE_SIZE = 10;

  // Inline editing for Priority numeric field
  const [priorityEditingId, setPriorityEditingId] = useState(null);
  const [priorityValue, setPriorityValue] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Associated Employees & Run Payroll by Tier
  const [employeesList, setEmployeesList] = useState([]);
  const [runningTier, setRunningTier] = useState(null);
  const [runMonth, setRunMonth] = useState(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState(new Date().getFullYear());

  // Form Fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [skillType, setSkillType] = useState("ALL");
  const [thresholdType, setThresholdType] = useState("fixed"); // "fixed" | "percentage"
  const [thresholdValue, setThresholdValue] = useState("");
  const [percentageFrom, setPercentageFrom] = useState("Basic Salary");
  const [priority, setPriority] = useState(1);

  const loadEarnings = async () => {
    setLoading(true);
    try {
      const [res, empRes] = await Promise.all([
        getPayrollComponentConfigs().catch(() => ({ data: [] })),
        getEmployees().catch(() => ({ data: [] })),
      ]);
      const serverComps = (res.data || []).filter(
        (c) => c.kind !== "deduction",
      );
      setEmployeesList(empRes.data || []);

      if (serverComps.length > 0) {
        // Map backend components to earnings UI format
        // Backend now returns priority and percentageFrom fields.
        // NOTE: backend stores percentage in `pct` (not `value`), and fixed
        // amounts in `value` (`maxCap` is only an upper cap, not the amount).
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
                ? numOr(c.pct, c.value, 40)
                : numOr(c.value, c.maxCap, 1500),
            percentageFrom: c.percentageFrom || (c.sourceField === "ctc" ? "Gross Pay" : "Basic Salary"),
            priority: c.priority ?? (idx + 1),
            isActive: c.isActive ?? true,
          };
        });
        setEarnings(mapped);
      } else {
        setEarnings(DEFAULT_EARNINGS);
      }
    } catch {
      setEarnings(DEFAULT_EARNINGS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEarnings();
  }, []);

  // Re-fetch when the tab regains focus / becomes visible so salary edits
  // made in EmployeeProfile (a different route) are reflected in gross
  // earnings without requiring a hard reload.
  useEffect(() => {
    const refresh = () => loadEarnings();
    window.addEventListener("focus", refresh);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadEarnings();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
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
    setPercentageFrom("Basic Salary");
    setPriority(earnings.length + 1);
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setSkillType(item.skillType || "ALL");
    setThresholdType(item.thresholdType || "fixed");
    setThresholdValue(String(item.thresholdValue || ""));
    setPercentageFrom(item.percentageFrom || "Basic Salary");
    setPriority(item.priority || 1);
    setShowModal(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Please enter a component name", "error");
      return;
    }
    const val = parseFloat(thresholdValue);
    if (isNaN(val) || val < 0) {
      toast("Please enter a valid numeric threshold value", "error");
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
      maxCap: thresholdType === "fixed" ? val : null,
      sourceField: thresholdType === "percentage" && percentageFrom === "Gross Pay" ? "ctc" : "basic",
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

  const handleDelete = async (id, compName) => {
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

  // Existing earning components available for "Percentage From" select
  const existingComponentOptions = useMemo(() => {
    const names = earnings.map((e) => e.name).filter((n) => n !== name);
    return [
      "Basic Salary",
      "Gross Pay",
      ...names.filter((n) => n !== "Basic Salary" && n !== "Gross Pay"),
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

  // Dynamic calculation of an employee's entitlement for a specific component.
  // Uses a RESIDUAL BASIC approach: Basic = monthlyGross − Σ(other applicable
  // components). This guarantees that Σ(all components) = monthlyGross.
  // Basic is detected flexibly (code/name containing "basic", e.g. BASIC,
  // BASIC_WAGE, BASIC_SALARY) and always applies to every employee so gross
  // never collapses to just allowances or overshoots the monthly package.
  const isBasicComponent = (c) => {
    const code = String(c?.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = String(c?.name || "").toLowerCase();
    return code.includes("basic") || name.includes("basic");
  };
  const isEligibleForEmployee = (emp, c, applicableEarningCodes, hasAllowanceFilter, { bypassSkillForBasic = true } = {}) => {
    if (c?.isActive === false) return false;
    if (bypassSkillForBasic && isBasicComponent(c)) {
      // Basic is mandatory for the Σ = gross invariant: ignore skill-tier
      // restriction so Semi-Skilled/Unskilled staff don't collapse to just
      // allowances (e.g. ₹3,000 against a ₹24,000 base). An explicit
      // per-employee allow-list that omits basic is treated as "basic still
      // applies as fallback" for the same reason.
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
  const calculateEmployeeComponent = (emp, comp, allActiveComps) => {
    const comps = (allActiveComps || activeEarningComponents).filter(
      (c) => c.isActive !== false,
    );

    const isDaily =
      emp.salaryType === "Daily" ||
      (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);
    const monthlyGross = isDaily
      ? Number(emp.dailyWageRate || 750) * 26
      : Math.round((Number(emp.annualSalary) || 300000) / 12);

    const { codes: applicableEarningCodes, hasFilter: hasAllowanceFilter } =
      getApplicableCodes(emp);

    if (!isEligibleForEmployee(emp, comp, applicableEarningCodes, hasAllowanceFilter)) return 0;

    const eligible = comps.filter((c) =>
      isEligibleForEmployee(emp, c, applicableEarningCodes, hasAllowanceFilter),
    );
    const basicComp = eligible.find(isBasicComponent) || comps.find(isBasicComponent);
    const hasBasic = Boolean(basicComp);

    // Fixed (non-basic, non-percentage) sum for this employee
    const fixedSum = eligible
      .filter((c) => !isBasicComponent(c) && c.thresholdType !== "percentage")
      .reduce((sum, c) => sum + Number(c.thresholdValue || 0), 0);

    // Percentage splits: from-basic vs from-gross
    const pctFromBasicRatio = eligible
      .filter((c) => !isBasicComponent(c) && c.thresholdType === "percentage" && !isPctFromGross(c))
      .reduce((sum, c) => sum + Number(c.thresholdValue || 0) / 100, 0);
    const pctFromGrossRatio = eligible
      .filter((c) => !isBasicComponent(c) && c.thresholdType === "percentage" && isPctFromGross(c))
      .reduce((sum, c) => sum + Number(c.thresholdValue || 0) / 100, 0);

    const grossPctAmount = monthlyGross * pctFromGrossRatio;
    // Basic absorbs whatever is left:
    // Basic * (1 + pctFromBasic) = monthlyGross − fixedSum − grossPctAmount
    // When fixed + gross-% already exceed the package, basic floors to 0 and
    // the row total will exceed monthly gross (UI flags it as a warning so HR
    // can fix the CTC or allowance config — we never silently shrink fixed
    // entitlements).
    const overflow = fixedSum + grossPctAmount > monthlyGross;
    let computedBasic = hasBasic && !overflow
      ? Math.round(
          Math.max(0, monthlyGross - fixedSum - grossPctAmount) / (1 + pctFromBasicRatio),
        )
      : 0;

    // Absorb rounding so Σ == monthlyGross in the normal (non-overflow) case.
    if (hasBasic && !overflow) {
      const basicPctRounded = eligible
        .filter((c) => !isBasicComponent(c) && c.thresholdType === "percentage" && !isPctFromGross(c))
        .reduce((s, c) => s + Math.round((computedBasic * Number(c.thresholdValue || 0)) / 100), 0);
      const grossPctRounded = eligible
        .filter((c) => !isBasicComponent(c) && c.thresholdType === "percentage" && isPctFromGross(c))
        .reduce((s, c) => s + Math.round((monthlyGross * Number(c.thresholdValue || 0)) / 100), 0);
      const total = computedBasic + fixedSum + basicPctRounded + grossPctRounded;
      computedBasic += monthlyGross - total;
      if (computedBasic < 0) computedBasic = 0;
    }

    if (isBasicComponent(comp)) {
      return computedBasic;
    }

    if (comp.thresholdType === "percentage") {
      if (isPctFromGross(comp)) {
        return Math.round((monthlyGross * Number(comp.thresholdValue || 0)) / 100);
      }
      return Math.round((computedBasic * Number(comp.thresholdValue || 0)) / 100);
    }

    // Fixed amount (already confirmed eligible above)
    return Math.round(Number(comp.thresholdValue || 0));
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

  const processedAssociatedEmployees = useMemo(() => {
    let list = [...employeesList];

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
        valA = Number(a.dailyWageRate || a.annualSalary || 0);
        valB = Number(b.dailyWageRate || b.annualSalary || 0);
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
  }, [
    employeesList,
    selectedSkillFilter,
    empDeptFilter,
    empSearch,
    empSortKey,
    empSortDir,
    activeEarningComponents,
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
            Earning allowances, fixed caps, percentage ceilings calculated from base components, and numeric calculation priorities.
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
                        {item.code === "BASIC" && (
                          <span
                            title="Basic Salary is system-managed and cannot be edited or deleted"
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
                            <Lock size={9} /> Fixed
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

                    {/* Threshold Details / Formula */}
                    <td
                      style={{
                        padding: "14px 16px",
                        background: "rgba(99, 102, 241, 0.02)",
                      }}
                    >
                      {isFixed ? (
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
                            (Monthly Cap)
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
                            of {item.percentageFrom || "Basic Salary"} (Maximum)
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

                    {/* Actions — BASIC is protected (no edit/delete) */}
                    <td style={{ padding: "14px 16px" }}>
                      {item.code === "BASIC" ? (
                        <span style={{ fontSize: "11px", color: "var(--subtext)", fontStyle: "italic", display: "flex", alignItems: "center", gap: "4px" }}>
                          <Lock size={11} /> System managed
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
                            onClick={() => handleDelete(item.id, item.name)}
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
                        Select existing base component to compute this
                        percentage against.
                      </span>
                    </div>
                  </div>
                )}
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
              ({processedAssociatedEmployees.length})
            </h3>
            <p
              style={{
                fontSize: "12.5px",
                color: "var(--subtext)",
                margin: "3px 0 0",
              }}
            >
              Dynamically maps active earning components ({activeEarningComponents.length}) to each employee based on skill level and pay structure.
            </p>
          </div>

          {/* Month/Year and Run Payroll Action Controls */}
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

            {/* Run All Tiers Combined */}
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

            {/* Run For Selected Tier Separately */}
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

            {(empSearch || empDeptFilter !== "ALL") && (
              <button
                onClick={() => {
                  setEmpSearch("");
                  setEmpDeptFilter("ALL");
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
              empSearch || empDeptFilter !== "ALL"
                ? "No employees match your current search or department filter."
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
                      Base Pay / Rate {renderEmpSortIcon("rate")}
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
                      title={`Calculation: ${comp.thresholdType === "percentage" ? `${comp.thresholdValue}% of ${comp.percentageFrom || "Basic"}` : `Fixed ₹${comp.thresholdValue}`} | Tier: ${comp.skillType || "ALL"}`}
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
                    title="Sum of all active earning components = Monthly Gross"
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
                  const isDaily =
                    emp.salaryType === "Daily" ||
                    (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);

                  let rowTotalEarnings = 0;
                  const compValues = activeEarningComponents.map((comp) => {
                    const val = calculateEmployeeComponent(emp, comp, activeEarningComponents);
                    rowTotalEarnings += val;
                    return { comp, val };
                  });
                  // Verify: total should equal monthlyGross (residual approach)
                  const isDaily2 = emp.salaryType === "Daily" || (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);
                  const empMonthlyGross = isDaily2
                    ? Number(emp.dailyWageRate || 750) * 26
                    : Math.round((Number(emp.annualSalary) || 300000) / 12);

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

                      <td
                        style={{
                          padding: "10px 14px",
                          fontSize: "12.5px",
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isDaily ? (
                          <span style={{ color: "#0284c7", fontWeight: 700 }}>
                            ₹
                            {Number(emp.dailyWageRate || 750).toLocaleString(
                              "en-IN",
                            )}
                            /day
                          </span>
                        ) : (
                          <span
                            style={{ color: "var(--text)", fontWeight: 700 }}
                          >
                            ₹
                            {Math.round(
                              (Number(emp.annualSalary) || 300000) / 12,
                            ).toLocaleString("en-IN")}
                            /mo
                          </span>
                        )}
                      </td>

                      {/* Dynamic Component Values for this Employee */}
                      {compValues.map(({ comp, val }) => (
                        <td
                          key={comp.id}
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
                          color: Math.abs(rowTotalEarnings - empMonthlyGross) <= 5 ? "#059669" : "var(--primary)",
                          whiteSpace: "nowrap",
                          borderLeft: "1px solid var(--border)",
                          background: Math.abs(rowTotalEarnings - empMonthlyGross) <= 5
                            ? "rgba(5,150,105,0.04)"
                            : "transparent",
                        }}
                        title={Math.abs(rowTotalEarnings - empMonthlyGross) <= 5
                          ? "✓ Matches monthly gross"
                          : `Note: ${rowTotalEarnings > empMonthlyGross ? 'Exceeds' : 'Below'} monthly gross by ₹${Math.abs(rowTotalEarnings - empMonthlyGross).toLocaleString('en-IN')}`}
                      >
                        ₹{rowTotalEarnings.toLocaleString("en-IN")}
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
