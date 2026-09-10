import crypto from 'node:crypto';

const algorithm = 'aes-256-gcm';
function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY is required for sensitive-data encryption');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return buf;
}

export function encrypt(value?: string | null) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decrypt(payload?: string | null) {
  if (!payload) return null;
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  const decipher = crypto.createDecipheriv(algorithm, key(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}
