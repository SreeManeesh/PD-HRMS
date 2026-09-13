/**
 * Employee Profile Page
 * Route: /employees/:id
 * Six tabs mirroring the registration wizard steps (Identity & Contact,
 * Employment & Organization, Statutory & Payroll, Family & Background,
 * Qualifications & Documents, Access, Consent & Review). Every tab is
 * editable and renders dynamically from the employee.wizardData snapshot
 * (the full payload captured when the employee was registered).
 */

import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Pencil, Save, X, Plus, Trash2,
  Mail, Phone, MapPin, Calendar, Building2, Briefcase,
  ShieldCheck, WalletCards, GraduationCap, Users, LockKeyhole,
  UserRound, ClipboardCheck, CircleCheck,
} from "lucide-react";
import MainLayout from "../../components/layout/MainLayout.jsx";
import StatusBadge from "../../components/shared/StatusBadge.jsx";
import Spinner from "../../components/shared/Spinner.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { getEmployee, updateEmployee } from "../../services/employeeService.js";
import { createConsentPolicy } from "../../services/consentService.js";
import InitialsAvatar from "../../components/shared/InitialsAvatar.jsx";

const EMPLOYEE_STATUS_META = {
  Active:     { label: "Active",     color: "#16a34a", bg: "#f0fdf4" },
  "On Leave": { label: "On Leave",   color: "#d97706", bg: "#fffbeb" },
  Inactive:   { label: "Inactive",   color: "#64748b", bg: "#f8fafc" },
  Terminated: { label: "Terminated", color: "#dc2626", bg: "#fef2f2" },
};

const TABS = [
  { id: "identity",      label: "Personal Information",  icon: UserRound },
  { id: "employment",    label: "Employment Details",    icon: Briefcase },
  { id: "statutory",     label: "Payroll",               icon: WalletCards },
  { id: "family",        label: "Family & Background",   icon: Users },
  { id: "qualifications",label: "Qualifications",        icon: GraduationCap },
  { id: "consents",      label: "Employee Consents",     icon: ShieldCheck },
];

const EMP_TYPES = ["PERMANENT", "CONTRACT", "INTERN", "CONSULTANT", "PROBATION", "TRAINEE", "Full-Time", "Part-Time"];
const EMP_CATS = ["WHITE_COLLAR", "BLUE_COLLAR", "FIELD", "WORK_FROM_HOME"];
const SKILL_TYPES = ["Skilled", "Semi Skilled", "Unskilled"];
const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
const MARITAL = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"];
const STATUSES = ["ACTIVE", "ON_NOTICE", "RESIGNED", "TERMINATED", "RETIRED", "INACTIVE", "ON_LONG_LEAVE"];
const LOC_TYPES = ["OFFICE", "REMOTE", "HYBRID", "CLIENT_SITE"];
const REGIMES = ["OLD", "NEW"];

const WZ_DEFAULTS = {
  employeeCode: "", firstName: "", middleName: "", lastName: "", dateOfBirth: "",
  gender: "", maritalStatus: "", bloodGroup: "", nationality: "", country: "",
  aadhaar: "", pan: "", passportNumber: "", passportExpiry: "",
  personalMobile: "", personalEmail: "", officialEmail: "", officialMobile: "",
  emergencyContactName: "", emergencyContactNumber: "", emergencyContactRelation: "",
  currentAddress: { line1: "", line2: "", city: "", stateCode: "", pincode: "", countryCode: "", proofType: "", since: "" },
  permanentAddress: { line1: "", line2: "", city: "", stateCode: "", pincode: "", countryCode: "", proofType: "", since: "" },
  job: {
    employmentType: "", employeeCategory: "", skillType: "", dateOfJoining: "",
    confirmationDate: "", probationMonths: "", status: "", workLocationType: "",
    designationId: "", departmentId: "", gradeId: "", subDepartment: "", businessUnit: "",
    attendanceTrackingMode: "", weeklyOffs: [], noticePeriodDays: "",
  },
  statutory: {
    uanNumber: "", pfNumber: "", pfApplicable: false, pfJoiningDate: "",
    esicNumber: "", esiApplicable: false, ptState: "", ptRegistrationNumber: "",
    lwfApplicable: false, taxRegime: "", taxDeclarationStatus: "", panVerified: false,
    aadhaarPanLinked: false, form16DeliveryMode: "", internationalWorkerFlag: false,
  },
  bank: {
    bankName: "", accountNumber: "", ifscCode: "", bankBranch: "",
    accountHolderName: "", accountType: "", salaryPaymentMode: "", upiId: "",
  },
  family: [], education: [], skills: [], certifications: [], languages: [], experience: [],
  consents: [], role: "EMPLOYEE",
};

function getAt(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setAt(obj, path, value) {
  const next = JSON.parse(JSON.stringify(obj ?? {}));
  const keys = path.split(".");
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return next;
}

function buildLocal(wizardData, emp) {
  const base = JSON.parse(JSON.stringify(WZ_DEFAULTS));
  const src = wizardData && typeof wizardData === "object" ? wizardData : {};
  const merged = { ...base, ...src };
  for (const key of Object.keys(base)) {
    if (base[key] && typeof base[key] === "object" && !Array.isArray(base[key]) && src[key] && typeof src[key] === "object") {
      merged[key] = { ...base[key], ...src[key] };
    }
  }
  merged.employeeCode = merged.employeeCode || emp.id || "";
  merged.firstName = merged.firstName || emp.firstName || "";
  merged.lastName = merged.lastName || emp.lastName || "";
  merged.personalEmail = merged.personalEmail || emp.email || "";
  merged.personalMobile = merged.personalMobile || emp.phone || "";
  merged.country = merged.country || emp.country || "";
  merged.job.employmentType = merged.job.employmentType || emp.employmentType || "";
  merged.job.skillType = merged.job.skillType || emp.skillType || "";
  merged.job.dateOfJoining = merged.job.dateOfJoining || emp.joinDate || "";
  merged.job.designationTitle = merged.job.designationTitle || "";
  merged.job.departmentTitle = merged.job.departmentTitle || "";
  return merged;
}

function Input({ label, value, onChange, type = "text", placeholder }) {
  const editing = useContext(EditCtx);
  const isEmpty = value === null || value === undefined || String(value).trim() === "";
  if (!editing && isEmpty) {
    return (
      <label className="ep-field">
        <span>{label}</span>
        <span className="ep-empty-value">-</span>
      </label>
    );
  }
  return (
    <label className="ep-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} placeholder={placeholder} readOnly={!editing} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }) {
  const editing = useContext(EditCtx);
  const isEmpty = value === null || value === undefined || String(value).trim() === "";
  if (!editing && isEmpty) {
    return (
      <label className="ep-field">
        <span>{label}</span>
        <span className="ep-empty-value">-</span>
      </label>
    );
  }
  return (
    <label className="ep-field">
      <span>{label}</span>
      <select value={value ?? ""} disabled={!editing} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const EditCtx = createContext(false);

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "4px 0" }}>
      <Icon size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>{label}</p>
        <p style={{ fontSize: "14.5px", fontWeight: 500, color: "var(--text)", marginTop: "3px", wordBreak: "break-word" }}>{value && String(value).trim() ? value : "-"}</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "30px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "16px" }}>
        <span style={{ width: "9px", height: "22px", borderRadius: "5px", background: "var(--primary)", flexShrink: 0 }} />
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", letterSpacing: "0.2px", margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Grid({ children, editing }) {
  const styleEditing = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" };
  const styleView = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" };
  return <div style={editing ? styleEditing : styleView}>{children}</div>;
}

function RowCard({ title, children }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "18px", padding: "18px", marginBottom: "14px", background: "var(--card)", boxShadow: "0 3px 12px rgba(15,23,42,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <strong style={{ fontSize: "13.5px", color: "var(--text)" }}>{title}</strong>
      </div>
      <Grid editing>{children}</Grid>
    </div>
  );
}

function fmt(v) {
  if (v == null || v === "") return "—";
  if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))) return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return String(v);
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [local, setLocal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("identity");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [addConsentOpen, setAddConsentOpen] = useState(false);
  const [addConsent, setAddConsent] = useState({ code: "", title: "", purposeText: "", legalBasis: "CONTRACT" });

  useEffect(() => {
    getEmployee(id)
      .then((res) => {
        setEmployee(res.data);
        setLocal(buildLocal(res.data?.wizardData, res.data ?? {}));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const wz = useMemo(() => (employee?.wizardData && typeof employee.wizardData === "object" ? employee.wizardData : null), [employee]);

  const setL = (path, value) => setLocal((p) => setAt(p, path, value));
  const enterEdit = () => { setEditing(true); setErrMsg(""); };
  const cancelEdit = () => { setLocal(buildLocal(employee?.wizardData, employee ?? {})); setEditing(false); setErrMsg(""); };

  const save = async () => {
    setSaving(true);
    setErrMsg("");
    try {
      const flat = {};
      if (local.job.designationTitle && local.job.designationTitle !== (employee.designation || "")) flat.designation = local.job.designationTitle;
      if (local.job.departmentTitle && local.job.departmentTitle !== (employee.department || "")) flat.department = local.job.departmentTitle;
      const payload = { ...flat, wizardData: local };
      await updateEmployee(id, payload);
      const res = await getEmployee(id);
      setEmployee(res.data);
      setLocal(buildLocal(res.data?.wizardData, res.data ?? {}));
      setEditing(false);
      setSaved("Saved successfully");
      setTimeout(() => setSaved(""), 2500);
    } catch (e) {
      setErrMsg(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <MainLayout><Spinner /></MainLayout>;
  if (error) return (
    <MainLayout>
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "var(--red)", fontWeight: 600 }}>{error}</p>
        <button onClick={() => navigate("/employees")} style={{ marginTop: "16px", padding: "9px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600 }}>
          Back to Employees
        </button>
      </div>
    </MainLayout>
  );

  const approvedCount = (local?.consents || []).filter((c) => c.status === "GRANTED").length;
  const consentTotal = Math.max((local?.consents || []).length, wz?.consents?.length || 0);

  return (
    <MainLayout>
      <div style={{ maxWidth: "1020px", margin: "0 auto" }}>
        <button
          onClick={() => navigate("/employees")}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--subtext)", fontSize: "13.5px", fontWeight: 500, marginBottom: "20px", padding: 0 }}
        >
          <ArrowLeft size={16} /> Back to Employees
        </button>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02) 45%, transparent), var(--card)",
            borderRadius: "22px", border: "1px solid var(--border)",
            boxShadow: "0 10px 34px rgba(15,23,42,0.08)", padding: "30px", display: "flex", gap: "22px",
            alignItems: "center", marginBottom: "22px", flexWrap: "wrap", position: "relative", overflow: "hidden",
          }}
        >
          <span style={{ position: "absolute", right: "-70px", top: "-70px", width: "190px", height: "190px", borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)", pointerEvents: "none" }} />
          <div style={{ padding: "5px", background: "#fff", borderRadius: "50%", boxShadow: "0 0 0 4px var(--primary-light), 0 8px 20px rgba(0,0,0,0.10)" }}>
            <InitialsAvatar firstName={employee.firstName} lastName={employee.lastName} size={86} borderWidth={3} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: "4px" }}>Employee Profile</p>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px", margin: 0 }}>{employee.firstName} {employee.lastName}</h1>
              <StatusBadge {...(EMPLOYEE_STATUS_META[employee.status] || EMPLOYEE_STATUS_META.Active)} />
            </div>
            <p style={{ fontSize: "14px", color: "var(--subtext)", marginBottom: "4px" }}>{employee.designation || "-"}</p>
            <p style={{ fontSize: "12.5px", color: "var(--label)" }}>{employee.department || "-"} · {employee.id}</p>
            {wz && (
              <p style={{ fontSize: "12px", color: "#16a34a", marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(22,163,74,0.08)", padding: "5px 10px", borderRadius: "999px", fontWeight: 600 }}>
                <CircleCheck size={13} /> Registration snapshot available · editable
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {saved && <span style={{ color: "var(--green)", fontWeight: 600, fontSize: "13px" }}>{saved}</span>}
            {errMsg && <span style={{ color: "var(--red)", fontWeight: 600, fontSize: "13px" }}>{errMsg}</span>}
            {editing ? (
              <>
                <button onClick={cancelEdit} disabled={saving} style={ghostBtn}><X size={15} /> Cancel</button>
                <button onClick={save} disabled={saving} style={primaryBtn}><Save size={15} /> {saving ? "Saving…" : "Save tab"}</button>
              </>
            ) : (
              <button onClick={enterEdit} style={primaryBtn}><Pencil size={15} /> Edit</button>
            )}
          </div>
        </div>

        <div style={{ display: "inline-flex", gap: "3px", borderRadius: "16px", background: "var(--background)", border: "1px solid var(--border)", padding: "6px", flexWrap: "nowrap", overflowX: "auto", maxWidth: "100%", marginBottom: "20px", scrollbarWidth: "thin" }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "9px 15px", border: "none", borderRadius: "11px", cursor: "pointer",
                  background: active ? "#ffffff" : "transparent", whiteSpace: "nowrap",
                  color: active ? "var(--primary)" : "var(--subtext)",
                  fontWeight: active ? 700 : 600, fontSize: "12.5px",
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  boxShadow: active ? "0 2px 8px rgba(0,0,0,0.10)" : "none",
                }}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        <EditCtx.Provider value={editing}>
        <div style={{ background: "var(--card)", borderRadius: "22px", border: "1px solid var(--border)", boxShadow: "0 6px 22px rgba(15,23,42,0.06)", padding: "32px", minHeight: "320px" }}>

          {activeTab === "identity" && (
            <>
              <Section title="Identity">
                <Grid editing={editing}>
                  <Input label="Employee code" value={local.employeeCode} onChange={(v) => setL("employeeCode", v)} />
                  <Input label="First name" value={local.firstName} onChange={(v) => setL("firstName", v)} />
                  <Input label="Middle name" value={local.middleName} onChange={(v) => setL("middleName", v)} />
                  <Input label="Last name" value={local.lastName} onChange={(v) => setL("lastName", v)} />
                  <Input label="Date of birth" type="date" value={local.dateOfBirth || undefined} onChange={(v) => setL("dateOfBirth", v)} />
                  <SelectInput label="Gender" value={local.gender} onChange={(v) => setL("gender", v)} options={GENDERS} />
                  <SelectInput label="Marital status" value={local.maritalStatus} onChange={(v) => setL("maritalStatus", v)} options={MARITAL} />
                  <Input label="Nationality" value={local.nationality} onChange={(v) => setL("nationality", v)} />
                  <Input label="Country" value={local.country} onChange={(v) => setL("country", v)} />
                  <Input label="PAN" value={local.pan} onChange={(v) => setL("pan", v)} />
                  <Input label="Aadhaar" value={local.aadhaar} onChange={(v) => setL("aadhaar", v)} />
                  <Input label="Passport number" value={local.passportNumber} onChange={(v) => setL("passportNumber", v)} />
                  <Input label="Passport expiry" type="date" value={local.passportExpiry || undefined} onChange={(v) => setL("passportExpiry", v)} />
                  {!editing &&
                    <>
                      <InfoRow icon={Mail} label="Email" value={local.personalEmail || employee.email} />
                      <InfoRow icon={Phone} label="Mobile" value={local.personalMobile || employee.phone} />
                    </>
                  }
                </Grid>
              </Section>
              <Section title="Contact & emergency">
                <Grid editing={editing}>
                  <Input label="Personal mobile" value={local.personalMobile} onChange={(v) => setL("personalMobile", v)} />
                  <Input label="Personal email" value={local.personalEmail} onChange={(v) => setL("personalEmail", v)} />
                  <Input label="Official email" value={local.officialEmail} onChange={(v) => setL("officialEmail", v)} />
                  <Input label="Official mobile" value={local.officialMobile} onChange={(v) => setL("officialMobile", v)} />
                  <Input label="Emergency contact" value={local.emergencyContactName} onChange={(v) => setL("emergencyContactName", v)} />
                  <Input label="Emergency number" value={local.emergencyContactNumber} onChange={(v) => setL("emergencyContactNumber", v)} />
                  {!editing && <InfoRow icon={Users} label="Emergency relation" value={local.emergencyContactRelation} />}
                  {editing && <Input label="Emergency relation" value={local.emergencyContactRelation} onChange={(v) => setL("emergencyContactRelation", v)} />}
                </Grid>
              </Section>
              <Section title="Addresses">
                {["currentAddress", "permanentAddress"].map((addrKey) => (
                  <div key={addrKey} style={{ marginBottom: "14px" }}>
                    <p style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>
                      {addrKey === "currentAddress" ? "Current address" : "Permanent address"}
                    </p>
                    <Grid editing={editing}>
                      <Input label="Address line 1" value={local[addrKey].line1} onChange={(v) => setL(`${addrKey}.line1`, v)} />
                      <Input label="Address line 2" value={local[addrKey].line2} onChange={(v) => setL(`${addrKey}.line2`, v)} />
                      <Input label="City" value={local[addrKey].city} onChange={(v) => setL(`${addrKey}.city`, v)} />
                      <Input label="State" value={local[addrKey].stateCode} onChange={(v) => setL(`${addrKey}.stateCode`, v)} />
                      <Input label="Pincode" value={local[addrKey].pincode} onChange={(v) => setL(`${addrKey}.pincode`, v)} />
                      <Input label="Country code" value={local[addrKey].countryCode} onChange={(v) => setL(`${addrKey}.countryCode`, v)} />
                    </Grid>
                  </div>
                ))}
              </Section>
            </>
          )}

          {activeTab === "employment" && (
            <Section title="Organization & employment">
              <Grid editing={editing}>
                <Input label="Designation" value={local.job.designationTitle || employee.designation} onChange={(v) => setL("job.designationTitle", v)} />
                <Input label="Department" value={local.job.departmentTitle || employee.department} onChange={(v) => setL("job.departmentTitle", v)} />
                <SelectInput label="Employment type" value={local.job.employmentType} onChange={(v) => setL("job.employmentType", v)} options={EMP_TYPES} />
                <SelectInput label="Employee category" value={local.job.employeeCategory} onChange={(v) => setL("job.employeeCategory", v)} options={EMP_CATS} />
                <SelectInput label="Skill type" value={local.job.skillType} onChange={(v) => setL("job.skillType", v)} options={SKILL_TYPES} />
                <Input label="Date of joining" type="date" value={local.job.dateOfJoining || undefined} onChange={(v) => setL("job.dateOfJoining", v)} />
                <Input label="Confirmation date" type="date" value={local.job.confirmationDate || undefined} onChange={(v) => setL("job.confirmationDate", v)} />
                <Input label="Probation (months)" type="number" value={local.job.probationMonths || ""} onChange={(v) => setL("job.probationMonths", v === "" ? "" : Number(v))} />
                <SelectInput label="Status" value={local.job.status} onChange={(v) => setL("job.status", v)} options={STATUSES} />
                <SelectInput label="Location type" value={local.job.workLocationType} onChange={(v) => setL("job.workLocationType", v)} options={LOC_TYPES} />
                <Input label="Sub-department" value={local.job.subDepartment} onChange={(v) => setL("job.subDepartment", v)} />
                <Input label="Business unit" value={local.job.businessUnit} onChange={(v) => setL("job.businessUnit", v)} />
                <Input label="Attendance mode" value={local.job.attendanceTrackingMode} onChange={(v) => setL("job.attendanceTrackingMode", v)} />
                <Input label="Notice period (days)" type="number" value={local.job.noticePeriodDays || ""} onChange={(v) => setL("job.noticePeriodDays", v === "" ? "" : Number(v))} />
                <Input label="Weekly offs (comma separated)" value={(local.job.weeklyOffs || []).join(", ")} onChange={(v) => setL("job.weeklyOffs", v.split(",").map((s) => s.trim()).filter(Boolean))} />
                {!editing && (
                  <>
                    <InfoRow icon={MapPin} label="Work location" value={employee.location} />
                    <InfoRow icon={Building2} label="Grade" value={local.job.gradeId} />
                  </>
                )}
              </Grid>
            </Section>
          )}

          {activeTab === "statutory" && (
            <>
              <Section title="Statutory & tax">
                <Grid editing={editing}>
                  <Input label="UAN" value={local.statutory.uanNumber} onChange={(v) => setL("statutory.uanNumber", v)} />
                  <Input label="PF member ID" value={local.statutory.pfNumber} onChange={(v) => setL("statutory.pfNumber", v)} />
                  <SelectInput label="PF applicable" value={String(local.statutory.pfApplicable)} onChange={(v) => setL("statutory.pfApplicable", v === "true")} options={["true", "false"]} />
                  <Input label="PF joining date" type="date" value={local.statutory.pfJoiningDate || undefined} onChange={(v) => setL("statutory.pfJoiningDate", v)} />
                  <Input label="ESI number" value={local.statutory.esicNumber} onChange={(v) => setL("statutory.esicNumber", v)} />
                  <SelectInput label="ESI applicable" value={String(local.statutory.esiApplicable)} onChange={(v) => setL("statutory.esiApplicable", v === "true")} options={["true", "false"]} />
                  <Input label="PT state" value={local.statutory.ptState} onChange={(v) => setL("statutory.ptState", v)} />
                  <SelectInput label="Tax regime" value={local.statutory.taxRegime} onChange={(v) => setL("statutory.taxRegime", v)} options={REGIMES} />
                  <Input label="Tax declaration" value={local.statutory.taxDeclarationStatus} onChange={(v) => setL("statutory.taxDeclarationStatus", v)} />
                </Grid>
              </Section>
              <Section title="Bank & payment">
                <Grid editing={editing}>
                  <Input label="Bank name" value={local.bank.bankName} onChange={(v) => setL("bank.bankName", v)} />
                  <Input label="Account number" value={local.bank.accountNumber} onChange={(v) => setL("bank.accountNumber", v)} />
                  <Input label="IFSC" value={local.bank.ifscCode} onChange={(v) => setL("bank.ifscCode", v)} />
                  <Input label="Branch" value={local.bank.bankBranch} onChange={(v) => setL("bank.bankBranch", v)} />
                  <Input label="Account holder" value={local.bank.accountHolderName} onChange={(v) => setL("bank.accountHolderName", v)} />
                  <Input label="Account type" value={local.bank.accountType} onChange={(v) => setL("bank.accountType", v)} />
                  <Input label="Salary payment mode" value={local.bank.salaryPaymentMode} onChange={(v) => setL("bank.salaryPaymentMode", v)} />
                  <Input label="UPI ID" value={local.bank.upiId} onChange={(v) => setL("bank.upiId", v)} />
                  {!editing && (
                    <>
                      <InfoRow icon={WalletCards} label="Yearly salary package" value={`₹${(employee.salary ?? 0).toLocaleString("en-IN")}`} />
                      <InfoRow icon={WalletCards} label="Monthly gross" value={`₹${Math.round((employee.salary ?? 0) / 12).toLocaleString("en-IN")}`} />
                    </>
                  )}
                </Grid>
              </Section>
            </>
          )}

          {activeTab === "family" && (
            <>
              <Section title="Family / nominees / dependents">
                {editing && (
                  <button
                    onClick={() => setL("family", [...(local.family || []), { memberName: "", relationship: "", dateOfBirth: "", isDependent: true, dependentForInsurance: false, aadhaar: "", nomineeFlag: false, nominationSharePercent: "", guardianName: "" }])}
                    style={{ ...primaryBtn, marginBottom: "14px" }}
                  >
                    <Plus size={15} /> Add family member
                  </button>
                )}
                {(local.family || []).length === 0 && !editing && <p style={{ color: "var(--subtext)", fontSize: "13.5px" }}>No family members recorded.</p>}
                {(local.family || []).map((m, i) => (
                  <RowCard key={i} title={`Member ${i + 1}`}>
                    <Input label="Member name" value={m.memberName} onChange={(v) => setL(`family.${i}.memberName`, v)} />
                    <Input label="Relationship" value={m.relationship} onChange={(v) => setL(`family.${i}.relationship`, v)} />
                    <Input label="Date of birth" type="date" value={m.dateOfBirth || undefined} onChange={(v) => setL(`family.${i}.dateOfBirth`, v)} />
                    <SelectInput label="Dependent" value={String(m.isDependent)} onChange={(v) => setL(`family.${i}.isDependent`, v === "true")} options={["true", "false"]} />
                    <SelectInput label="Nominee" value={String(m.nomineeFlag)} onChange={(v) => setL(`family.${i}.nomineeFlag`, v === "true")} options={["true", "false"]} />
                    <Input label="Nomination %" type="number" value={m.nominationSharePercent || ""} onChange={(v) => setL(`family.${i}.nominationSharePercent`, v === "" ? "" : Number(v))} />
                    <Input label="Guardian name" value={m.guardianName} onChange={(v) => setL(`family.${i}.guardianName`, v)} />
                    {editing && (
                      <button
                        onClick={() => setL("family", (local.family || []).filter((_, idx) => idx !== i))}
                        style={{ ...ghostBtn, alignSelf: "end", color: "var(--red)" }}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </RowCard>
                ))}
              </Section>
            </>
          )}

          {activeTab === "qualifications" && (
            <>
              <Section title="Education">
                {editing && (
                  <button
                    onClick={() => setL("education", [...(local.education || []), { highestQualification: "", specialization: "", institution: "", yearOfPassing: "", gradeOrPercentage: "" }])}
                    style={{ ...primaryBtn, marginBottom: "14px" }}
                  >
                    <Plus size={15} /> Add qualification
                  </button>
                )}
                {(local.education || []).length === 0 && !editing && <p style={{ color: "var(--subtext)", fontSize: "13.5px" }}>No education records.</p>}
                {(local.education || []).map((e, i) => (
                  <RowCard key={i} title={`Qualification ${i + 1}`}>
                    <Input label="Highest qualification" value={e.highestQualification} onChange={(v) => setL(`education.${i}.highestQualification`, v)} />
                    <Input label="Specialization" value={e.specialization} onChange={(v) => setL(`education.${i}.specialization`, v)} />
                    <Input label="Institution" value={e.institution} onChange={(v) => setL(`education.${i}.institution`, v)} />
                    <Input label="Passing year" type="number" value={e.yearOfPassing || ""} onChange={(v) => setL(`education.${i}.yearOfPassing`, v === "" ? "" : Number(v))} />
                    <Input label="Grade / percentage" value={e.gradeOrPercentage || ""} onChange={(v) => setL(`education.${i}.gradeOrPercentage`, v)} />
                    {editing && (
                      <button onClick={() => setL("education", (local.education || []).filter((_, idx) => idx !== i))} style={{ ...ghostBtn, alignSelf: "end", color: "var(--red)" }}>
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </RowCard>
                ))}
              </Section>
              <Section title="Skills">
                {editing && (
                  <button
                    onClick={() => setL("skills", [...(local.skills || []), ""])}
                    style={{ ...primaryBtn, marginBottom: "14px" }}
                  >
                    <Plus size={15} /> Add skill
                  </button>
                )}
                <Grid editing={editing}>
                  {(local.skills || []).map((s, i) => (
                    editing ? (
                      <div key={i} style={{ display: "flex", gap: "6px", alignItems: "end" }}>
                        <Input label={`Skill ${i + 1}`} value={s} onChange={(v) => setL(`skills.${i}`, v)} />
                        <button onClick={() => setL("skills", local.skills.filter((_, idx) => idx !== i))} style={{ padding: "9px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--red)" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <InfoRow key={i} icon={GraduationCap} label={`Skill ${i + 1}`} value={s} />
                    )
                  ))}
                  {(local.skills || []).length === 0 && !editing && <p style={{ color: "var(--subtext)", fontSize: "13.5px" }}>No skills recorded.</p>}
                </Grid>
              </Section>
              <Section title="Previous employment">
                {editing && (
                  <button
                    onClick={() => setL("experience", [...(local.experience || []), { previousEmployerName: "", designation: "", fromDate: "", toDate: "", lastDrawnSalary: "", reasonForLeaving: "", previousPfNumber: "", relievingLetterReceived: false }])}
                    style={{ ...primaryBtn, marginBottom: "14px" }}
                  >
                    <Plus size={15} /> Add experience
                  </button>
                )}
                {(local.experience || []).length === 0 && !editing && <p style={{ color: "var(--subtext)", fontSize: "13.5px" }}>No previous employment recorded.</p>}
                {(local.experience || []).map((e, i) => (
                  <RowCard key={i} title={`Experience ${i + 1}`}>
                    <Input label="Previous employer" value={e.previousEmployerName} onChange={(v) => setL(`experience.${i}.previousEmployerName`, v)} />
                    <Input label="Designation" value={e.designation} onChange={(v) => setL(`experience.${i}.designation`, v)} />
                    <Input label="From" type="date" value={e.fromDate || undefined} onChange={(v) => setL(`experience.${i}.fromDate`, v)} />
                    <Input label="To" type="date" value={e.toDate || undefined} onChange={(v) => setL(`experience.${i}.toDate`, v)} />
                    <Input label="Last drawn salary" type="number" value={e.lastDrawnSalary || ""} onChange={(v) => setL(`experience.${i}.lastDrawnSalary`, v === "" ? "" : Number(v))} />
                    <Input label="Reason for leaving" value={e.reasonForLeaving} onChange={(v) => setL(`experience.${i}.reasonForLeaving`, v)} />
                    {editing && (
                      <button onClick={() => setL("experience", (local.experience || []).filter((_, idx) => idx !== i))} style={{ ...ghostBtn, alignSelf: "end", color: "var(--red)" }}>
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </RowCard>
                ))}
              </Section>
              <Section title="Documents">
                <p style={{ color: "var(--subtext)", fontSize: "13px" }}>
                  Documents captured during registration (uploaded via the wizard) are managed separately in the employee document store.
                </p>
              </Section>
            </>
          )}

          {activeTab === "consents" && (
            <Section title="Access, consent & review">
              <Grid editing={false}>
                <InfoRow icon={LockKeyhole} label="Role" value={local.role || employee.role || "EMPLOYEE"} />
                <InfoRow icon={ClipboardCheck} label="Consents approved" value={`${approvedCount}${consentTotal ? ` of ${consentTotal}` : ""}`} />
              </Grid>
              <div style={{ marginTop: "18px" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Consent register</p>
                {role === "HR_ADMIN" && (
                  <button
                    onClick={() => setAddConsentOpen(true)}
                    style={{ marginBottom: "12px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: "13.5px" }}
                  >
                    <Plus size={16} /> Add consent type
                  </button>
                )}
                {(local.consents || []).length === 0 && <p style={{ color: "var(--subtext)", fontSize: "13.5px" }}>No consent decisions recorded.</p>}
                {local.consents.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "8px", background: "var(--background)" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.status === "GRANTED" ? "var(--green, #16a34a)" : "var(--subtext)" }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)" }}>{c.code}</p>
                      <p style={{ fontSize: "12px", color: "var(--subtext)" }}>{c.method || "—"}</p>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: c.status === "GRANTED" ? "var(--green, #16a34a)" : "var(--subtext)" }}>{c.status}</span>
                  </div>
                ))}
                {addConsentOpen && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }} onClick={() => setAddConsentOpen(false)}>
                    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "18px", padding: "22px", width: "min(460px, 100%)", boxShadow: "0 20px 50px rgba(15,23,42,0.18)" }} onClick={(e) => e.stopPropagation()}>
                      <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", marginBottom: "16px" }}>Add consent type</p>
                      {["code", "title"].map((f) => (
                        <label key={f} style={{ display: "block", marginBottom: "12px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{f === "code" ? "Code" : "Title"} *</span>
                          <input
                            value={consentDraft[f]}
                            onChange={(e) => setConsentDraft((p) => ({ ...p, [f]: e.target.value }))}
                            placeholder={f === "code" ? "e.g. EMPLOYEE_DIRECT_DEPOSIT" : "e.g. Direct deposit into personal account"}
                            style={{ width: "100%", marginTop: "5px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "14px", color: "var(--text)", background: "var(--background)" }}
                          />
                        </label>
                      ))}
                      <label style={{ display: "block", marginBottom: "12px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--subtext)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Legal basis</span>
                        <select value={consentDraft.legalBasis} onChange={(e) => setConsentDraft((p) => ({ ...p, legalBasis: e.target.value }))} style={{ width: "100%", marginTop: "5px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "14px", color: "var(--text)", background: "var(--background)" }}>
                          <option value="CONTRACT">Contract</option>
                          <option value="LEGAL_OBLIGATION">Legal obligation</option>
                          <option value="CONSENT">Consent</option>
                          <option value="LEGITIMATE_INTEREST">Legitimate interest</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer" }}>
                        <input type="checkbox" checked={consentDraft.isStatutory} onChange={(e) => setConsentDraft((p) => ({ ...p, isStatutory: e.target.checked }))} />
                        <span style={{ fontSize: "13.5px", color: "var(--text)" }}>Statutory (required even if employee withdraws)</span>
                      </label>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>
                        <button onClick={() => setAddConsentOpen(false)} style={{ padding: "9px 16px", border: "1px solid var(--border)", background: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "13.5px", color: "var(--subtext)" }}>Cancel</button>
                        <button disabled={creatingConsent || !consentDraft.code || !consentDraft.title} onClick={submitConsentDraft} style={{ padding: "9px 16px", border: "none", background: "var(--primary)", color: "#fff", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "13.5px" }}>{creatingConsent ? "Saving…" : "Add consent type"}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

        </div>
      </EditCtx.Provider>
      </div>
      <style>{`
          .ep-field { display: flex; flex-direction: column; gap: 6px; }
          .ep-field span { font-size: 10.5px; font-weight: 700; color: var(--subtext); text-transform: uppercase; letter-spacing: 0.5px; }
          .ep-field input, .ep-field select { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 14px; color: var(--text); background: var(--card); transition: border-color 0.15s, box-shadow 0.15s; }
          .ep-field input:focus, .ep-field select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.14); }
          .ep-field input[readonly], .ep-field select:disabled { border: none; background: transparent; padding: 4px 0; font-size: 14.5px; font-weight: 500; color: var(--text); cursor: default; opacity: 1; appearance: none; }
          .ep-field select:disabled { -webkit-appearance: none; }
          .ep-empty-value { font-size: 14.5px; font-weight: 500; color: var(--subtext); padding: 4px 0; }
        `}</style>
    </MainLayout>
  );
}

const primaryBtn = {
  padding: "9px 16px", background: "var(--primary)", color: "#fff", border: "none",
  borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: "13.5px",
  display: "inline-flex", alignItems: "center", gap: "6px",
};
const ghostBtn = {
  padding: "9px 16px", background: "none", color: "var(--subtext)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: "13.5px",
  display: "inline-flex", alignItems: "center", gap: "6px",
};