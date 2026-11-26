/**
 * Apple Push Notification service (APNs) over HTTP/2 with a token (.p8) key. Built on Node's
 * http2 and crypto, so no extra dependency. Configured by environment variables:
 *
 * - APNS_KEY        the .p8 file contents (newlines may be written as \n)
 * - APNS_KEY_ID     the key's 10-character id
 * - APNS_TEAM_ID    the Apple developer team id
 * - APNS_BUNDLE_ID  the app's bundle id (default com.tourneasy.app)
 * - APNS_SANDBOX=1  send to the development server (Xcode debug builds); TestFlight and the
 *                   App Store use the production server, which is the default
 *
 * Without APNS_KEY push is off and nothing is sent.
 */
import { createPrivateKey, sign } from 'node:crypto';
import http2 from 'node:http2';

export type ApnsConfig = {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  sandbox: boolean;
};

export function apnsConfig(
  env: Record<string, string | undefined> = process.env,
): ApnsConfig | null {
  const key = env.APNS_KEY?.replace(/\\n/g, '\n').trim();
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  if (!key || !keyId || !teamId) return null;
  return {
    key,
    keyId,
    teamId,
    bundleId: env.APNS_BUNDLE_ID?.trim() || 'com.tourneasy.app',
    sandbox: env.APNS_SANDBOX === '1',
  };
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** The signed JWT APNs expects; Apple accepts one for up to an hour, so it's reused for 50 min. */
let cached: { token: string; at: number; keyId: string } | null = null;

export function providerToken(config: ApnsConfig, now = Date.now()): string {
  if (cached && cached.keyId === config.keyId && now - cached.at < 50 * 60_000) {
    return cached.token;
  }
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.key),
    dsaEncoding: 'ieee-p1363',
  });
  const token = `${header}.${claims}.${base64url(signature)}`;
  cached = { token, at: now, keyId: config.keyId };
  return token;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Extra keys for the app, e.g. { url: '/tournaments/slug/schedule' }. */
  data?: Record<string, string>;
  /** Replaces an earlier notification with the same id on the phone. */
  collapseId?: string;
};

export type SendResult = { token: string; ok: boolean; status: number; reason?: string };

/**
 * Sends one message to each device token over a single connection. Never throws: failures
 * come back per token, so a bad token can't stop the others.
 */
export async function sendApns(
  config: ApnsConfig,
  tokens: string[],
  message: PushMessage,
): Promise<SendResult[]> {
  if (tokens.length === 0) return [];
  const host = config.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const payload = JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
    ...message.data,
  });
  let client: http2.ClientHttp2Session;
  try {
    client = http2.connect(host);
  } catch {
    return tokens.map((token) => ({ token, ok: false, status: 0, reason: 'connect' }));
  }
  client.on('error', () => {});
  const jwt = providerToken(config);
  const one = (token: string) =>
    new Promise<SendResult>((resolve) => {
      const request = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        ...(message.collapseId ? { 'apns-collapse-id': message.collapseId.slice(0, 64) } : {}),
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      request.setTimeout(10_000, () => request.close(http2.constants.NGHTTP2_CANCEL));
      request.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      request.on('data', (chunk) => (body += chunk));
      request.on('error', () => resolve({ token, ok: false, status: 0, reason: 'network' }));
      request.on('close', () => {
        let reason: string | undefined;
        try {
          reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
        } catch {
          reason = undefined;
        }
        resolve({ token, ok: status === 200, status, reason });
      });
      request.end(payload);
    });
  try {
    return await Promise.all(tokens.map(one));
  } finally {
    client.close();
  }
}

/** APNs answers that mean the token will never work again, so it should be forgotten. */
export function isDeadToken(result: SendResult): boolean {
  return (
    result.status === 410 ||
    (result.status === 400 &&
      (result.reason === 'BadDeviceToken' || result.reason === 'DeviceTokenNotForTopic'))
  );
}
