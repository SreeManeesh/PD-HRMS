CREATE DATABASE hrms;
\connect hrms
\i /scripts/wizard-schema.sql
INSERT INTO organizations(id, name, legal_name, country_code, default_locale)
VALUES ('11111111-2222-4333-8444-555555555555', 'Proteccio HRMS', 'Proteccio Data Pvt Ltd', 'IN', 'en-IN')
ON CONFLICT (id) DO NOTHING;