const logger = require('./logger');
const crypto = require('crypto');

const RAW_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
const IS_PROD = process.env.NODE_ENV === 'production';

let KEY = null;
if (RAW_KEY) {
  try {
    if (/^[0-9a-fA-F]{64}$/.test(RAW_KEY)) {
      KEY = Buffer.from(RAW_KEY, 'hex');
    } else if (/^[A-Za-z0-9+/=]{40,}$/.test(RAW_KEY)) {
      const buf = Buffer.from(RAW_KEY, 'base64');
      if (buf.length === 32) KEY = buf;
    }
  } catch {
    KEY = null;
  }
}

if (!KEY) {
  if (IS_PROD) {
    logger.warn(
      '[cryptoTokens] WARNING: TOKEN_ENCRYPTION_KEY missing or invalid in production. ' +
      'Spotify tokens will be stored in plaintext. Set TOKEN_ENCRYPTION_KEY to a 32-byte hex string ' +
      '(generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").'
    );
  }
}

const PREFIX = 'enc:v1:';

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plaintext) {
  if (!plaintext) return '';
  if (!KEY) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  if (!KEY) {
    logger.warn('[cryptoTokens] Encrypted value present but no KEY configured — returning empty.');
    return '';
  }
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (err) {
    logger.error('[cryptoTokens] decrypt failed:', err.message);
    return '';
  }
}

module.exports = { encrypt, decrypt, isEncrypted, hasKey: () => !!KEY };
