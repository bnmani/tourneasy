/**
 * Encryption for secrets stored in the database (Stripe keys, D54): AES-256-GCM with a key
 * derived (HKDF) from SETTINGS_ENCRYPTION_KEY, or else AUTH_SECRET. The ciphertext names the
 * source it was made with, so adding SETTINGS_ENCRYPTION_KEY later doesn't break old values.
 * Changing that secret makes stored values unreadable: the admin then enters them again.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

type Source = 's' | 'a' | 'd';

function secretFor(source: Source): string | null {
  if (source === 's') return process.env.SETTINGS_ENCRYPTION_KEY ?? null;
  if (source === 'a') return process.env.AUTH_SECRET ?? null;
  // Development and tests only: a fixed key, never in production.
  return process.env.NODE_ENV === 'production' ? null : 'tourneasy-development-settings-key';
}

function currentSource(): Source | null {
  if ((process.env.SETTINGS_ENCRYPTION_KEY ?? '').length >= 32) return 's';
  if ((process.env.AUTH_SECRET ?? '').length >= 32) return 'a';
  return secretFor('d') ? 'd' : null;
}

function keyFor(source: Source): Buffer | null {
  const secret = secretFor(source);
  if (!secret) return null;
  return Buffer.from(hkdfSync('sha256', secret, 'tourneasy', 'settings-secret-box-v1', 32));
}

/** True when secrets can be stored (a server secret is configured). */
export function canEncrypt(): boolean {
  return currentSource() !== null;
}

export function encryptSecret(plain: string): string {
  const source = currentSource();
  const key = source && keyFor(source);
  if (!source || !key) throw new Error('No SETTINGS_ENCRYPTION_KEY or AUTH_SECRET configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    source,
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join(':');
}

/** Null when the value can't be decrypted (wrong or missing server secret, tampered data). */
export function decryptSecret(box: string): string | null {
  const [version, source, iv, tag, data] = box.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  const key = keyFor(source as Source);
  if (!key) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
