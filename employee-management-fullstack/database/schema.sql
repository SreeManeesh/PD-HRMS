BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE employment_type AS ENUM ('PERMANENT','CONTRACT','INTERN','CONSULTANT','PROBATION','TRAINEE');
CREATE TYPE employee_category AS ENUM ('WHITE_COLLAR','BLUE_COLLAR','FIELD','WORK_FROM_HOME');
CREATE TYPE employment_status AS ENUM ('ACTIVE','ON_NOTICE','RESIGNED','TERMINATED','RETIRED','INACTIVE','ON_LONG_LEAVE');
CREATE TYPE work_location_type AS ENUM ('OFFICE','REMOTE','HYBRID','CLIENT_SITE');
CREATE TYPE gender_code AS ENUM ('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY');
CREATE TYPE marital_status AS ENUM ('SINGLE','MARRIED','DIVORCED','WIDOWED');
CREATE TYPE tax_regime AS ENUM ('OLD','NEW');
CREATE TYPE account_type AS ENUM ('SAVINGS','CURRENT');
CREATE TYPE salary_payment_mode AS ENUM ('BANK_TRANSFER','CHEQUE','CASH');
CREATE TYPE verification_status AS ENUM ('PENDING','VERIFIED','REJECTED');
CREATE TYPE document_type AS ENUM ('AADHAAR','PAN','PASSPORT','PHOTOGRAPH','DEGREE','RELIEVING_LETTER','EXPERIENCE_LETTER','SALARY_SLIP','BANK_PROOF','ADDRESS_PROOF','OTHER');
CREATE TYPE consent_status AS ENUM ('PENDING','GRANTED','DENIED','WITHDRAWN','EXPIRED');
CREATE TYPE consent_type AS ENUM ('EXPLICIT_CHECKBOX','OTP','DIGITAL_SIGNATURE','GUARDIAN','NOTICE_ACKNOWLEDGEMENT','VERBAL_RECORDED');
CREATE TYPE legal_basis AS ENUM ('CONSENT','CONTRACT','LEGAL_OBLIGATION','VITAL_INTERESTS','PUBLIC_TASK','LEGITIMATE_INTERESTS','NOTICE_ONLY');
CREATE TYPE consent_action AS ENUM ('CREATED','GRANTED','DENIED','WITHDRAWN','EXPIRED','RENEWED','VERSION_UPDATED','NOTIFIED','ACKNOWLEDGED','IMPACT_TRIGGERED');
CREATE TYPE processing_category AS ENUM ('EMPLOYMENT','PAYROLL','STATUTORY','KYC','BACKGROUND_CHECK','BIOMETRIC','HEALTH','MARKETING','ANALYTICS','SECURITY','COMMUNICATION','CROSS_BORDER','AI_PROCESSING','EMERGENCY');

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(250),
    country_code CHAR(2) NOT NULL DEFAULT 'IN',
    default_locale VARCHAR(10) NOT NULL DEFAULT 'en-IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    email VARCHAR(200) NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    roles JSONB NOT NULL DEFAULT '["HR_ADMIN"]'::jsonb,
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    account_locked BOOLEAN NOT NULL DEFAULT false,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, email)
);

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_code VARCHAR(20) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    last_name VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    date_of_birth DATE NOT NULL,
    gender gender_code NOT NULL,
    marital_status marital_status,
    blood_group VARCHAR(5),
    nationality VARCHAR(50) NOT NULL DEFAULT 'India',
    aadhaar_ciphertext TEXT,
    aadhaar_last4 CHAR(4),
    pan_ciphertext TEXT,
    pan_masked VARCHAR(10),
    passport_number_ciphertext TEXT,
    passport_expiry DATE,
    photograph_url TEXT,
    disability_flag BOOLEAN NOT NULL DEFAULT false,
    disability_type VARCHAR(100),
    religion VARCHAR(50),
    government_category VARCHAR(20),
    blood_donor BOOLEAN NOT NULL DEFAULT false,
    organ_donor BOOLEAN NOT NULL DEFAULT false,
    personal_mobile VARCHAR(20) NOT NULL,
    personal_email VARCHAR(200) NOT NULL,
    official_email VARCHAR(200),
    official_mobile VARCHAR(20),
    emergency_contact_name VARCHAR(100) NOT NULL,
    emergency_contact_number VARCHAR(20) NOT NULL,
    emergency_contact_relation VARCHAR(40),
    status employment_status NOT NULL DEFAULT 'ACTIVE',
    user_id UUID REFERENCES users(id),
    record_version INTEGER NOT NULL DEFAULT 1,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_by UUID REFERENCES users(id),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    change_reason VARCHAR(500),
    UNIQUE (organization_id, employee_code)
);

CREATE TABLE employee_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('CURRENT','PERMANENT')),
    address_line1 VARCHAR(200) NOT NULL,
    address_line2 VARCHAR(200),
    city VARCHAR(50) NOT NULL,
    state_code VARCHAR(10) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'IN',
    address_proof_type VARCHAR(50),
    resided_since DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, address_type)
);

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    UNIQUE (organization_id, name)
);

CREATE TABLE designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    UNIQUE (organization_id, name)
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    state_code VARCHAR(10) NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'IN',
    UNIQUE (organization_id, name)
);

CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    UNIQUE (organization_id, code)
);

CREATE TABLE cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    UNIQUE (organization_id, code)
);

CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    start_time TIME,
    end_time TIME,
    UNIQUE (organization_id, name)
);

CREATE TABLE employee_job_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employment_type employment_type NOT NULL,
    employee_category employee_category,
    date_of_joining DATE NOT NULL,
    confirmation_date DATE,
    probation_period_months INTEGER,
    status employment_status NOT NULL DEFAULT 'ACTIVE',
    work_location_id UUID REFERENCES locations(id),
    work_location_type work_location_type,
    reporting_manager_id UUID REFERENCES employees(id),
    designation_id UUID REFERENCES designations(id),
    grade_id UUID REFERENCES grades(id),
    department_id UUID REFERENCES departments(id),
    sub_department VARCHAR(120),
    cost_center_id UUID REFERENCES cost_centers(id),
    business_unit VARCHAR(120),
    shift_id UUID REFERENCES shifts(id),
    weekly_offs JSONB NOT NULL DEFAULT '["SUNDAY"]'::jsonb,
    date_of_exit DATE,
    exit_reason VARCHAR(50),
    rehire_eligible BOOLEAN NOT NULL DEFAULT true,
    attendance_tracking_mode VARCHAR(30) NOT NULL DEFAULT 'WEB',
    notice_period_days INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE employee_statutory (
    employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    uan_number VARCHAR(12),
    pf_number VARCHAR(40),
    pf_applicable BOOLEAN NOT NULL DEFAULT false,
    pf_joining_date DATE,
    esic_number VARCHAR(10),
    esi_applicable BOOLEAN NOT NULL DEFAULT false,
    pt_state VARCHAR(10),
    pt_registration_number VARCHAR(80),
    lwf_applicable BOOLEAN NOT NULL DEFAULT false,
    tax_regime tax_regime NOT NULL DEFAULT 'NEW',
    pan_verified BOOLEAN NOT NULL DEFAULT false,
    aadhaar_pan_linked BOOLEAN NOT NULL DEFAULT false,
    tax_declaration_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    form16_delivery_mode VARCHAR(20),
    nomination_under_epf_done BOOLEAN NOT NULL DEFAULT false,
    eps_member BOOLEAN NOT NULL DEFAULT false,
    eps_previous_member_id VARCHAR(80),
    international_worker_flag BOOLEAN NOT NULL DEFAULT false,
    passport_country_of_origin VARCHAR(80),
    wc_policy_category VARCHAR(120),
    esic_dispensary VARCHAR(120),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    bank_name VARCHAR(150) NOT NULL,
    bank_account_ciphertext TEXT NOT NULL,
    bank_account_last4 CHAR(4),
    ifsc_code VARCHAR(11) NOT NULL,
    bank_branch VARCHAR(100),
    account_holder_name VARCHAR(100) NOT NULL,
    account_type account_type NOT NULL DEFAULT 'SAVINGS',
    salary_payment_mode salary_payment_mode NOT NULL DEFAULT 'BANK_TRANSFER',
    upi_id VARCHAR(200),
    penny_drop_verified BOOLEAN NOT NULL DEFAULT false,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (employee_id, is_primary) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE employee_family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    member_name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    date_of_birth DATE,
    is_dependent BOOLEAN NOT NULL DEFAULT false,
    dependent_for_insurance BOOLEAN NOT NULL DEFAULT false,
    aadhaar_ciphertext TEXT,
    aadhaar_last4 CHAR(4),
    nominee_flag BOOLEAN NOT NULL DEFAULT false,
    nomination_share_percent NUMERIC(5,2),
    guardian_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (nomination_share_percent IS NULL OR (nomination_share_percent >= 0 AND nomination_share_percent <= 100))
);

CREATE TABLE employee_education (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    highest_qualification VARCHAR(150),
    specialization VARCHAR(150),
    institution VARCHAR(200),
    year_of_passing INTEGER,
    grade_or_percentage NUMERIC(6,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    skill_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, skill_name)
);

CREATE TABLE employee_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    issuer VARCHAR(200),
    issued_on DATE,
    expires_on DATE,
    credential_id VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    language_name VARCHAR(100) NOT NULL,
    can_read BOOLEAN NOT NULL DEFAULT false,
    can_write BOOLEAN NOT NULL DEFAULT false,
    can_speak BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(employee_id, language_name)
);

CREATE TABLE employee_experience (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    previous_employer_name VARCHAR(200) NOT NULL,
    designation VARCHAR(150),
    from_date DATE,
    to_date DATE,
    last_drawn_salary NUMERIC(14,2),
    reason_for_leaving VARCHAR(300),
    previous_pf_number VARCHAR(80),
    relieving_letter_received BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    document_type document_type NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    object_key TEXT NOT NULL,
    document_number_ciphertext TEXT,
    issue_date DATE,
    expiry_date DATE,
    verification_status verification_status NOT NULL DEFAULT 'PENDING',
    verified_by UUID REFERENCES users(id),
    verified_on TIMESTAMPTZ,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    jurisdiction VARCHAR(120) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE consent_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(220) NOT NULL,
    description TEXT NOT NULL,
    purpose_text TEXT NOT NULL,
    data_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    processing_category processing_category NOT NULL,
    legal_basis legal_basis NOT NULL,
    is_statutory BOOLEAN NOT NULL DEFAULT false,
    consent_type consent_type NOT NULL,
    requires_guardian BOOLEAN NOT NULL DEFAULT false,
    validity_period_days INTEGER,
    required_on_onboarding BOOLEAN NOT NULL DEFAULT false,
    blocking BOOLEAN NOT NULL DEFAULT false,
    withdrawable BOOLEAN NOT NULL DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    use_case VARCHAR(180) NOT NULL,
    downstream_actions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE consent_policy_regulations (
    consent_policy_id UUID NOT NULL REFERENCES consent_policies(id) ON DELETE CASCADE,
    regulation_id UUID NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
    rule_text TEXT,
    PRIMARY KEY (consent_policy_id, regulation_id)
);

CREATE TABLE consent_policy_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_policy_id UUID NOT NULL REFERENCES consent_policies(id) ON DELETE CASCADE,
    language_code VARCHAR(10) NOT NULL,
    title VARCHAR(220) NOT NULL,
    purpose_text TEXT NOT NULL,
    description TEXT NOT NULL,
    UNIQUE(consent_policy_id, language_code)
);

CREATE TABLE employee_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    consent_policy_id UUID NOT NULL REFERENCES consent_policies(id),
    consent_version VARCHAR(20) NOT NULL,
    status consent_status NOT NULL DEFAULT 'PENDING',
    granted_on TIMESTAMPTZ,
    granted_by_type VARCHAR(30),
    granted_by_user_id UUID REFERENCES users(id),
    guardian_id UUID REFERENCES employee_family_members(id),
    consent_method consent_type,
    evidence_object_key TEXT,
    ip_address INET,
    device_info JSONB,
    geo_location JSONB,
    withdrawn_on TIMESTAMPTZ,
    withdrawal_reason VARCHAR(500),
    expires_on TIMESTAMPTZ,
    renewed_from_id UUID REFERENCES employee_consents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, consent_policy_id, consent_version)
);

CREATE TABLE consent_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_consent_id UUID NOT NULL REFERENCES employee_consents(id),
    action consent_action NOT NULL,
    action_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    action_by UUID REFERENCES users(id),
    action_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    device_info JSONB,
    previous_hash VARCHAR(64),
    record_hash VARCHAR(64) NOT NULL
);

CREATE TABLE employee_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    employee_id UUID REFERENCES employees(id),
    actor_user_id UUID REFERENCES users(id),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_org_status ON employees(organization_id, status) WHERE is_deleted = false;
CREATE INDEX idx_job_employee_effective ON employee_job_assignments(employee_id, effective_from DESC);
CREATE INDEX idx_consents_employee_status ON employee_consents(employee_id, status);
CREATE INDEX idx_consent_audit_consent_time ON consent_audit_log(employee_consent_id, action_timestamp DESC);
CREATE INDEX idx_employee_audit_employee_time ON employee_audit_log(employee_id, created_at DESC);

COMMIT;
