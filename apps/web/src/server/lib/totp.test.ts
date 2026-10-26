import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totpCode, verifyTotp } from './totp';

// RFC 6238 appendix B, SHA-1: secret "12345678901234567890".
const SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('totp (D78)', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(SECRET, Math.floor(1234567890 / 30))).toBe('005924');
    expect(new TextDecoder().decode(base32Decode(SECRET))).toBe('12345678901234567890');
  });

  it('accepts one step of drift and never the same step twice', () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(1234567890 / 30);
    expect(verifyTotp(SECRET, '005924', null, now)).toBe(step);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(SECRET, '005924', step, now)).toBeNull();
    expect(verifyTotp(SECRET, '12345', null, now)).toBeNull();
  });
});
