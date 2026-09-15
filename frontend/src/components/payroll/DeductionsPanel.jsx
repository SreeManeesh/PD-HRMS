import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  X,
  ShieldAlert,
  Filter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  Info,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import EmptyState from "../shared/EmptyState";
import { getEmployees } from "../../services/employeeService";
import {
  getPayrollComponentConfigs,
  createPayrollComponentConfig,
  updatePayrollComponentConfig,
  deletePayrollComponentConfig,
} from "../../services/payrollService";

export const INDIAN_STATES = [
  "Maharashtra",
  "Delhi",
  "Karnataka",
  "Gujarat",
  "Tamil Nadu",
  "Telangana",
  "West Bengal",
  "Haryana",
  "Uttar Pradesh",
  "Kerala",
  "Andhra Pradesh",
  "Rajasthan",
  "Madhya Pradesh",
  "Punjab",
  "Bihar",
  "Odisha",
];

export const STATE_STATUTORY_RULES = {
  Maharashtra: {
    pt: { thresholdValue: 200, cap: 200, note: "PT: ₹200/mo (Feb ₹300). Applicable for Gross > ₹10,000 (Females exempt up to ₹25,000)" },
    lwf: { thresholdValue: 20, cap: 20, note: "LWF: ₹20/mo (Maharashtra Labour Welfare Board Act)" },
  },
  Delhi: {
    pt: { thresholdValue: 0, cap: 0, note: "PT: ₹0 (No Professional Tax is levied in Delhi NCT)" },
    lwf: { thresholdValue: 0.75, cap: 0.75, note: "LWF: ₹0.75/mo (Employee ₹0.75 + Employer ₹2.25 contribution)" },
  },
  Haryana: {
    pt: { thresholdValue: 0, cap: 0, note: "PT: ₹0 (No Professional Tax is levied in Haryana)" },
    lwf: { thresholdValue: 25, cap: 25, note: "LWF: 0.2% of salary up to max cap ₹25/mo" },
  },
  Karnataka: {
    pt: { thresholdValue: 200, cap: 200, note: "PT: ₹200/mo for Gross > ₹15,000 (Exempt below ₹15,000)" },
    lwf: { thresholdValue: 6, cap: 20, note: "LWF: ₹20 annual in December (or ₹6/mo nominal accrual)" },
  },
  Gujarat: {
    pt: { thresholdValue: 200, cap: 200, note: "PT: ₹200/mo for Gross > ₹12,000 (Exempt below ₹12,000)" },
    lwf: { thresholdValue: 6, cap: 6, note: "LWF: ₹6 half-yearly in June and December" },
  },
  "Tamil Nadu": {
    pt: { thresholdValue: 208, cap: 208, note: "PT: Slabs up to ₹208/mo for Gross > ₹15,000" },
    lwf: { thresholdValue: 20, cap: 20, note: "LWF: ₹20 annual employee contribution" },
  },
  Telangana: {
    pt: { thresholdValue: 200, cap: 200, note: "PT: ₹150 for ₹15k–20k, ₹200 for > ₹20,000" },
    lwf: { thresholdValue: 20, cap: 20, note: "LWF: ₹20 annual employee contribution" },
  },
  "West Bengal": {
    pt: { thresholdValue: 150, cap: 200, note: "PT: Slabs ₹110 to ₹200 depending on gross earnings" },
    lwf: { thresholdValue: 3, cap: 3, note: "LWF: ₹3/mo (West Bengal Labour Welfare Fund)" },
  },
  Kerala: {
    pt: { thresholdValue: 208, cap: 208, note: "PT: Semi-annual slabs up to ₹208/mo for Gross > ₹12,500" },
    lwf: { thresholdValue: 20, cap: 20, note: "LWF: ₹20/mo contribution" },
  },
  "Uttar Pradesh": {
    pt: { thresholdValue: 0, cap: 0, note: "PT: Currently suspended / ₹0" },
    lwf: { thresholdValue: 10, cap: 10, note: "LWF: ₹10/mo contribution" },
  },
};

const DEFAULT_DEDUCTIONS = [
  {
    id: "d-pf",
    name: "Provident Fund (EPF)",
    code: "EPF",
    category: "Statutory",
    thresholdType: "percentage",
    thresholdValue: 12,
    percentageFrom: "Basic Salary",
    cap: 1800,
    priority: 1,
    isActive: true,
  },
  {
    id: "d-esi",
    name: "Employee State Insurance (ESIC)",
    code: "ESIC",
    category: "Statutory",
    thresholdType: "percentage",
    thresholdValue: 0.75,
    percentageFrom: "Gross Wages",
    cap: 157.5,
    priority: 2,
    isActive: true,
  },
  {
    id: "d-pt",
    name: "Professional Tax (PT)",
    code: "PT",
    category: "Statutory",
    thresholdType: "fixed",
    thresholdValue: 200,
    percentageFrom: "",
    cap: 200,
    priority: 3,
    isActive: true,
    note: "PT: ₹200/mo (Feb ₹300) for Gross > ₹10,000",
  },
  {
    id: "d-tds",
    name: "Income Tax / TDS (Sec 115BAC)",
    code: "TDS",
    category: "Statutory",
    thresholdType: "percentage",
    thresholdValue: 0,
    percentageFrom: "Annual Taxable Income",
    cap: null,
    priority: 4,
    isActive: true,
  },
  {
    id: "d-lwf",
    name: "Labour Welfare Fund (LWF)",
    code: "LWF",
    category: "Statutory",
    thresholdType: "fixed",
    thresholdValue: 20,
    percentageFrom: "",
    cap: 20,
    priority: 5,
    isActive: true,
    note: "LWF: ₹20/mo (Maharashtra Labour Welfare Board)",
  },
  {
    id: "d-adv",
    name: "Salary Advance EMI Recovery",
    code: "ADVANCE_RECOVERY",
    category: "Voluntary / Loan",
    thresholdType: "fixed",
    thresholdValue: 2000,
    percentageFrom: "",
    cap: null,
    priority: 6,
    isActive: true,
  },
  {
    id: "d-lop",
    name: "Loss of Pay (Unpaid Leave)",
    code: "LOP",
    category: "Statutory Proration",
    thresholdType: "percentage",
    thresholdValue: 100,
    percentageFrom: "Daily Salary Rate",
    cap: null,
    priority: 7,
    isActive: true,
  },
];

export default function DeductionsPanel() {
  const toast = useToast();
  const [selectedState, setSelectedState] = useState("Maharashtra");
  const [deductions, setDeductions] = useState(DEFAULT_DEDUCTIONS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortField, setSortField] = useState("priority");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Employee association state
  const [employeesList, setEmployeesList] = useState([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empPage, setEmpPage] = useState(1);
  const EMP_PAGE_SIZE = 10;
  const [empSortKey, setEmpSortKey] = useState("name");
  const [empSortDir, setEmpSortDir] = useState("asc");

  const loadDeductions = async () => {
    setLoading(true);
    try {
      const [res, empRes] = await Promise.all([
        getPayrollComponentConfigs().catch(() => ({ data: [] })),
        getEmployees().catch(() => ({ data: [] })),
      ]);
      const serverDeductions = (res.data || []).filter((c) => c.kind === "deduction");
      setEmployeesList(empRes.data || []);
      setDeductions(
        serverDeductions.length
          ? serverDeductions.map((c, idx) => ({
              id: c.id,
              name: c.name,
              code: c.code || c.name.toUpperCase().replace(/\s+/g, "_"),
              category: c.category || "Statutory",
              thresholdType: c.calcType === "percentage" ? "percentage" : "fixed",
              thresholdValue: c.calcType === "percentage" ? (c.pct ?? c.value ?? 0) : (c.value ?? c.maxCap ?? 0),
              percentageFrom: c.percentageFrom || c.sourceField || "",
              cap: c.maxCap ?? null,
              priority: c.priority ?? idx + 1,
              isActive: c.isActive ?? true,
            }))
          : DEFAULT_DEDUCTIONS
      );
    } catch {
      setDeductions(DEFAULT_DEDUCTIONS);
    } finally {
      setLoading(false);
    }
  };

  // Fetch employees and persisted deduction components.
  useEffect(() => {
    loadDeductions();
  }, []);

  useEffect(() => {
    const rules = STATE_STATUTORY_RULES[selectedState] || STATE_STATUTORY_RULES.Maharashtra;
    setDeductions((prev) =>
      prev.map((d) => {
        if (d.code === "PT" && rules.pt) {
          return {
            ...d,
            thresholdValue: rules.pt.thresholdValue,
            cap: rules.pt.cap,
            note: rules.pt.note,
          };
        }
        if (d.code === "LWF" && rules.lwf) {
          return {
            ...d,
            thresholdValue: rules.lwf.thresholdValue,
            cap: rules.lwf.cap,
            note: rules.lwf.note,
          };
        }
        return d;
      })
    );
  }, [selectedState]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("Statutory");
  const [thresholdType, setThresholdType] = useState("fixed");
  const [thresholdValue, setThresholdValue] = useState("");
  const [percentageFrom, setPercentageFrom] = useState("Basic Salary");
  const [cap, setCap] = useState("");
  const [priority, setPriority] = useState(1);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName("");
    setCode("");
    setCategory("Statutory");
    setThresholdType("fixed");
    setThresholdValue("");
    setPercentageFrom("Basic Salary");
    setCap("");
    setPriority(deductions.length + 1);
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setCategory(item.category || "Statutory");
    setThresholdType(item.thresholdType || "fixed");
    setThresholdValue(String(item.thresholdValue || ""));
    setPercentageFrom(item.percentageFrom || "Basic Salary");
    setCap(item.cap !== null && item.cap !== undefined ? String(item.cap) : "");
    setPriority(item.priority || 1);
    setShowModal(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Please enter a deduction name", "error");
      return;
    }
    const val = parseFloat(thresholdValue);
    if (isNaN(val) || val < 0) {
      toast("Please enter a valid numeric threshold or rate", "error");
      return;
    }

    const itemCode = (
      code.trim() || name.toUpperCase().replace(/\s+/g, "_")
    ).replace(/[^A-Z0-9_]/g, "");
    const localPayload = {
      id: editingItem ? editingItem.id : `d-${Date.now()}`,
      name: name.trim(),
      code: itemCode,
      category,
      thresholdType,
      thresholdValue: val,
      percentageFrom: thresholdType === "percentage" ? percentageFrom : "",
      cap: cap ? parseFloat(cap) : null,
      priority: Number(priority) || 1,
      isActive: true,
    };
    const apiPayload = {
      name: name.trim(),
      code: itemCode,
      kind: "deduction",
      calcType: thresholdType === "percentage" ? "percentage" : "fixed",
      value: val,
      pct: thresholdType === "percentage" ? val : null,
      sourceField: thresholdType === "percentage" ? percentageFrom : null,
      percentageFrom: thresholdType === "percentage" ? percentageFrom : null,
      maxCap: cap ? parseFloat(cap) : null,
      applicableCategory: "ALL",
      priority: Number(priority) || 1,
    };

    try {
      let saved = null;
      if (editingItem && !String(editingItem.id).startsWith("d-")) {
        saved = (await updatePayrollComponentConfig(editingItem.id, apiPayload)).data;
      } else {
        saved = (await createPayrollComponentConfig(apiPayload)).data;
      }
      const nextPayload = { ...localPayload, id: saved?.id || localPayload.id };
      if (editingItem) {
        setDeductions((prev) =>
          prev.map((item) => (item.id === editingItem.id ? nextPayload : item)),
        );
        toast(`Updated deduction "${name}"`);
      } else {
        setDeductions((prev) => [...prev, nextPayload]);
        toast(`Added deduction "${name}"`);
      }
      setShowModal(false);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to save deduction", "error");
    }
  };

  const handleDelete = async (id, compName) => {
    if (!window.confirm(`Are you sure you want to remove "${compName}"?`))
      return;
    try {
      if (!String(id).startsWith("d-")) {
        await deletePayrollComponentConfig(id);
      }
      setDeductions((prev) => prev.filter((item) => item.id !== id));
      toast(`Removed "${compName}"`);
    } catch (err) {
      toast(err.response?.data?.message || err.message || "Failed to remove deduction", "error");
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

  const processedDeductions = useMemo(() => {
    let list = [...deductions];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q),
      );
    }

    if (categoryFilter !== "ALL") {
      list = list.filter((item) =>
        item.category.toLowerCase().includes(categoryFilter.toLowerCase()),
      );
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
      } else if (sortField === "thresholdValue") {
        valA = Number(a.thresholdValue || 0);
        valB = Number(b.thresholdValue || 0);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [deductions, searchQuery, categoryFilter, sortField, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(processedDeductions.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedDeductions = useMemo(() => {
    return processedDeductions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  }, [processedDeductions, safePage]);

  // Active deductions (sorted by priority)
  const activeDeductions = useMemo(() => {
    return [...deductions]
      .filter((d) => d.isActive !== false)
      .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  }, [deductions]);

  // Calculate deduction amount for a specific employee and deduction rule
  const calculateEmpDeduction = (emp, ded, grossEarnings) => {
    // Per-employee applicable deduction filter
    const applicableDeductionCodes = emp.wizardData?.payRules?.deductions ||
      emp.payRules?.deductions || [];
    const hasFilter = Array.isArray(applicableDeductionCodes) && applicableDeductionCodes.length > 0;
    const isAllowed = !hasFilter || applicableDeductionCodes.some(c =>
      c?.toUpperCase?.() === ded.code?.toUpperCase?.() ||
      c?.toUpperCase?.() === ded.name?.toUpperCase?.().replace(/\s+/g, "_")
    );
    if (!isAllowed) return 0;

    const isDaily = emp.salaryType === "Daily" || (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);
    const monthlyGross = grossEarnings > 0 ? grossEarnings :
      isDaily ? Number(emp.dailyWageRate || 750) * 26
        : Math.round((Number(emp.annualSalary) || 300000) / 12);

    // Compute basic (40% of gross — reasonable for deduction base computation)
    const basic = Math.round(monthlyGross * 0.4);

    let amount = 0;
    if (ded.thresholdType === "percentage") {
      const base = ded.percentageFrom?.toLowerCase().includes("basic") ? basic
        : ded.percentageFrom?.toLowerCase().includes("gross") ? monthlyGross
          : monthlyGross;
      amount = Math.round((base * Number(ded.thresholdValue || 0)) / 100);
    } else {
      amount = Number(ded.thresholdValue || 0);
    }

    // Apply cap if set
    if (ded.cap !== null && ded.cap !== undefined && ded.cap > 0) {
      amount = Math.min(amount, Number(ded.cap));
    }
    return amount;
  };

  // Processed employees list for association table
  const processedEmpList = useMemo(() => {
    let list = [...employeesList];
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase();
      list = list.filter((e) => {
        const name = `${e.firstName || ""} ${e.lastName || ""}`.toLowerCase();
        const code = (e.employeeCode || e.id || "").toLowerCase();
        const dept = (e.department?.name || e.department || "").toLowerCase();
        return name.includes(q) || code.includes(q) || dept.includes(q);
      });
    }
    list.sort((a, b) => {
      let vA = "", vB = "";
      if (empSortKey === "name") {
        vA = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
        vB = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase();
      } else if (empSortKey === "salary") {
        vA = Number(a.annualSalary || 0);
        vB = Number(b.annualSalary || 0);
      }
      if (vA < vB) return empSortDir === "asc" ? -1 : 1;
      if (vA > vB) return empSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [employeesList, empSearch, empSortKey, empSortDir]);

  const empPageCount = Math.max(1, Math.ceil(processedEmpList.length / EMP_PAGE_SIZE));
  const safeEmpPage = Math.min(Math.max(1, empPage), empPageCount);
  const pagedEmpList = useMemo(() =>
    processedEmpList.slice((safeEmpPage - 1) * EMP_PAGE_SIZE, safeEmpPage * EMP_PAGE_SIZE),
    [processedEmpList, safeEmpPage]
  );

  const handleEmpSort = (key) => {
    if (empSortKey === key) setEmpSortDir(d => d === "asc" ? "desc" : "asc");
    else { setEmpSortKey(key); setEmpSortDir("asc"); }
  };

  const renderEmpSortIcon = (key) => {
    if (empSortKey !== key) return <ArrowUpDown size={11} style={{ opacity: 0.35, marginLeft: "4px" }} />;
    return empSortDir === "asc"
      ? <ArrowUp size={11} style={{ color: "var(--primary)", marginLeft: "4px" }} />
      : <ArrowDown size={11} style={{ color: "var(--primary)", marginLeft: "4px" }} />;
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
            <ShieldAlert size={20} style={{ color: "var(--red, #dc2626)" }} />
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Deductions & Statutory Contributions
              {/* (Wage Rates UI) */}
            </h2>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: "#fef2f2",
                color: "var(--red, #dc2626)",
                padding: "2px 8px",
                borderRadius: "99px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Statutory Compliances
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
            Indian statutory withholdings (EPF, ESIC, Professional Tax, TDS)
            alongside voluntary loan recoveries with fixed caps and priority
            sequence.
          </p>
        </div>

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
          <Plus size={15} /> Add Deduction Rule
        </button>
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
            placeholder="Search deduction name, code, category…"
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
            Category:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
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
            <option value="Statutory">Statutory</option>
            <option value="Voluntary">Voluntary / Loan</option>
          </select>
        </div>

        {/* State Jurisdiction Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <MapPin size={13} style={{ color: "var(--primary)" }} />
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--subtext)",
            }}
          >
            State Sphere:
          </span>
          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setPage(1);
            }}
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
            {INDIAN_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {(searchQuery || categoryFilter !== "ALL" || selectedState !== "Maharashtra") && (
          <button
            onClick={() => {
              setSearchQuery("");
              setCategoryFilter("ALL");
              setSelectedState("Maharashtra");
              setPage(1);
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

      {/* State Statutory Guidelines Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "12px 16px",
          borderRadius: "var(--radius)",
          background: "rgba(99, 102, 241, 0.05)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          marginBottom: "20px",
        }}
      >
        <Info size={18} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "2px" }} />
        <div style={{ fontSize: "12.5px", color: "var(--text)", lineHeight: 1.5 }}>
          <b style={{ color: "var(--primary)" }}>{selectedState} Statutory Sphere:</b>{" "}
          <span>{STATE_STATUTORY_RULES[selectedState]?.pt.note || "Standard PT rules apply."}</span>
          {" • "}
          <span>{STATE_STATUTORY_RULES[selectedState]?.lwf.note || "Standard LWF rules apply."}</span>
        </div>
      </div>

      {processedDeductions.length === 0 ? (
        <EmptyState
          title="No deductions configured"
          subtitle="Click 'Add Deduction Rule' to configure withholding parameters."
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
                    width: "95px",
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
                    Deduction Name {renderSortIcon("name")}
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
                  Category
                </th>
                <th
                  onClick={() => handleSort("thresholdValue")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--red, #dc2626)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    userSelect: "none",
                    background: "rgba(220, 38, 38, 0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Calculation Rate / Formula{" "}
                    {renderSortIcon("thresholdValue")}
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
                  Statutory Cap
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
              {pagedDeductions.map((item, idx) => {
                const isFixed = item.thresholdType === "fixed";

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom:
                        idx < pagedDeductions.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    {/* Priority */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
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
                        }}
                      >
                        #{item.priority}
                      </span>
                    </td>

                    {/* Name & Code */}
                    <td style={{ padding: "14px 16px" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text)",
                          fontSize: "13.5px",
                        }}
                      >
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--subtext)",
                          fontFamily: "monospace",
                        }}
                      >
                        {item.code}
                      </div>
                    </td>

                    {/* Category */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: item.category.includes("Statutory")
                            ? "#eff6ff"
                            : "#fef3c7",
                          color: item.category.includes("Statutory")
                            ? "#2563eb"
                            : "#d97706",
                          border: `1px solid ${item.category.includes("Statutory") ? "#bfdbfe" : "#fde68a"}`,
                        }}
                      >
                        {item.category}
                      </span>
                    </td>

                    {/* Calculation Rate */}
                    <td
                      style={{
                        padding: "14px 16px",
                        background: "rgba(220, 38, 38, 0.02)",
                      }}
                    >
                      {isFixed ? (
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 800,
                            color: "var(--red, #dc2626)",
                            fontFamily: "monospace",
                          }}
                        >
                          ₹{Number(item.thresholdValue).toLocaleString("en-IN")}
                          /mo
                        </span>
                      ) : (
                        <div>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 800,
                              color: "var(--red, #dc2626)",
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
                            of {item.percentageFrom}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Cap */}
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: "13px",
                        fontFamily: "monospace",
                        color: "var(--text)",
                      }}
                    >
                      {item.cap
                        ? `₹${Number(item.cap).toLocaleString("en-IN")}/mo`
                        : "No Cap (Full)"}
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

                    {/* Actions */}
                    <td style={{ padding: "14px 16px" }}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Pagination Controls */}
          {processedDeductions.length > PAGE_SIZE && (
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
                  {Math.min(processedDeductions.length, (safePage - 1) * PAGE_SIZE + 1)}
                </b>
                –
                <b style={{ color: "var(--text)" }}>
                  {Math.min(processedDeductions.length, safePage * PAGE_SIZE)}
                </b>{" "}
                of <b style={{ color: "var(--text)" }}>{processedDeductions.length}</b> deductions
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "6px 12px",
                    background: "var(--card)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: safePage === 1 ? "not-allowed" : "pointer",
                    opacity: safePage === 1 ? 0.5 : 1,
                  }}
                >
                  Prev
                </button>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
                  Page {safePage} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  style={{
                    padding: "6px 12px",
                    background: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: safePage === pageCount ? "not-allowed" : "pointer",
                    opacity: safePage === pageCount ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
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
              maxWidth: "480px",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text)",
                  margin: 0,
                }}
              >
                {editingItem ? "Edit Deduction Rule" : "Add Deduction Rule"}
              </h3>
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

            <form
              id="deduction-form"
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
                  Deduction Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Voluntary Provident Fund"
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
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
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
                    <option value="Statutory">Statutory</option>
                    <option value="Voluntary / Loan">Voluntary / Loan</option>
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
                    Priority (1, 2…)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
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
              </div>

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
                  Calculation Mode *
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
                    }}
                  >
                    <input
                      type="radio"
                      name="dThresholdType"
                      value="fixed"
                      checked={thresholdType === "fixed"}
                      onChange={() => setThresholdType("fixed")}
                    />
                    Fixed Amount (₹)
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="dThresholdType"
                      value="percentage"
                      checked={thresholdType === "percentage"}
                      onChange={() => setThresholdType("percentage")}
                    />
                    Percentage (%)
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
                      Fixed Amount (₹) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 200"
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
                        Percentage Rate (%) *
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 12"
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
                        <option value="Basic Salary">Basic Salary</option>
                        <option value="Gross Wages">Gross Wages</option>
                        <option value="Basic + DA">Basic + DA</option>
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: "4px",
                    }}
                  >
                    Maximum Statutory Cap (₹) (Optional)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 1800 (EPF cap)"
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
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
              </div>
            </form>

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
                form="deduction-form"
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
                Save Deduction Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Associated Employees – Deduction Impact Table ── */}
      <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={18} style={{ color: "var(--red, #dc2626)" }} />
              Associated Employees — Deduction Impact ({processedEmpList.length})
            </h3>
            <p style={{ fontSize: "12.5px", color: "var(--subtext)", margin: "3px 0 0" }}>
              Shows gross earnings, each applicable deduction, total withholding, and net take-home salary per employee.
            </p>
          </div>

          {/* Search bar */}
          <div style={{ position: "relative", minWidth: "220px", maxWidth: "320px", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search employee name, code, dept…"
              value={empSearch}
              onChange={(e) => { setEmpSearch(e.target.value); setEmpPage(1); }}
              style={{ width: "100%", height: "34px", padding: "0 10px 0 32px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "12.5px" }}
            />
            {empSearch && (
              <button onClick={() => { setEmpSearch(""); setEmpPage(1); }} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--subtext)", cursor: "pointer", padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {processedEmpList.length === 0 ? (
          <EmptyState title="No employees found" subtitle="No employees match your current search." />
        ) : (
          <>
            <div style={{ overflowX: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", background: "var(--card)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", width: "40px" }}>#</th>
                    <th onClick={() => handleEmpSort("name")} style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center" }}>Employee {renderEmpSortIcon("name")}</div>
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>Dept</th>
                    <th onClick={() => handleEmpSort("salary")} style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center" }}>Gross/mo {renderEmpSortIcon("salary")}</div>
                    </th>
                    {/* Dynamic deduction columns */}
                    {activeDeductions.map((ded) => (
                      <th key={ded.id} style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "var(--red, #dc2626)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", background: "rgba(220,38,38,0.03)", borderLeft: "1px solid var(--border)" }}
                        title={`${ded.thresholdType === "percentage" ? `${ded.thresholdValue}% of ${ded.percentageFrom}` : `Fixed ₹${ded.thresholdValue}`}${ded.cap ? ` (Cap ₹${ded.cap})` : ""}`}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span>{ded.name.replace(/\(.*?\)/g, "").trim()}</span>
                          <span style={{ fontSize: "9px", color: "var(--subtext)", fontWeight: 500, textTransform: "none" }}>
                            {ded.thresholdType === "percentage" ? `${ded.thresholdValue}%` : `₹${Number(ded.thresholdValue).toLocaleString("en-IN")}`}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "var(--red, #dc2626)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", borderLeft: "1px solid var(--border)" }}>
                      Total Deductions
                    </th>
                    <th style={{ padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "#059669", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", borderLeft: "2px solid var(--border)" }}>
                      Net Take-Home
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEmpList.map((emp, idx) => {
                    const isDaily = emp.salaryType === "Daily" || (Number(emp.dailyWageRate) > 0 && !emp.annualSalary);
                    const grossMonthly = isDaily
                      ? Number(emp.dailyWageRate || 750) * 26
                      : Math.round((Number(emp.annualSalary) || 300000) / 12);

                    let totalDed = 0;
                    const dedValues = activeDeductions.map((ded) => {
                      const val = calculateEmpDeduction(emp, ded, grossMonthly);
                      totalDed += val;
                      return { ded, val };
                    });
                    const netPay = Math.max(0, grossMonthly - totalDed);

                    return (
                      <tr key={emp.id}
                        style={{ borderBottom: idx < pagedEmpList.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.15s ease" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg, rgba(0,0,0,0.015))")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--subtext)", fontFamily: "monospace" }}>{(safeEmpPage - 1) * EMP_PAGE_SIZE + idx + 1}</td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "13px" }}>{emp.firstName} {emp.lastName}</div>
                          <div style={{ fontSize: "11px", color: "var(--subtext)", fontFamily: "monospace" }}>{emp.employeeCode || emp.id}</div>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "var(--text)", whiteSpace: "nowrap" }}>
                          {emp.department?.name || emp.department || "General"}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "12.5px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                          ₹{grossMonthly.toLocaleString("en-IN")}/mo
                        </td>
                        {dedValues.map(({ ded, val }) => (
                          <td key={ded.id} style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "12.5px", color: val > 0 ? "var(--red, #dc2626)" : "var(--subtext)", fontWeight: val > 0 ? 600 : 400, whiteSpace: "nowrap", borderLeft: "1px solid var(--border)", background: "rgba(220,38,38,0.015)" }}>
                            {val > 0 ? `₹${val.toLocaleString("en-IN")}` : <span style={{ opacity: 0.35 }}>—</span>}
                          </td>
                        ))}
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "var(--red, #dc2626)", whiteSpace: "nowrap", borderLeft: "1px solid var(--border)" }}>
                          ₹{totalDed.toLocaleString("en-IN")}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "13.5px", fontWeight: 800, color: "#059669", whiteSpace: "nowrap", borderLeft: "2px solid var(--border)", background: "rgba(5,150,105,0.04)" }}
                          title={`Gross ₹${grossMonthly.toLocaleString("en-IN")} - Deductions ₹${totalDed.toLocaleString("en-IN")} = Net ₹${netPay.toLocaleString("en-IN")}`}>
                          ₹{netPay.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {processedEmpList.length > EMP_PAGE_SIZE && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "16px", padding: "12px 16px", background: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "12.5px", color: "var(--subtext)" }}>
                  Showing <strong>{(safeEmpPage - 1) * EMP_PAGE_SIZE + 1}</strong>–<strong>{Math.min(safeEmpPage * EMP_PAGE_SIZE, processedEmpList.length)}</strong> of <strong>{processedEmpList.length}</strong> employees
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button onClick={() => setEmpPage((p) => Math.max(1, p - 1))} disabled={safeEmpPage <= 1} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)", color: safeEmpPage <= 1 ? "var(--subtext)" : "var(--text)", fontSize: "12.5px", fontWeight: 600, cursor: safeEmpPage <= 1 ? "not-allowed" : "pointer", opacity: safeEmpPage <= 1 ? 0.5 : 1 }}>
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", padding: "0 8px" }}>
                    {safeEmpPage} / {empPageCount}
                  </span>
                  <button onClick={() => setEmpPage((p) => Math.min(empPageCount, p + 1))} disabled={safeEmpPage >= empPageCount} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--card)", color: safeEmpPage >= empPageCount ? "var(--subtext)" : "var(--text)", fontSize: "12.5px", fontWeight: 600, cursor: safeEmpPage >= empPageCount ? "not-allowed" : "pointer", opacity: safeEmpPage >= empPageCount ? 0.5 : 1 }}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </section>
  );
}
