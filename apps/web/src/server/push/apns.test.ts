import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { apnsConfig, isDeadToken, providerToken } from './apns';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('apnsConfig', () => {
  it('is off without a key', () => {
    expect(apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' })).toBeNull();
  });

  it('reads a key written on one line with \\n', () => {
    const config = apnsConfig({
      APNS_KEY: pem.replace(/\n/g, '\\n'),
      APNS_KEY_ID: 'ABC123DEFG',
      APNS_TEAM_ID: '7J9CMK225U',
    });
    expect(config).toMatchObject({
      keyId: 'ABC123DEFG',
      teamId: '7J9CMK225U',
      bundleId: 'com.tourneasy.app',
      sandbox: false,
    });
    expect(config!.key).toContain('\n');
  });
});

describe('providerToken', () => {
  it('signs an ES256 JWT that Apple can check with the public key', () => {
    const config = {
      key: pem,
      keyId: 'KEY1234567',
      teamId: 'TEAM123456',
      bundleId: 'x',
      sandbox: true,
    };
    const token = providerToken(config, 1_800_000_000_000);
    const [header, claims, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature!, 'base64url'),
    );
    expect(ok).toBe(true);
  });
});

describe('isDeadToken', () => {
  it('forgets tokens Apple says are gone or wrong, keeps the rest', () => {
    expect(isDeadToken({ token: 'a', ok: false, status: 410 })).toBe(true);
    expect(isDeadToken({ token: 'a', ok: false, status: 400, reason: 'BadDeviceToken' })).toBe(
      true,
    );
    expect(isDeadToken({ token: 'a', ok: false, status: 429, reason: 'TooManyRequests' })).toBe(
      false,
    );
    expect(isDeadToken({ token: 'a', ok: false, status: 0, reason: 'network' })).toBe(false);
  });
});
