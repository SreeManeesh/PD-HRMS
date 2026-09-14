import crypto from 'node:crypto';
import { PoolClient } from 'pg';

export async function ensureEmployeeConsents(client: PoolClient, employeeId: string) {
  await client.query(`
    INSERT INTO employee_consents(employee_id, consent_policy_id, consent_version, status)
    SELECT $1, cp.id, cp.version, 'PENDING'::consent_status
    FROM consent_policies cp
    WHERE cp.active = true
    ON CONFLICT (employee_id, consent_policy_id, consent_version) DO NOTHING
  `, [employeeId]);
}

export function hashAudit(previousHash: string | null, payload: object) {
  return crypto.createHash('sha256').update(`${previousHash || ''}:${JSON.stringify(payload)}`).digest('hex');
}

export async function appendConsentAudit(client: PoolClient, employeeConsentId: string, action: string, details: object, actorUserId: string | null, reqMeta: {ip?: string, deviceInfo?: object}) {
  const prev = await client.query(`SELECT record_hash FROM consent_audit_log ORDER BY action_timestamp DESC LIMIT 1`);
  const previousHash = prev.rows[0]?.record_hash || null;
  const payload = { employeeConsentId, action, details, actorUserId, ip: reqMeta.ip || null, deviceInfo: reqMeta.deviceInfo || null };
  const recordHash = hashAudit(previousHash, payload);
  await client.query(`INSERT INTO consent_audit_log(employee_consent_id,action,action_by,action_details,ip_address,device_info,previous_hash,record_hash) VALUES($1,$2::consent_action,$3,$4,$5,$6,$7,$8)`, [employeeConsentId, action, actorUserId, details, reqMeta.ip || null, reqMeta.deviceInfo || {}, previousHash, recordHash]);
}
