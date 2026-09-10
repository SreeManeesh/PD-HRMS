INSERT INTO organizations(name, legal_name, country_code) VALUES ('Proteccio Demo Organization','Proteccio Demo Organization Pvt Ltd','IN') ON CONFLICT DO NOTHING;

INSERT INTO regulations(code,name,jurisdiction,metadata) VALUES
('GDPR','General Data Protection Regulation','EU', '{"rights":["access","rectification","erasure","restriction","portability","objection"]}'),
('UK_GDPR','UK General Data Protection Regulation','United Kingdom', '{}'),
('DPDP','Digital Personal Data Protection Act 2023 + Rules','India', '{"concepts":["consent","notice","data_principal_rights"]}'),
('CCPA_CPRA','California Consumer Privacy Act / CPRA','California, USA', '{"employee_scope":true}'),
('LGPD','Lei Geral de Protecao de Dados','Brazil', '{}'),
('PIPL','Personal Information Protection Law','China', '{}'),
('SG_PDPA','Personal Data Protection Act','Singapore', '{}'),
('APPI','Act on the Protection of Personal Information','Japan', '{}'),
('PIPA_KR','Personal Information Protection Act','South Korea', '{}'),
('POPIA','Protection of Personal Information Act','South Africa', '{}'),
('UAE_PDPL','UAE Federal Decree-Law No. 45 of 2021','United Arab Emirates', '{}'),
('AU_PRIVACY','Privacy Act 1988','Australia', '{}')
ON CONFLICT(code) DO NOTHING;

INSERT INTO departments(organization_id,name)
SELECT id, x FROM organizations CROSS JOIN LATERAL unnest(ARRAY['Human Resources','Finance','Engineering','Operations','Sales']) AS x
ON CONFLICT DO NOTHING;

INSERT INTO designations(organization_id,name)
SELECT id, x FROM organizations CROSS JOIN LATERAL unnest(ARRAY['Associate','Senior Associate','Manager','Senior Manager','Director']) AS x
ON CONFLICT DO NOTHING;

INSERT INTO locations(organization_id,name,state_code,country_code)
SELECT id, x.name, x.state_code, 'IN' FROM organizations CROSS JOIN LATERAL (VALUES
('Hyderabad','TS'),('Bengaluru','KA'),('Mumbai','MH'),('Delhi NCR','DL'),('Pune','MH'),('Remote India','IN')
) AS x(name,state_code)
ON CONFLICT DO NOTHING;

INSERT INTO grades(organization_id,code,name)
SELECT id, x.code, x.name FROM organizations CROSS JOIN LATERAL (VALUES
('G1','Entry'),('G2','Professional'),('G3','Senior'),('G4','Lead'),('G5','Management')
) AS x(code,name)
ON CONFLICT DO NOTHING;

INSERT INTO consent_policies(code,title,description,purpose_text,data_fields,processing_category,legal_basis,is_statutory,consent_type,requires_guardian,validity_period_days,required_on_onboarding,blocking,withdrawable,version,use_case,downstream_actions)
VALUES
('WORKFORCE_PROCESSING_NOTICE','Workforce data processing notice','Explains core employee-data processing and employment administration.','To administer employment, HR operations, payroll and workforce administration.','["identity","contact","employment","payroll"]','EMPLOYMENT','NOTICE_ONLY',true,'NOTICE_ACKNOWLEDGEMENT',false,NULL,true,false,false,'1.0','Core employment administration','["create_employee_profile","enable_hr_operations"]'),
('BGV_CONSENT','Background verification consent','Consent to verify employment, education and references where policy requires it.','To conduct pre-employment or periodic background verification.','["employment_history","education","references"]','BACKGROUND_CHECK','CONSENT',false,'DIGITAL_SIGNATURE',false,365,true,true,false,'1.0','Pre-employment and periodic background verification','["start_bgv"]'),
('AADHAAR_EKYC','Aadhaar e-KYC consent','Consent for Aadhaar-based verification when an enabled workflow requires it.','To perform an enabled Aadhaar e-KYC verification workflow.','["aadhaar_number"]','KYC','CONSENT',false,'OTP',false,365,false,false,false,'1.0','KYC verification','["start_ekyc"]'),
('BIOMETRIC_ATTENDANCE','Biometric attendance consent','Consent for biometric attendance where biometric attendance is enabled.','To capture and use biometric attendance data for workforce attendance.','["biometric_template"]','BIOMETRIC','CONSENT',false,'DIGITAL_SIGNATURE',false,NULL,false,false,false,'1.0','Biometric attendance','["enable_biometric_attendance"]'),
('HEALTH_OCCUPATIONAL','Occupational health processing','Consent for employee health data in occupational or pre-employment health workflows where required.','To process occupational health information for a defined employment-health purpose.','["health_records"]','HEALTH','CONSENT',false,'DIGITAL_SIGNATURE',false,365,false,false,false,'1.0','Occupational health / medical fitness','["enable_health_workflow"]'),
('REFERENCE_CHECK','Reference check consent','Consent to contact references or previous employers.','To perform employment reference verification.','["reference_contacts","employment_history"]','BACKGROUND_CHECK','CONSENT',false,'DIGITAL_SIGNATURE',false,365,false,false,false,'1.0','Reference verification','["contact_reference"]'),
('CREDIT_CHECK','Credit check consent','Consent for credit checks for roles where a documented policy permits it.','To obtain and assess credit information for an eligible role.','["credit_information"]','BACKGROUND_CHECK','CONSENT',false,'DIGITAL_SIGNATURE',false,365,false,false,false,'1.0','Role-based credit screening','["start_credit_check"]'),
('PHOTO_ID_INTRAnET','Employee photo use consent','Consent to use an employee photograph for approved internal identification or directory use.','To display the employee photograph in approved internal systems.','["photograph"]','EMPLOYMENT','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','ID card and internal directory','["publish_internal_photo"]'),
('MARKETING_INTERNAL','Internal optional communications','Optional communications such as newsletters or engagement campaigns.','To send optional internal communications not necessary for employment administration.','["personal_email","mobile"]','MARKETING','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Optional internal communications','["enable_marketing_messages"]'),
('WHATSAPP_SMS_PAYROLL','WhatsApp/SMS alerts','Optional payslip, attendance and workforce alerts through selected messaging channels.','To send selected HR alerts through WhatsApp/SMS.','["mobile"]','COMMUNICATION','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Payroll and attendance alerts','["enable_sms_whatsapp"]'),
('BYOD_DEVICE_MONITORING','BYOD device monitoring consent','Consent for defined device-management telemetry on employee-owned devices.','To collect defined device security telemetry for an approved BYOD control.','["device_id","security_telemetry"]','SECURITY','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','BYOD security monitoring','["enable_bydod_mdm"]'),
('LOCATION_SERVICES','Location services consent','Consent for location data in approved field-work attendance or safety workflows.','To collect location information for a defined field-work purpose.','["location"]','SECURITY','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Field attendance and safety','["enable_location_workflow"]'),
('AI_AUTOMATED_DECISIONING','AI-assisted HR processing notice/consent','Controls use of AI-assisted processing according to configured organizational and jurisdiction rules.','To perform the configured AI-assisted HR use case.','["employment_data","performance_data"]','AI_PROCESSING','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','AI-assisted HR decision support','["enable_ai_hr_workflow"]'),
('CCTV_WORKPLACE_NOTICE','Workplace CCTV notice','Notice of CCTV/video surveillance in designated areas.','To support workplace security and safety in designated monitored areas.','["video_footage"]','SECURITY','NOTICE_ONLY',false,'NOTICE_ACKNOWLEDGEMENT',false,NULL,true,false,false,'1.0','Workplace security monitoring','["record_cctv"]'),
('EMERGENCY_MEDICAL_DISCLOSURE','Emergency medical disclosure','Consent/authorization for limited emergency disclosure in configured workflows.','To disclose defined information during a genuine emergency to support immediate assistance.','["health_records","emergency_contact"]','EMERGENCY','VITAL_INTERESTS',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Emergency assistance','["enable_emergency_disclosure"]'),
('CROSS_BORDER_TRANSFER','Cross-border transfer consent','Consent/authorization for defined international transfers where the configured legal framework calls for it.','To transfer defined workforce data to approved cross-border recipients.','["employee_profile","documents"]','CROSS_BORDER','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','International HR processing','["enable_international_transfer"]'),
('GUARDIAN_CONSENT','Guardian consent','Verifiable guardian consent for workflows configured for a child/minor.','To obtain guardian authorization for processing requiring it.','["employee_profile","minor_data"]','EMPLOYMENT','CONSENT',false,'GUARDIAN',true,NULL,false,true,false,'1.0','Minor worker / intern workflow','["enable_minor_workflow"]'),
('EMPLOYEE_ANALYTICS','Employee analytics consent','Optional analytics and engagement processing under a configured purpose.','To perform approved employee analytics according to configured privacy controls.','["work_data","survey_data"]','ANALYTICS','CONSENT',false,'EXPLICIT_CHECKBOX',false,365,false,false,false,'1.0','Engagement and HR analytics','["enable_hr_analytics"]'),
('VOICE_RECORDING','Voice recording consent','Consent for recording calls, interviews or designated workforce interactions.','To record approved voice interactions for the specified purpose.','["voice_recording"]','SECURITY','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Interview/contact center recording','["enable_voice_recording"]'),
('EMPLOYEE_PUBLIC_PROFILE','Public employee profile consent','Optional publication of selected employee information on public-facing websites or profiles.','To publish approved employee profile information externally.','["display_name","photograph","job_title"]','MARKETING','CONSENT',false,'EXPLICIT_CHECKBOX',false,NULL,false,false,false,'1.0','Public profile / speaker profile','["publish_public_profile"]')
ON CONFLICT(code) DO NOTHING;

-- Attach every configurable policy to the baseline regulation pack; production deployments can narrow mappings per policy.
INSERT INTO consent_policy_regulations(consent_policy_id,regulation_id,rule_text)
SELECT cp.id, r.id, 'Review applicability and configured legal-basis rule before production use.'
FROM consent_policies cp CROSS JOIN regulations r
ON CONFLICT DO NOTHING;