/**
 * Passkeys as the second login step (D88): Face ID, Touch ID, Windows Hello, a phone or a
 * security key, instead of (or next to) the authenticator app. A passkey counts as two-step
 * login. The WebAuthn challenge is kept on the session that asked for it and used once.
 * Passkeys belong to the site's domain (APP_URL): ones made on the test site don't work on
 * the live site.
 */
import { prisma } from '@tourneasy/db';
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { enforce, LIMITS } from '../lib/rate-limit';
import { describeUserAgent, type RequestMeta } from '../lib/request-meta';
import {
  assertPassword,
  dropRecoveryCodesIfNoMethod,
  hasMfa,
  replaceRecoveryCodes,
} from './mfa-service';
import { type Actor, revokeAllSessions } from './session-service';

const MAX_PASSKEYS = 10;

/** The site the passkeys belong to: its host name and origin. */
export function relyingParty() {
  const url = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  return { rpID: url.hostname, origin: url.origin };
}

async function setChallenge(sessionId: string, challenge: string) {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { webauthnChallenge: challenge },
  });
}

/** Reads the session's challenge and clears it, so an answer can't be used twice. */
async function takeChallenge(sessionId: string): Promise<string> {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { webauthnChallenge: true },
  });
  const challenge = session?.webauthnChallenge;
  if (!challenge) throw new AppError('passkeyInvalid');
  const taken = await prisma.userSession.updateMany({
    where: { id: sessionId, webauthnChallenge: challenge },
    data: { webauthnChallenge: null },
  });
  if (taken.count !== 1) throw new AppError('passkeyInvalid');
  return challenge;
}

// ── Adding a passkey (security page) ─────────────────────────────────────────────────

export async function passkeyRegistrationOptions(actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: {
      email: true,
      name: true,
      passkeys: { select: { credentialId: true, transports: true } },
    },
  });
  if (user.passkeys.length >= MAX_PASSKEYS) throw new AppError('passkeyLimit');
  const { rpID } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName: 'Tourneasy',
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(actor.userId),
    attestationType: 'none',
    // The same device can't be added twice.
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await setChallenge(actor.sessionId, options.challenge);
  return options;
}

type AuthenticatorTransportFuture = NonNullable<
  RegistrationResponseJSON['response']['transports']
>[number];

/**
 * Saves the new passkey. When it is the first second step, the recovery codes come back (shown
 * once) and every other device is signed out, as when switching on the app.
 */
export async function addPasskey(
  actor: Actor,
  response: RegistrationResponseJSON,
  meta: RequestMeta,
): Promise<{ codes: string[] | null }> {
  await enforce(`mfa:${actor.userId}`, LIMITS.mfaPerUser);
  const expectedChallenge = await takeChallenge(actor.sessionId);
  const { rpID, origin } = relyingParty();
  const first = !(await hasMfa(actor.userId));
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    throw new AppError('passkeyInvalid');
  }
  if (!verification.verified || !verification.registrationInfo)
    throw new AppError('passkeyInvalid');
  const { credential } = verification.registrationInfo;
  if ((await prisma.passkey.count({ where: { userId: actor.userId } })) >= MAX_PASSKEYS)
    throw new AppError('passkeyLimit');
  await prisma.passkey.create({
    data: {
      userId: actor.userId,
      credentialId: credential.id,
      publicKey: new Uint8Array(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      name: describeUserAgent(meta.userAgent) ?? 'Passkey',
    },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.passkey.add',
    entityType: 'User',
    entityId: actor.userId,
    meta,
  });
  if (!first) return { codes: null };
  const codes = await replaceRecoveryCodes(actor.userId);
  await revokeAllSessions(actor.userId, actor.sessionId);
  return { codes };
}

/** Removes a passkey, with the password. The last second step going works like turning off. */
export async function removePasskey(
  actor: Actor,
  passkeyId: string,
  input: { password?: unknown },
  meta: RequestMeta,
) {
  await assertPassword(actor.userId, input.password);
  const removed = await prisma.passkey.deleteMany({
    where: { id: passkeyId, userId: actor.userId },
  });
  if (removed.count !== 1) throw new AppError('notFound');
  await dropRecoveryCodesIfNoMethod(actor.userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.passkey.remove',
    entityType: 'User',
    entityId: actor.userId,
    meta,
  });
}

// ── Logging in (after the password) ──────────────────────────────────────────────────

/** The question for the device, on the session waiting for its second step. */
export async function passkeyLoginOptions(pending: { sessionId: string; userId: string }) {
  const passkeys = await prisma.passkey.findMany({
    where: { userId: pending.userId },
    select: { credentialId: true, transports: true },
  });
  if (passkeys.length === 0) throw new AppError('passkeyInvalid');
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    allowCredentials: passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: 'preferred',
  });
  await setChallenge(pending.sessionId, options.challenge);
  return options;
}

/** Checks the device's answer; throws when it isn't one of this user's passkeys. */
export async function verifyPasskeyLogin(
  pending: { sessionId: string; userId: string },
  response: AuthenticationResponseJSON,
) {
  await enforce(`mfa:${pending.userId}`, LIMITS.mfaPerUser);
  const expectedChallenge = await takeChallenge(pending.sessionId);
  const passkey = await prisma.passkey.findFirst({
    where: { userId: pending.userId, credentialId: response.id },
  });
  if (!passkey) throw new AppError('passkeyInvalid');
  const { rpID, origin } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });
  } catch {
    throw new AppError('passkeyInvalid');
  }
  if (!verification.verified) throw new AppError('passkeyInvalid');
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });
}
