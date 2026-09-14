/**
 * Employees Page
 * Module 2 — Employee Management
 * Features: searchable/filterable table, Add Employee modal, status badges,
 *           click-through to employee profile (/employees/:id)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Filter, Users, Upload, MoreVertical, Trash2, RotateCcw, CheckCircle2, X } from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import Modal from "../../components/shared/Modal.jsx";
import ConfirmDialog from "../../components/shared/ConfirmDialog.jsx";
import InitialsAvatar from "../../components/shared/InitialsAvatar.jsx";
import {
  getEmployees,
  createEmployee,
  previewBulkEmployees,
  bulkUploadEmployees,
  undoBulkEmployees,
  deleteEmployee,
} from "../../services/employeeService.js";
import RegistrationWizardModal from "./RegistrationWizardModal.jsx";
import BulkImportPreviewModal from "./BulkImportPreviewModal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { departments, locations, employmentTypes, statuses, skillTypes, genders } from "../../mock/employees.js";

const EMPLOYEE_STATUS_META = {
  Active:     { label: "Active",     color: "#16a34a", bg: "#f0fdf4" },
  "On Leave": { label: "On Leave",   color: "#d97706", bg: "#fffbeb" },
  Inactive:   { label: "Inactive",   color: "#64748b", bg: "#f8fafc" },
  Terminated: { label: "Terminated", color: "#dc2626", bg: "#fef2f2" },
};

const dash = (v) => (v === null || v === undefined || String(v).trim() === "" ? "-" : v);

// ─── Add Employee Form ────────────────────────────────────────────────────────
function AddEmployeeModal({ employees, isOpen, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", gender: "", dob: "",
    designation: "", skillType: "", department: "", location: "", employmentType: "Full-Time",
    status: "Active", managerId: "", dateOfJoining: new Date().toISOString().slice(0, 10),
    state: "", country: "India", annualSalary: "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "Required";
    if (!form.lastName.trim()) e.lastName = "Required";
    if (!form.email.includes("@")) e.email = "Valid email required";
    if (!form.designation.trim()) e.designation = "Required";
    if (!form.department) e.department = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      await createEmployee({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        gender: form.gender.trim() || undefined,
        dob: form.dob ? String(form.dob).slice(0, 10) : undefined,
        designation: form.designation.trim(),
        skillType: form.skillType || undefined,
        department: form.department,
        location: form.location || undefined,
        employmentType: form.employmentType,
        status: form.status,
        managerId: form.managerId || undefined,
        dateOfJoining: form.dateOfJoining ? String(form.dateOfJoining).slice(0, 10) : undefined,
        state: form.state.trim() || undefined,
        country: form.country.trim() || undefined,
        annualSalary: form.annualSalary ? Number(form.annualSalary) : undefined,
      });
      onCreated?.();
      onClose();
      toast("Employee added successfully!");
      setForm({
        firstName: "", lastName: "", email: "", phone: "", gender: "", dob: "",
        designation: "", skillType: "", department: "", location: "", employmentType: "Full-Time",
        status: "Active", managerId: "", dateOfJoining: new Date().toISOString().slice(0, 10),
        state: "", country: "India", annualSalary: "",
      });
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Could not add employee";
      setError(msg);
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = "text") => (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        style={{
          height: "38px", padding: "0 12px",
          border: `1px solid ${errors[key] ? "var(--red)" : "var(--border)"}`,
          borderRadius: "var(--radius-sm)",
          fontSize: "13.5px", color: "var(--text)", outline: "none",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
        onBlur={(e) => (e.target.style.borderColor = errors[key] ? "var(--red)" : "var(--border)")}
      />
      {errors[key] && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors[key]}</span>}
    </div>
  );

  const select = (label, key, options, placeholder) => {
    const items = (options || []).map((o) => (typeof o === "object" && o !== null ? o : { value: o, label: String(o) }));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>{label}</label>
        <select
          value={form[key]}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          style={{
            height: "38px", padding: "0 12px",
            border: `1px solid ${errors[key] ? "var(--red)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            fontSize: "13.5px", color: "var(--text)",
            background: "var(--card)", outline: "none",
          }}
        >
          <option value="">{placeholder || `Select ${label.replace(" *", "")}`}</option>
          {items.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
        </select>
        {errors[key] && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors[key]}</span>}
      </div>
    );
  };

  const managerOptions = (employees || [])
    .map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName} (${m.id})` }));

  const designationOptions = [...new Set([
    "Software Engineer", "Senior Software Engineer", "Tech Lead", "Engineering Manager",
    "Product Manager", "HR Specialist", "HR Manager", "UI/UX Designer", "Accountant", "QA Engineer",
    ...(employees || []).map((e) => e.designation).filter(Boolean),
  ])].sort();

  return (
    <Modal isOpen={isOpen} title="Add New Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("First Name *", "firstName")}
          {field("Last Name *", "lastName")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("Work Email *", "email", "email")}
          {field("Phone", "phone")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {select("Gender", "gender", genders, "Select Gender")}
          {field("Date of Birth", "dob", "date")}
        </div>
        {select("Designation *", "designation", designationOptions, "Select Designation")}
        {select("Skill Type", "skillType", skillTypes, "Select Skill Type")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {select("Department *", "department", departments)}
          {select("Work Location", "location", locations, "Select Work Location")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {select("Employment Type", "employmentType", employmentTypes)}
          {select("Status", "status", statuses)}
        </div>
        {select("Reporting Manager", "managerId", managerOptions, "None")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("Date of Joining", "dateOfJoining", "date")}
          {field("Yearly Salary Package (₹)", "annualSalary", "number")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("State", "state")}
          {field("Country", "country")}
        </div>

        {error && (
          <div style={{ background: "var(--red-light)", color: "var(--red)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: "12.5px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "9px 20px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "none", color: "var(--label)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            style={{ padding: "9px 20px", border: "none", borderRadius: "var(--radius-sm)", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creating…" : "Create Employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Employees() {
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const canDelete = permissions.includes("employees:delete");
  const showActions = canDelete;
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [selectedBulkFile, setSelectedBulkFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [undoBatch, setUndoBatch] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const bulkInputRef = useRef(null);
  const PAGE_SIZE = 8;

  // 15-30s Undo countdown timer
  useEffect(() => {
    if (!undoBatch) return;
    const timer = setInterval(() => {
      setUndoBatch((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) return null;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [undoBatch?.batchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEmployees({ search, department: filterDept, status: filterStatus });
      setEmployees(res.data);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [search, filterDept, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Close the open row-actions menu when clicking anywhere outside it.
  useEffect(() => {
    const closeMenu = () => setMenuOpenFor(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEmployee(deleteTarget.id);
      toast(`${deleteTarget.firstName} ${deleteTarget.lastName} (${deleteTarget.id}) permanently deleted`);
      setDeleteTarget(null);
      setMenuOpenFor(null);
      load();
    } catch (err) {
      toast(err?.response?.data?.message || err?.message || "Could not delete employee", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkFileSelected = async (file) => {
    if (!file) return;
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await previewBulkEmployees(formData);
      setPreviewData(res.data);
      setSelectedBulkFile(file);
      setShowPreviewModal(true);
    } catch (err) {
      toast(err?.response?.data?.message || err?.message || "Could not parse spreadsheet", "error");
    } finally {
      setBulkUploading(false);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedBulkFile) return;
    setConfirmingImport(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedBulkFile);
      const res = await bulkUploadEmployees(formData);
      const result = res.data;

      setShowPreviewModal(false);
      setSelectedBulkFile(null);
      setPreviewData(null);
      load();

      if (result.createdCount > 0) {
        setBulkResult({
          createdCount: result.createdCount,
          skippedCount: result.skippedCount,
          skippedDuplicatesCount: result.skippedDuplicatesCount,
          skipped: result.skipped || [],
        });
        toast(`Successfully imported ${result.createdCount} employee${result.createdCount !== 1 ? "s" : ""}${result.skippedDuplicatesCount ? ` (${result.skippedDuplicatesCount} duplicate${result.skippedDuplicatesCount !== 1 ? "s" : ""} skipped)` : ""}`);

        if (result.batchId) {
          setUndoBatch({
            batchId: result.batchId,
            count: result.createdCount,
            skippedCount: result.skippedDuplicatesCount || 0,
            secondsLeft: 30,
          });
        }
      } else if (result.isAllDuplicates || result.skippedDuplicatesCount > 0) {
        toast(`Data is already present: all ${result.skippedDuplicatesCount} record(s) already exist in the system.`, "info");
      } else {
        toast("No valid new records were imported.", "warning");
      }
    } catch (err) {
      toast(err?.response?.data?.message || err?.message || "Could not import employees", "error");
    } finally {
      setConfirmingImport(false);
    }
  };

  const handleUndoImport = async () => {
    if (!undoBatch?.batchId || undoing) return;
    setUndoing(true);
    try {
      await undoBulkEmployees(undoBatch.batchId);
      toast(`Import undone: ${undoBatch.count} employee record${undoBatch.count !== 1 ? "s" : ""} removed`);
      setUndoBatch(null);
      setBulkResult(null);
      load();
    } catch (err) {
      toast(err?.response?.data?.message || err?.message || "Could not undo import", "error");
    } finally {
      setUndoing(false);
    }
  };

  const totalPages = Math.ceil(employees.length / PAGE_SIZE);
  const paginated  = employees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <PageHeader
          title="Employees"
          subtitle={`${employees.length} employee${employees.length !== 1 ? "s" : ""} found`}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              id="bulk-upload-btn"
              onClick={() => bulkInputRef.current?.click()}
              disabled={bulkUploading}
              title="Import 100+ employees from a spreadsheet (.xlsx, .csv, .tsv). Rows missing mandatory fields are skipped."
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 16px", background: "var(--card)", color: "var(--text)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                fontWeight: 600, fontSize: "13px", cursor: bulkUploading ? "wait" : "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <Upload size={16} /> {bulkUploading ? "Uploading…" : "Bulk Upload/Import"}
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleBulkFileSelected(e.target.files?.[0])}
            />
            <button
              id="add-employee-btn"
              onClick={() => setShowWizard(true)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "9px 16px", background: "var(--primary)", color: "#fff",
                border: "none", borderRadius: "var(--radius-sm)",
                fontWeight: 600, fontSize: "13px", cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
            >
              <Plus size={16} /> Add Employee
            </button>
          </div>
        </PageHeader>

        {bulkResult && (
          <div
            style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#16a34a" }}>
                  {bulkResult.createdCount} imported
                </span>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: bulkResult.skippedCount ? "#d97706" : "var(--subtext)" }}>
                  {bulkResult.skippedCount} skipped
                </span>
              </div>
              <button
                onClick={() => setBulkResult(null)}
                style={{ background: "none", border: "none", color: "var(--subtext)", cursor: "pointer", fontSize: "12.5px", fontWeight: 600 }}
              >
                Dismiss
              </button>
            </div>
            {bulkResult.skipped.length > 0 && (
              <div style={{ marginTop: "8px", maxHeight: "120px", overflowY: "auto" }}>
                {bulkResult.skipped.slice(0, 25).map((s, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "var(--subtext)", padding: "3px 0" }}>
                    Row {s.row}: {s.reason}
                  </div>
                ))}
                {bulkResult.skipped.length > 25 && (
                  <div style={{ fontSize: "12px", color: "var(--subtext)" }}>
                    … and {bulkResult.skipped.length - 25} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex", gap: "12px", marginBottom: "20px",
            flexWrap: "wrap", alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 260px", maxWidth: "380px" }}>
            <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--subtext)", pointerEvents: "none" }} />
            <input
              id="employee-search"
              type="text"
              placeholder="Search by name, email, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", height: "38px",
                paddingLeft: "36px", paddingRight: "12px",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                fontSize: "13.5px", color: "var(--text)", outline: "none",
                background: "var(--card)", transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          <Filter size={16} style={{ color: "var(--subtext)" }} />

          <select
            id="filter-department"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{ height: "38px", padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)", background: "var(--card)", outline: "none", cursor: "pointer" }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ height: "38px", padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "13.5px", color: "var(--text)", background: "var(--card)", outline: "none", cursor: "pointer" }}
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <Spinner />
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              subtitle="Try adjusting your search or filter criteria."
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Employee", "Designation", "Department", "Work Location", "Type", "Status", "Joined", ...(showActions ? ["Actions"] : [])].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "11px 16px", textAlign: "left",
                          fontSize: "11px", fontWeight: 700,
                          color: "var(--subtext)", textTransform: "uppercase",
                          letterSpacing: "0.5px", whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((emp, i) => (
                    <tr
                      key={emp.id}
                      onClick={() => navigate(`/employees/${emp.id}`)}
                      style={{
                        borderBottom: i < paginated.length - 1 ? "1px solid var(--border)" : "none",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--background)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      {/* Employee cell */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <InitialsAvatar firstName={emp.firstName} lastName={emp.lastName} size={34} />
                          <div>
                            <p style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--text)", lineHeight: 1.3 }}>
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p style={{ fontSize: "11.5px", color: "var(--subtext)" }}>{emp.id}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--text)" }}>{dash(emp.designation)}</td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--label)" }}>{dash(emp.department)}</td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--label)" }}>{dash(emp.location)}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: "11.5px", color: emp.employmentType === "Contract" ? "var(--amber)" : "var(--label)", background: emp.employmentType === "Contract" ? "var(--amber-light)" : "var(--background)", padding: "2px 8px", borderRadius: "99px", fontWeight: 500 }}>
                          {dash(emp.employmentType)}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <StatusBadge {...(EMPLOYEE_STATUS_META[emp.status] || EMPLOYEE_STATUS_META.Active)} />
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "12.5px", color: "var(--subtext)", whiteSpace: "nowrap" }}>
                        {emp.joinDate ? new Date(emp.joinDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                      </td>
{showActions && (
                        <td style={{ padding: "14px 16px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ position: "relative", display: "inline-block" }}>
                            <button
                              aria-label="Row actions"
                              onClick={() => setMenuOpenFor((cur) => (cur === emp.id ? null : emp.id))}
                              style={{
                                width: "32px", height: "32px", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)",
                                background: menuOpenFor === emp.id ? "var(--background)" : "none",
                                color: "var(--label)", cursor: "pointer",
                                display: "grid", placeItems: "center",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
                              onMouseLeave={(e) => { if (menuOpenFor !== emp.id) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--label)"; } }}
                            >
                              <MoreVertical size={16} />
                            </button>

                            {menuOpenFor === emp.id && (
                              <div
                                style={{
                                  position: "absolute", right: 0, top: "38px", zIndex: 20,
                                  background: "var(--card)", border: "1px solid var(--border)",
                                  borderRadius: "var(--radius-md)", boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
                                  minWidth: "168px", overflow: "hidden", padding: "6px",
                                }}
                              >
                                {canDelete && (
                                  <button
                                    onClick={() => { setMenuOpenFor(null); setDeleteTarget(emp); }}
                                    style={{
                                      display: "flex", alignItems: "center", gap: "9px", width: "100%",
                                      padding: "9px 12px", border: "none", background: "none",
                                      color: "var(--red)", fontSize: "13px", fontWeight: 500,
                                      cursor: "pointer", textAlign: "left", borderRadius: "var(--radius-sm)",
                                      transition: "background 0.12s",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-light)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                                  >
                                    <Trash2 size={14} /> Delete Employee
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && employees.length > PAGE_SIZE && (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 20px", borderTop: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: "12.5px", color: "var(--subtext)" }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, employees.length)} of {employees.length}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: "30px", height: "30px",
                      border: p === page ? "none" : "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: p === page ? "var(--primary)" : "none",
                      color: p === page ? "#fff" : "var(--label)",
                      fontWeight: p === page ? 700 : 400,
                      fontSize: "13px", cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <BulkImportPreviewModal
        isOpen={showPreviewModal}
        onClose={() => {
          if (!confirmingImport) {
            setShowPreviewModal(false);
            setSelectedBulkFile(null);
            setPreviewData(null);
          }
        }}
        fileName={selectedBulkFile?.name}
        previewData={previewData}
        onConfirm={handleConfirmImport}
        confirming={confirmingImport}
      />

      {/* Floating 15-30s Undo Banner */}
      {undoBatch && (
        <div
          id="bulk-import-undo-banner"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "var(--card)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2), 0 0 15px rgba(16, 185, 129, 0.15)",
            borderRadius: "14px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            animation: "fadeInUp 0.25s ease-out",
            maxWidth: "92vw",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "30px", height: "30px", borderRadius: "50%",
                background: "rgba(34, 197, 94, 0.15)", color: "#16a34a",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                Imported {undoBatch.count} employee{undoBatch.count !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--subtext)" }}>
                {undoBatch.skippedCount > 0 ? `${undoBatch.skippedCount} duplicate(s) skipped · ` : ""}
                Undo window expires in {undoBatch.secondsLeft}s
              </div>
            </div>
          </div>

          <button
            id="bulk-import-undo-btn"
            type="button"
            disabled={undoing}
            onClick={handleUndoImport}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "7px 14px", borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.1)", color: "#dc2626",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "12.5px", fontWeight: 700,
              cursor: undoing ? "wait" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#dc2626";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
              e.currentTarget.style.color = "#dc2626";
            }}
          >
            <RotateCcw size={14} style={{ animation: undoing ? "spin 1s linear infinite" : "none" }} />
            {undoing ? "Undoing…" : `Undo Import (${undoBatch.secondsLeft}s)`}
          </button>

          <button
            type="button"
            onClick={() => setUndoBatch(null)}
            title="Dismiss undo"
            style={{
              background: "none", border: "none", color: "var(--subtext)",
              cursor: "pointer", padding: "4px", display: "flex", alignItems: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <AddEmployeeModal isOpen={showAddModal} employees={employees} onClose={() => setShowAddModal(false)} onCreated={load} />
      <RegistrationWizardModal isOpen={showWizard} onClose={() => setShowWizard(false)} onRegistered={load} />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete employee"
        message={`Permanently delete ${deleteTarget?.firstName} ${deleteTarget?.lastName} (${deleteTarget?.id})? This removes the employee and all their records — attendance, leave, payroll, reviews and more — and can't be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete employee"}
        cancelLabel="Cancel"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </MainLayout>
  );
}
