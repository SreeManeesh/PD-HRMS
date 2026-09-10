import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { pool, withTx } from './db';
import { auth, hashPassword, issueToken, verifyPassword } from './auth';
import { employeeSchema, consentActionSchema } from './validators';
import { appendConsentAudit, ensureEmployeeConsents } from './consent';
import { encrypt } from './crypto';

const app = express();
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 300 }));

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 } });

app.get('/health', async (_req,res)=>{
  await pool.query('SELECT 1');
  res.json({ok:true, service:'employee-management-api'});
});

app.post('/api/auth/login', async (req,res)=>{
  const { organizationId, email, password } = req.body || {};
  const result = await pool.query(`SELECT * FROM users WHERE organization_id=$1 AND email=$2 AND account_locked=false`, [organizationId,email]);
  if (!result.rowCount) return res.status(401).json({message:'Invalid credentials'});
  const user = result.rows[0];
  if (!await verifyPassword(password,user.password_hash)) return res.status(401).json({message:'Invalid credentials'});
  const token = issueToken({userId:user.id,organizationId:user.organization_id,roles:user.roles});
  await pool.query('UPDATE users SET last_login=now() WHERE id=$1',[user.id]);
  res.json({token,user:{id:user.id,email:user.email,displayName:user.display_name,roles:user.roles}});
});

app.post('/api/auth/bootstrap', async (req,res)=>{
  const { organizationName, email, password, displayName } = req.body || {};
  const result = await withTx(async client=>{
    const org = await client.query(`INSERT INTO organizations(name) VALUES($1) RETURNING *`,[organizationName]);
    const passwordHash = await hashPassword(password);
    const user = await client.query(`INSERT INTO users(organization_id,email,password_hash,display_name,roles) VALUES($1,$2,$3,$4,'["HR_ADMIN"]'::jsonb) RETURNING id,email,display_name,roles,organization_id`,[org.rows[0].id,email,passwordHash,displayName]);
    return {org:org.rows[0],user:user.rows[0]};
  });
  res.json(result);
});

/**
 * Service-token mint used by the hosting HRMS backend to obtain a wizard JWT
 * for the embedded iframe. Guarded by AUTH_SERVICE_SECRET (shared with the
 * host, not exposed to the browser).
 */
app.post('/api/auth/service', async (req,res)=>{
  const { secret } = req.body || {};
  const configured = process.env.AUTH_SERVICE_SECRET || '';
  if (!configured || !secret || secret !== configured) {
    return res.status(401).json({ message: 'Invalid service secret' });
  }
  const org = (await pool.query('SELECT id FROM organizations ORDER BY created_at LIMIT 1')).rows[0];
  if (!org) return res.status(500).json({ message: 'No organization configured' });
  const token = issueToken({ userId: 'service', organizationId: org.id, roles: ['HR_ADMIN'] });
  res.json({ token });
});

/**
 * Anonymous wizard session mint. Lets the standalone wizard app operate
 * without a pre-shared token (dev/demo convenience). Guarded by
 * ALLOW_ANONYMOUS_WIZARD=true; when disabled (default) the wizard must be
 * embedded via the hosting HRMS, which supplies a real token via ?token=.
 */
app.post('/api/auth/wizard-session', async (_req,res)=>{
  if (process.env.ALLOW_ANONYMOUS_WIZARD !== 'true') {
    return res.status(403).json({ message: 'Anonymous wizard access is disabled' });
  }
  const org = (await pool.query('SELECT id FROM organizations ORDER BY created_at LIMIT 1')).rows[0];
  if (!org) return res.status(500).json({ message: 'No organization configured' });
  const token = issueToken({ userId: 'service', organizationId: org.id, roles: ['HR_ADMIN'] });
  res.json({ token });
});

app.get('/api/lookups', auth, async (req,res)=>{
  const organizationId = res.locals.auth.organizationId;
  const [departments,designations,locations,grades,costCenters,shifts] = await Promise.all([
    pool.query('SELECT * FROM departments WHERE organization_id=$1 ORDER BY name',[organizationId]),
    pool.query('SELECT * FROM designations WHERE organization_id=$1 ORDER BY name',[organizationId]),
    pool.query('SELECT * FROM locations WHERE organization_id=$1 ORDER BY name',[organizationId]),
    pool.query('SELECT * FROM grades WHERE organization_id=$1 ORDER BY code',[organizationId]),
    pool.query('SELECT * FROM cost_centers WHERE organization_id=$1 ORDER BY code',[organizationId]),
    pool.query('SELECT * FROM shifts WHERE organization_id=$1 ORDER BY name',[organizationId])
  ]);
  res.json({departments:departments.rows,designations:designations.rows,locations:locations.rows,grades:grades.rows,costCenters:costCenters.rows,shifts:shifts.rows});
});

app.get('/api/regulations', auth, async (_req,res)=>{ res.json((await pool.query('SELECT * FROM regulations WHERE enabled=true ORDER BY jurisdiction,name')).rows); });

app.get('/api/consents/catalog', auth, async (_req,res)=>{
  const result = await pool.query(`
    SELECT cp.*, COALESCE(json_agg(json_build_object('id',r.id,'code',r.code,'name',r.name,'jurisdiction',r.jurisdiction,'ruleText',cpr.rule_text)) FILTER (WHERE r.id IS NOT NULL),'[]') regulations
    FROM consent_policies cp LEFT JOIN consent_policy_regulations cpr ON cpr.consent_policy_id=cp.id LEFT JOIN regulations r ON r.id=cpr.regulation_id
    WHERE cp.active=true GROUP BY cp.id ORDER BY cp.required_on_onboarding DESC,cp.title
  `);
  res.json(result.rows);
});

app.post('/api/employees', auth, async (req,res)=>{
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Validation failed',issues:parsed.error.flatten()});
  const a = res.locals.auth;
  const actorId = a.userId === 'service' ? null : a.userId;
  try {
    const employee = await withTx(async client=>{
      const d = parsed.data;
      const emp = await client.query(`INSERT INTO employees(organization_id,employee_code,first_name,middle_name,last_name,display_name,date_of_birth,gender,marital_status,blood_group,nationality,aadhaar_ciphertext,aadhaar_last4,pan_ciphertext,pan_masked,passport_number_ciphertext,passport_expiry,photograph_url,disability_flag,disability_type,religion,government_category,blood_donor,organ_donor,personal_mobile,personal_email,official_email,official_mobile,emergency_contact_name,emergency_contact_number,emergency_contact_relation,created_by,modified_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::gender_code,$9::marital_status,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33) RETURNING id,*`,[
        a.organizationId,d.employeeCode,d.firstName,d.middleName,d.lastName,d.displayName || `${d.firstName} ${d.lastName}`,d.dateOfBirth,d.gender,d.maritalStatus,d.bloodGroup,d.nationality,encrypt(d.aadhaar),d.aadhaar?.slice(-4),encrypt(d.pan),d.pan ? `*****${d.pan.slice(-4)}`:null,encrypt(d.passportNumber),d.passportExpiry,d.photographUrl,d.disabilityFlag,d.disabilityType,d.religion,d.governmentCategory,d.bloodDonor,d.organDonor,d.personalMobile,d.personalEmail,d.officialEmail,d.officialMobile,d.emergencyContactName,d.emergencyContactNumber,d.emergencyContactRelation,actorId,actorId
      ]);
      const employeeId = emp.rows[0].id;
      await client.query(`INSERT INTO employee_addresses(employee_id,address_type,address_line1,address_line2,city,state_code,pincode,country_code,address_proof_type,resided_since) VALUES($1,'CURRENT',$2,$3,$4,$5,$6,$7,$8,$9),($1,'PERMANENT',$10,$11,$12,$13,$14,$15,$16,$17)`,[employeeId,d.currentAddress.line1,d.currentAddress.line2,d.currentAddress.city,d.currentAddress.stateCode,d.currentAddress.pincode,d.currentAddress.countryCode,d.currentAddress.proofType,d.currentAddress.since,d.permanentAddress.line1,d.permanentAddress.line2,d.permanentAddress.city,d.permanentAddress.stateCode,d.permanentAddress.pincode,d.permanentAddress.countryCode,d.permanentAddress.proofType,d.permanentAddress.since]);
      const job = d.job;
      await client.query(`INSERT INTO employee_job_assignments(employee_id,employment_type,employee_category,date_of_joining,confirmation_date,probation_period_months,status,work_location_id,work_location_type,reporting_manager_id,designation_id,grade_id,department_id,sub_department,cost_center_id,business_unit,shift_id,weekly_offs,date_of_exit,exit_reason,rehire_eligible,attendance_tracking_mode,notice_period_days,effective_from) VALUES($1,$2::employment_type,$3::employee_category,$4,$5,$6,$7::employment_status,$8,$9::work_location_type,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$4)`,[employeeId,job.employmentType,job.employeeCategory,job.dateOfJoining,job.confirmationDate,job.probationMonths,job.status,job.workLocationId,job.workLocationType,job.reportingManagerId,job.designationId,job.gradeId,job.departmentId,job.subDepartment,job.costCenterId,job.businessUnit,job.shiftId,job.weeklyOffs ? JSON.stringify(job.weeklyOffs) : null,job.dateOfExit,job.exitReason,job.rehireEligible,job.attendanceTrackingMode,job.noticePeriodDays]);
      await client.query(`INSERT INTO employee_statutory(employee_id,uan_number,pf_number,pf_applicable,pf_joining_date,esic_number,esi_applicable,pt_state,pt_registration_number,lwf_applicable,tax_regime,pan_verified,aadhaar_pan_linked,tax_declaration_status,form16_delivery_mode,nomination_under_epf_done,eps_member,eps_previous_member_id,international_worker_flag,passport_country_of_origin,wc_policy_category,esic_dispensary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::tax_regime,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,[employeeId,d.statutory.uanNumber,d.statutory.pfNumber,d.statutory.pfApplicable,d.statutory.pfJoiningDate,d.statutory.esicNumber,d.statutory.esiApplicable,d.statutory.ptState,d.statutory.ptRegistrationNumber,d.statutory.lwfApplicable,d.statutory.taxRegime,d.statutory.panVerified,d.statutory.aadhaarPanLinked,d.statutory.taxDeclarationStatus,d.statutory.form16DeliveryMode,d.statutory.nominationUnderEpfDone,d.statutory.epsMember,d.statutory.epsPreviousMemberId,d.statutory.internationalWorkerFlag,d.statutory.passportCountryOfOrigin,d.statutory.wcPolicyCategory,d.statutory.esicDispensary]);
      await client.query(`INSERT INTO employee_bank_accounts(employee_id,bank_name,bank_account_ciphertext,bank_account_last4,ifsc_code,bank_branch,account_holder_name,account_type,salary_payment_mode,upi_id,penny_drop_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8::account_type,$9::salary_payment_mode,$10,$11)`,[employeeId,d.bank.bankName,encrypt(d.bank.accountNumber),d.bank.accountNumber.slice(-4),d.bank.ifscCode.toUpperCase(),d.bank.bankBranch,d.bank.accountHolderName,d.bank.accountType,d.bank.salaryPaymentMode,d.bank.upiId,d.bank.pennyDropVerified]);
      for (const member of d.family) await client.query(`INSERT INTO employee_family_members(employee_id,member_name,relationship,date_of_birth,is_dependent,dependent_for_insurance,aadhaar_ciphertext,aadhaar_last4,nominee_flag,nomination_share_percent,guardian_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[employeeId,member.memberName,member.relationship,member.dateOfBirth,member.isDependent,member.dependentForInsurance,encrypt(member.aadhaar),member.aadhaar?.slice(-4),member.nomineeFlag,member.nominationSharePercent,member.guardianName]);
      for (const row of d.education) await client.query(`INSERT INTO employee_education(employee_id,highest_qualification,specialization,institution,year_of_passing,grade_or_percentage) VALUES($1,$2,$3,$4,$5,$6)`,[employeeId,row.highestQualification,row.specialization,row.institution,row.yearOfPassing,row.gradeOrPercentage]);
      for (const skill of d.skills) await client.query(`INSERT INTO employee_skills(employee_id,skill_name) VALUES($1,$2) ON CONFLICT DO NOTHING`,[employeeId,skill]);
      for (const row of d.certifications) await client.query(`INSERT INTO employee_certifications(employee_id,name,issuer,issued_on,expires_on,credential_id) VALUES($1,$2,$3,$4,$5,$6)`,[employeeId,row.name,row.issuer,row.issuedOn,row.expiresOn,row.credentialId]);
      for (const row of d.languages) await client.query(`INSERT INTO employee_languages(employee_id,language_name,can_read,can_write,can_speak) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[employeeId,row.languageName,row.canRead,row.canWrite,row.canSpeak]);
      for (const row of d.experience) await client.query(`INSERT INTO employee_experience(employee_id,previous_employer_name,designation,from_date,to_date,last_drawn_salary,reason_for_leaving,previous_pf_number,relieving_letter_received) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[employeeId,row.previousEmployerName,row.designation,row.fromDate,row.toDate,row.lastDrawnSalary,row.reasonForLeaving,row.previousPfNumber,row.relievingLetterReceived]);
      await ensureEmployeeConsents(client, employeeId);
      await client.query(`INSERT INTO employee_audit_log(organization_id,employee_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'CREATED','EMPLOYEE',$2,$4)`,[a.organizationId,employeeId,actorId,{source:'employee-wizard'}]);
      return emp.rows[0];
    });
    res.status(201).json({employee});
  } catch (error: any) {
    console.error(error?.message || error);
    res.status(500).json({message:error?.code === '23505' ? 'Employee code/email already exists' : 'Employee creation failed'});
  }
});

app.get('/api/employees/:id', auth, async(req,res)=>{
  const id=req.params.id;
  const a=res.locals.auth;
  const employee=(await pool.query('SELECT * FROM employees WHERE id=$1 AND organization_id=$2 AND is_deleted=false',[id,a.organizationId])).rows[0];
  if(!employee) return res.status(404).json({message:'Employee not found'});
  const [address,job,statutory,bank,family,education,skills,certifications,languages,experience,documents,consents] = await Promise.all([
    pool.query('SELECT * FROM employee_addresses WHERE employee_id=$1 ORDER BY address_type',[id]),
    pool.query('SELECT * FROM employee_job_assignments WHERE employee_id=$1 ORDER BY effective_from DESC',[id]),
    pool.query('SELECT * FROM employee_statutory WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_bank_accounts WHERE employee_id=$1 ORDER BY is_primary DESC',[id]),
    pool.query('SELECT * FROM employee_family_members WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_education WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_skills WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_certifications WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_languages WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_experience WHERE employee_id=$1',[id]),
    pool.query('SELECT * FROM employee_documents WHERE employee_id=$1 ORDER BY created_at DESC',[id]),
    pool.query(`SELECT ec.*,cp.code,cp.title,cp.purpose_text,cp.legal_basis,cp.blocking,cp.withdrawable,cp.use_case,cp.validity_period_days,cp.data_fields,cp.version FROM employee_consents ec JOIN consent_policies cp ON cp.id=ec.consent_policy_id WHERE ec.employee_id=$1 ORDER BY cp.title`,[id])
  ]);
  res.json({employee,addresses:address.rows,job:job.rows,statutory:statutory.rows[0] || null,bank:bank.rows,family:family.rows,education:education.rows,skills:skills.rows,certifications:certifications.rows,languages:languages.rows,experience:experience.rows,documents:documents.rows,consents:consents.rows});
});

app.get('/api/employees/:id/consents', auth, async(req,res)=>{
  const rows=await pool.query(`SELECT ec.*,cp.code,cp.title,cp.description,cp.purpose_text,cp.legal_basis,cp.is_statutory,cp.consent_type,cp.required_on_onboarding,cp.blocking,cp.withdrawable,cp.version,cp.use_case,cp.validity_period_days,cp.data_fields,cp.downstream_actions,COALESCE(json_agg(json_build_object('code',r.code,'name',r.name,'jurisdiction',r.jurisdiction,'ruleText',cpr.rule_text)) FILTER (WHERE r.id IS NOT NULL),'[]') regulations FROM employee_consents ec JOIN consent_policies cp ON cp.id=ec.consent_policy_id LEFT JOIN consent_policy_regulations cpr ON cpr.consent_policy_id=cp.id LEFT JOIN regulations r ON r.id=cpr.regulation_id WHERE ec.employee_id=$1 GROUP BY ec.id,cp.id ORDER BY cp.required_on_onboarding DESC,cp.title`,[req.params.id]);
  res.json(rows.rows);
});

async function consentMutation(req:any,res:any,newStatus:'GRANTED'|'DENIED'|'WITHDRAWN'|'EXPIRED',action:'GRANTED'|'DENIED'|'WITHDRAWN'|'EXPIRED'|'RENEWED'|'ACKNOWLEDGED') {
  const parsed=consentActionSchema.safeParse(req.body||{}); if(!parsed.success) return res.status(400).json({message:'Invalid consent payload'});
  const a=res.locals.auth; const employeeId=req.params.id; const consentId=req.params.consentId;
  const actorId = (a.userId && a.userId !== 'service') ? a.userId : null;
  try {
    const result=await withTx(async client=>{
      const row=await client.query(`SELECT ec.*,cp.*,e.organization_id FROM employee_consents ec JOIN consent_policies cp ON cp.id=ec.consent_policy_id JOIN employees e ON e.id=ec.employee_id WHERE ec.id=$1 AND ec.employee_id=$2 AND e.organization_id=$3 FOR UPDATE`,[consentId,employeeId,a.organizationId]);
      if(!row.rowCount) throw Object.assign(new Error('Consent not found'),{status:404});
      const ec=row.rows[0];
      if(newStatus==='WITHDRAWN' && !ec.withdrawable) throw Object.assign(new Error('This processing activity is not withdrawable'),{status:409});
      const expiresOn=(newStatus==='GRANTED' && ec.validity_period_days) ? new Date(Date.now()+ec.validity_period_days*86400000) : null;
      await client.query(`UPDATE employee_consents SET status=$1::consent_status,granted_on=CASE WHEN $1='GRANTED' THEN now() ELSE granted_on END,granted_by_type=CASE WHEN $1='GRANTED' THEN 'USER' ELSE granted_by_type END,granted_by_user_id=CASE WHEN $1='GRANTED' THEN $2 ELSE granted_by_user_id END,consent_method=COALESCE($3::consent_type,consent_method),guardian_id=COALESCE($4,guardian_id),withdrawn_on=CASE WHEN $1='WITHDRAWN' THEN now() ELSE withdrawn_on END,withdrawal_reason=CASE WHEN $1='WITHDRAWN' THEN $5 ELSE withdrawal_reason END,expires_on=COALESCE($6,expires_on),updated_at=now() WHERE id=$7`,[newStatus,actorId,parsed.data.method,parsed.data.guardianId,parsed.data.reason,expiresOn,consentId]);
      await appendConsentAudit(client,consentId,action,{status:newStatus,reason:parsed.data.reason || null,method:parsed.data.method || null},actorId,{ip:req.ip,deviceInfo:parsed.data.deviceInfo});
      if(action==='WITHDRAWN') await client.query(`INSERT INTO employee_audit_log(organization_id,employee_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'CONSENT_WITHDRAWN','CONSENT',$4,$5)`,[a.organizationId,employeeId,actorId,consentId,{downstreamActions:ec.downstream_actions}]);
      return (await client.query('SELECT * FROM employee_consents WHERE id=$1',[consentId])).rows[0];
    });
    res.json(result);
  } catch(error:any) { res.status(error.status || 500).json({message:error.message || 'Consent update failed'}); }
}

app.post('/api/employees/:id/consents/:consentId/grant',auth,(req,res)=>consentMutation(req,res,'GRANTED','GRANTED'));
app.post('/api/employees/:id/consents/:consentId/acknowledge',auth,(req,res)=>consentMutation(req,res,'GRANTED','ACKNOWLEDGED'));
app.post('/api/employees/:id/consents/:consentId/deny',auth,(req,res)=>consentMutation(req,res,'DENIED','DENIED'));
app.post('/api/employees/:id/consents/:consentId/withdraw',auth,(req,res)=>consentMutation(req,res,'WITHDRAWN','WITHDRAWN'));
app.post('/api/employees/:id/consents/:consentId/renew',auth,(req,res)=>consentMutation(req,res,'GRANTED','RENEWED'));

app.get('/api/employees/:id/readiness', auth, async(req,res)=>{
  const employeeId=req.params.id;
  const result=await pool.query(`SELECT cp.code,cp.title,cp.blocking,ec.status,ec.expires_on FROM employee_consents ec JOIN consent_policies cp ON cp.id=ec.consent_policy_id WHERE ec.employee_id=$1 AND cp.active=true ORDER BY cp.blocking DESC,cp.title`,[employeeId]);
  const missing=result.rows.filter((x:any)=>x.blocking && !['GRANTED'].includes(x.status));
  const expired=result.rows.filter((x:any)=>x.status==='GRANTED' && x.expires_on && new Date(x.expires_on)<new Date());
  res.json({ready:missing.length===0,blockingMissing:missing,expired,all:result.rows});
});

app.get('/api/employees/:id/audit', auth, async(req,res)=>{
  const employeeId=req.params.id;
  const rows=await pool.query(`SELECT id,action,entity_type,entity_id,details,created_at FROM employee_audit_log WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 100`,[employeeId]);
  const consent=await pool.query(`SELECT cal.* FROM consent_audit_log cal JOIN employee_consents ec ON ec.id=cal.employee_consent_id WHERE ec.employee_id=$1 ORDER BY cal.action_timestamp DESC LIMIT 200`,[employeeId]);
  res.json({employeeAudit:rows.rows,consentAudit:consent.rows});
});

app.post('/api/employees/:id/documents', auth, upload.single('file'), async(req,res)=>{
  if(!req.file) return res.status(400).json({message:'file is required'});
  const a=res.locals.auth;
  const uploadedBy = a.userId === 'service' ? null : a.userId;
  const { documentType, documentNumber, issueDate, expiryDate }=req.body;
  const objectKey=path.relative('.',req.file.path).replace(/\\/g,'/');
  const result=await pool.query(`INSERT INTO employee_documents(employee_id,document_type,file_name,object_key,document_number_ciphertext,issue_date,expiry_date,uploaded_by) SELECT $1,$2::document_type,$3,$4,$5,$6,$7,$8 WHERE EXISTS(SELECT 1 FROM employees WHERE id=$1 AND organization_id=$9) RETURNING *`,[req.params.id,documentType,req.file.originalname,objectKey,documentNumber,issueDate||null,expiryDate||null,uploadedBy,a.organizationId]);
  if(!result.rowCount) return res.status(404).json({message:'Employee not found'});
  res.status(201).json(result.rows[0]);
});

app.listen(Number(process.env.PORT || 4000),()=>console.log(`API listening on ${process.env.PORT || 4000}`));
