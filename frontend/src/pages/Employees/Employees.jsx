/**
 * Employees Page
 * Module 2 — Employee Management
 * Features: searchable/filterable table, Add Employee modal, status badges,
 *           click-through to employee profile (/employees/:id)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Filter, Users, Upload, Camera } from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import PageHeader from "../../components/shared/PageHeader.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import EmptyState from "../../components/shared/EmptyState.jsx";
import Modal from "../../components/shared/Modal.jsx";
import {
  getEmployees,
  updateEmployee,
  uploadEmployeePhoto,
  bulkUploadEmployees,
} from "../../services/employeeService.js";
import RegistrationWizardModal from "./RegistrationWizardModal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { departments, statuses } from "../../mock/employees.js";

const EMPLOYEE_STATUS_META = {
  Active:     { label: "Active",     color: "#16a34a", bg: "#f0fdf4" },
  "On Leave": { label: "On Leave",   color: "#d97706", bg: "#fffbeb" },
  Inactive:   { label: "Inactive",   color: "#64748b", bg: "#f8fafc" },
  Terminated: { label: "Terminated", color: "#dc2626", bg: "#fef2f2" },
};

// ─── Edit Employee Form ───────────────────────────────────────────────────────
function EditEmployeeModal({ employee, isOpen, onClose, onUpdated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", designation: "", department: "",
    state: "", country: "", annualSalary: "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (employee) {
      setForm({
        firstName: employee.firstName || "", lastName: employee.lastName || "", email: employee.email || "", designation: employee.designation || "", department: employee.department || "",
        state: employee.state || "", country: employee.country || "", annualSalary: employee.annualSalary ?? "",
      });
      setError("");
      setErrors({});
    }
  }, [employee]);

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
      await updateEmployee(employee.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        department: form.department,
        state: form.state.trim(),
        country: form.country.trim(),
        annualSalary: form.annualSalary ? Number(form.annualSalary) : undefined,
      });
      onUpdated();
      onClose();
      toast("Employee updated");
    } catch (err) {
      setError(err.message || "Could not update employee");
      toast(err.message || "Could not update employee", "error");
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

  return (
    <Modal isOpen={isOpen} title="Edit Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("First Name *", "firstName")}
          {field("Last Name *", "lastName")}
        </div>
        {field("Work Email *", "email", "email")}
        {field("Designation *", "designation")}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {field("State", "state")}
          {field("Country", "country")}
        </div>
        {field("Yearly Salary Package", "annualSalary", "number")}

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--label)" }}>Department *</label>
          <select
            value={form.department}
            onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
            style={{
              height: "38px", padding: "0 12px",
              border: `1px solid ${errors.department ? "var(--red)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "13.5px", color: "var(--text)",
              background: "var(--card)", outline: "none",
            }}
          >
            <option value="">Select department</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {errors.department && <span style={{ fontSize: "11px", color: "var(--red)" }}>{errors.department}</span>}
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
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Employees() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [page, setPage] = useState(1);
  const bulkInputRef = useRef(null);
  const photoInputRefs = useRef({});
  const PAGE_SIZE = 8;

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

  const handleBulkUpload = async (file) => {
    if (!file) return;
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await bulkUploadEmployees(formData);
      const result = res.data;
      setBulkResult({
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        skipped: result.skipped || [],
      });
      toast(`${result.createdCount} employee${result.createdCount !== 1 ? "s" : ""} imported${result.skippedCount ? ` · ${result.skippedCount} skipped` : ""}`);
      load();
    } catch (err) {
      setBulkResult(null);
      toast(err?.message || "Could not import employees", "error");
    } finally {
      setBulkUploading(false);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    }
  };

  const handlePhoto = async (emp, file) => {
    if (!file) return;
    setPhotoBusyId(emp.id);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await uploadEmployeePhoto(emp.id, formData);
      toast("Photo updated");
      load();
    } catch (err) {
      toast(err?.message || "Could not update photo", "error");
    } finally {
      setPhotoBusyId(null);
      photoInputRefs.current[emp.id] && (photoInputRefs.current[emp.id].value = "");
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
              <Upload size={16} /> {bulkUploading ? "Uploading…" : "Bulk Upload"}
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleBulkUpload(e.target.files?.[0])}
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
                    {["Employee", "Designation", "Department", "Location", "Type", "Status", "Joined", ...(role === "HR" ? ["Actions"] : [])].map((h) => (
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
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <img src={emp.avatar} alt={`${emp.firstName} ${emp.lastName}`}
                              style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)", display: "block" }} />
                            {role === "HR" && (
                              <>
                                <button
                                  title="Change photo"
                                  onClick={(e) => { e.stopPropagation(); photoInputRefs.current[emp.id]?.click(); }}
                                  style={{
                                    position: "absolute", right: "-4px", bottom: "-4px",
                                    width: "18px", height: "18px", borderRadius: "50%",
                                    background: "var(--primary)", color: "#fff",
                                    border: "2px solid var(--card)", cursor: "pointer",
                                    display: "grid", placeItems: "center", padding: 0,
                                  }}
                                >
                                  {photoBusyId === emp.id ? (
                                    <span style={{ width: "8px", height: "8px", border: "1.5px solid #fff", borderTopColor: "transparent", borderRadius: "50%", display: "block" }} />
                                  ) : (
                                    <Camera size={10} />
                                  )}
                                </button>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  ref={(el) => (photoInputRefs.current[emp.id] = el)}
                                  onChange={(e) => handlePhoto(emp, e.target.files?.[0])}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </>
                            )}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--text)", lineHeight: 1.3 }}>
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p style={{ fontSize: "11.5px", color: "var(--subtext)" }}>{emp.id}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--text)" }}>{emp.designation}</td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--label)" }}>{emp.department}</td>
                      <td style={{ padding: "14px 16px", fontSize: "13.5px", color: "var(--label)" }}>{emp.location}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: "11.5px", color: emp.employmentType === "Contract" ? "var(--amber)" : "var(--label)", background: emp.employmentType === "Contract" ? "var(--amber-light)" : "var(--background)", padding: "2px 8px", borderRadius: "99px", fontWeight: 500 }}>
                          {emp.employmentType}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <StatusBadge {...(EMPLOYEE_STATUS_META[emp.status] || EMPLOYEE_STATUS_META.Active)} />
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "12.5px", color: "var(--subtext)", whiteSpace: "nowrap" }}>
                        {new Date(emp.joinDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      {role === "HR" && (
                        <td style={{ padding: "14px 16px" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setEditingEmployee(emp)}
                            style={{
                              padding: "6px 12px", background: "none", border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600,
                              color: "var(--text)", cursor: "pointer", transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.target.style.background = "var(--background)"; e.target.style.borderColor = "var(--primary)"; }}
                            onMouseLeave={(e) => { e.target.style.background = "none"; e.target.style.borderColor = "var(--border)"; }}
                          >
                            Edit
                          </button>
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

      <RegistrationWizardModal isOpen={showWizard} onClose={() => setShowWizard(false)} onRegistered={load} />
      <EditEmployeeModal isOpen={!!editingEmployee} employee={editingEmployee} onClose={() => setEditingEmployee(null)} onUpdated={load} />
    </MainLayout>
  );
}
