const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function getKey() {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'cliptorwho-dev-key';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptText(value) {
  if (value == null || value === '') {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'enc',
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

function decryptText(value) {
  if (!value) {
    return null;
  }

  if (!String(value).startsWith('enc:')) {
    return String(value);
  }

  const [, version, ivB64, tagB64, encryptedB64] = String(value).split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted value format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

module.exports = {
  encryptText,
  decryptText,
};
