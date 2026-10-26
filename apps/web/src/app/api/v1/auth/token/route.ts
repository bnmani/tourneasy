import { apiHandler, json, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { authenticate } from '@/server/services/auth-service';
import { AppError } from '@/server/lib/errors';
import { checkMfaCode, hasMfa } from '@/server/services/mfa-service';
import { createMobileSession } from '@/server/services/session-service';

/**
 * POST /api/v1/auth/token — log in with email or member number.
 * Body: { identifier, password, code?, deviceName? } → { tokenType, accessToken, expiresIn, refreshToken }
 * With two-step login on (D78) the code is required: without it the answer is MFA_REQUIRED, so
 * the app can ask for it and send the same request again with the code.
 */
export const POST = apiHandler(async (request) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  const meta = requestMetaFromHeaders(request.headers);
  const { userId } = await authenticate(body, meta);
  if (await hasMfa(userId)) {
    const code = typeof body.code === 'string' ? body.code : '';
    if (!code) throw new AppError('mfaRequired');
    await checkMfaCode(userId, code, meta);
  }
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName : undefined;
  return json(await createMobileSession(userId, meta, deviceName));
});
