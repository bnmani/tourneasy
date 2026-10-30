import { prisma, Role } from '@tourneasy/db';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { currentStep, totpCode } from '../lib/totp';
import { checkMfaCode, confirmMfaSetup, hasMfa, mfaSetup, resetUserMfa } from './mfa-service';
import {
  addPasskey,
  passkeyLoginOptions,
  passkeyRegistrationOptions,
  relyingParty,
  removePasskey,
  verifyPasskeyLogin,
} from './passkey-service';
import { actorFromWebToken, createWebSession, pendingMfaSession } from './session-service';

beforeEach(resetDatabase);
afterEach(() => {
  delete process.env.TEST_ENFORCE_MFA;
});

const PASSWORD = 'correct horse battery staple';

async function person(...roles: Role[]) {
  const p = await createPlayer({ password: PASSWORD });
  for (const role of roles) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const session = await createWebSession(p.userId, meta, true);
  return { ...p, token: session.token, actor: () => actorFromWebToken(session.token) };
}

/** A software authenticator: an EC P-256 key that answers WebAuthn like a phone would. */
class VirtualAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly key: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  private counter = 0;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.key = privateKey;
    this.publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  private clientData(type: string, challenge: string) {
    const { origin } = relyingParty();
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  private authData(flags: number, extra: Uint8Array = new Uint8Array()) {
    const rpIdHash = createHash('sha256').update(relyingParty().rpID).digest();
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    return Buffer.concat([rpIdHash, Buffer.from([flags]), count, extra]);
  }

  register(challenge: string) {
    const cose = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, isoBase64URL.toBuffer(this.publicJwk.x)],
      [-3, isoBase64URL.toBuffer(this.publicJwk.y)],
    ]);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([
      Buffer.alloc(16), // AAGUID
      idLength,
      this.credentialId,
      Buffer.from(isoCBOR.encode(cose)),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(this.authData(0x45, attested))], // UP, UV, AT
      ]) as never,
    );
    const id = isoBase64URL.fromBuffer(this.credentialId);
    return {
      id,
      rawId: id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(this.clientData('webauthn.create', challenge)),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ['internal' as const],
      },
    };
  }

  login(challenge: string) {
    this.counter += 1;
    const authenticatorData = this.authData(0x05); // UP, UV
    const clientDataJSON = this.clientData('webauthn.get', challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]),
      this.key,
    );
    const id = isoBase64URL.fromBuffer(this.credentialId);
    return {
      id,
      rawId: id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        authenticatorData: isoBase64URL.fromBuffer(authenticatorData),
        signature: isoBase64URL.fromBuffer(signature),
      },
    };
  }
}

async function addOne(p: Awaited<ReturnType<typeof person>>, device = new VirtualAuthenticator()) {
  const actor = (await p.actor())!;
  const options = await passkeyRegistrationOptions(actor);
  const result = await addPasskey(actor, device.register(options.challenge), meta);
  return { device, ...result };
}

async function pendingLogin(userId: string) {
  const s = await createWebSession(userId, meta, false, { mfaPending: true });
  return (await pendingMfaSession(s.token))!;
}

describe('passkeys as the second step (D88)', () => {
  it('a passkey switches two-step login on, like the app', async () => {
    process.env.TEST_ENFORCE_MFA = '1';
    const admin = await person(Role.ADMIN);
    expect((await admin.actor())!.roles).not.toContain('ADMIN');

    const { codes } = await addOne(admin);
    expect(codes).toHaveLength(10);
    expect(await hasMfa(admin.userId)).toBe(true);
    const actor = (await admin.actor())!;
    expect(actor.mfaEnabled).toBe(true);
    expect(actor.roles).toContain('ADMIN');

    // A second passkey adds no new recovery codes.
    expect((await addOne(admin)).codes).toBeNull();
    expect(await prisma.passkey.count({ where: { userId: admin.userId } })).toBe(2);
  });

  it('logs in with the passkey, once per challenge, and only with your own', async () => {
    const player = await person();
    const { device } = await addOne(player);
    const pending = await pendingLogin(player.userId);

    const options = await passkeyLoginOptions(pending);
    const answer = device.login(options.challenge);
    await verifyPasskeyLogin(pending, answer);
    const saved = await prisma.passkey.findFirstOrThrow({ where: { userId: player.userId } });
    expect(saved.counter).toBe(1n);
    expect(saved.lastUsedAt).not.toBeNull();
    // The same answer again: the challenge is used up.
    await expect(verifyPasskeyLogin(pending, answer)).rejects.toMatchObject({
      code: 'passkeyInvalid',
    });

    // Someone else's passkey doesn't log you in.
    const other = await person();
    const theirs = (await addOne(other)).device;
    const options2 = await passkeyLoginOptions(pending);
    await expect(
      verifyPasskeyLogin(pending, theirs.login(options2.challenge)),
    ).rejects.toMatchObject({ code: 'passkeyInvalid' });

    // An answer to a different challenge is refused.
    await passkeyLoginOptions(pending);
    await expect(
      verifyPasskeyLogin(pending, device.login('not-the-challenge')),
    ).rejects.toMatchObject({ code: 'passkeyInvalid' });
  });

  it('recovery codes work without the app; removing the last passkey turns it off', async () => {
    const player = await person();
    const { codes } = await addOne(player);
    await expect(checkMfaCode(player.userId, codes![0]!, meta)).resolves.toEqual({
      recoveryUsed: true,
    });
    // No app: a 6-digit code is never accepted.
    await expect(checkMfaCode(player.userId, '123456', meta)).rejects.toMatchObject({
      code: 'mfaInvalid',
    });

    const actor = (await player.actor())!;
    const passkey = await prisma.passkey.findFirstOrThrow({ where: { userId: player.userId } });
    await expect(
      removePasskey(actor, passkey.id, { password: 'wrong password' }, meta),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
    await removePasskey(actor, passkey.id, { password: PASSWORD }, meta);
    expect(await hasMfa(player.userId)).toBe(false);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: player.userId } })).toBe(0);
  });

  it('adding the app next to a passkey keeps the recovery codes and devices', async () => {
    const player = await person();
    const { codes } = await addOne(player);
    const other = await createWebSession(player.userId, meta, true);
    const actor = (await player.actor())!;
    const secret = (await mfaSetup(actor)).secret.replace(/\s/g, '');
    expect(
      await confirmMfaSetup(actor, { code: totpCode(secret, currentStep()) }, meta),
    ).toBeNull();
    // The saved codes still work, and the other device is still signed in.
    await expect(checkMfaCode(player.userId, codes![1]!, meta)).resolves.toEqual({
      recoveryUsed: true,
    });
    expect(await actorFromWebToken(other.token)).not.toBeNull();
  });

  it("an owner's reset removes the passkeys too", async () => {
    const owner = await person(Role.OWNER);
    const player = await person();
    await addOne(player);
    await resetUserMfa((await owner.actor())!, player.userId, meta);
    expect(await prisma.passkey.count({ where: { userId: player.userId } })).toBe(0);
    expect(await hasMfa(player.userId)).toBe(false);
  });
});
