import { createHash, randomBytes } from 'node:crypto';

/** Unguessable opaque token (session cookie, email links, refresh tokens). 256 bits by default. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Tokens are stored only as SHA-256 hashes, so a database leak doesn't expose usable tokens.
 * (High-entropy random tokens don't need a slow hash.)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
