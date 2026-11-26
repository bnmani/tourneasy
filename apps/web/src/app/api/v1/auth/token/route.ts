import { apiHandler, json, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { authenticate } from '@/server/services/auth-service';
import { AppError } from '@/server/lib/errors';
import { checkMfaCode, mfaMethods } from '@/server/services/mfa-service';
import { finishMobilePasskeyLogin } from '@/server/services/passkey-service';
import { createMobileSession } from '@/server/services/session-service';

/**
 * POST /api/v1/auth/token — log in with email or member number.
 * Body: { identifier, password, code?, deviceName? } → { tokenType, accessToken, expiresIn, refreshToken }
 * With two-step login on (D78) the code is required: without it the answer is MFA_REQUIRED, so
 * the app can ask for it and send the same request again with the code. With a passkey the app
 * first calls /auth/passkey-options, then sends { passkey: { pendingId, response } } instead of
 * a code. Passkey-only accounts get MFA_APP_REQUIRED from apps that send neither.
 */
export const POST = apiHandler(async (request) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  const meta = requestMetaFromHeaders(request.headers);
  const { userId } = await authenticate(body, meta);
  const methods = await mfaMethods(userId);
  const passkey = body.passkey as { pendingId?: unknown; response?: unknown } | undefined;
  if (
    methods.passkeys > 0 &&
    passkey &&
    typeof passkey.pendingId === 'string' &&
    passkey.response
  ) {
    await finishMobilePasskeyLogin(
      userId,
      passkey.pendingId,
      passkey.response as Parameters<typeof finishMobilePasskeyLogin>[2],
    );
  } else if (methods.app || methods.passkeys > 0) {
    const code = typeof body.code === 'string' ? body.code : '';
    // `methods` tells the app what to offer: a code field, a passkey button, or both. Older
    // apps without passkeys get MFA_APP_REQUIRED for passkey-only accounts, as before (D88).
    if (!code) {
      const offer = { methods: { app: methods.app, passkey: methods.passkeys > 0 } };
      throw new AppError(methods.app ? 'mfaRequired' : 'mfaAppRequired', offer);
    }
    await checkMfaCode(userId, code, meta);
  }
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName : undefined;
  return json(await createMobileSession(userId, meta, deviceName));
});
