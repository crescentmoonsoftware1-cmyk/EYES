import crypto from 'node:crypto';

const PREFIX = 'enc:v1';
let hasWarnedMissingTokenKey = false;

function isProductionLike() {
  return process.env.NODE_ENV === 'production';
}

function handleMissingOrInvalidTokenKey(operation: 'encrypt' | 'decrypt') {
  if (isProductionLike()) {
    throw new Error(`TOKEN_ENCRYPTION_KEY is required to ${operation} OAuth tokens in production.`);
  }

  if (!hasWarnedMissingTokenKey) {
    hasWarnedMissingTokenKey = true;
    console.warn('[Token] TOKEN_ENCRYPTION_KEY is missing or invalid. Falling back to plaintext token handling in non-production mode.');
  }
}

function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  try {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) return null;
    return key;
  } catch {
    return null;
  }
}

export function encryptToken(value: string) {
  const key = getKey();
  if (!key) {
    handleMissingOrInvalidTokenKey('encrypt');
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptToken(value: string) {
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const key = getKey();
  if (!key) {
    handleMissingOrInvalidTokenKey('decrypt');
    throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt encrypted tokens.');
  }

  const [, , ivB64, payloadB64, tagB64] = value.split(':');
  if (!ivB64 || !payloadB64 || !tagB64) {
    throw new Error('Invalid encrypted token format.');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const payload = Buffer.from(payloadB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}
