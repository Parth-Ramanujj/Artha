import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Google refresh tokens are long-lived account keys, so they are stored encrypted (AES-256-GCM).
 * The key comes from GOOGLE_TOKEN_ENCRYPTION_KEY; without it nothing is stored, so a token is never
 * written to the database in plain text.
 */
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not set, so Google accounts cannot be connected');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Stored Google token has an unknown format');
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
