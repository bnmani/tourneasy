import { apiHandler, json, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { authenticate } from '@/server/services/auth-service';
import { createMobileSession } from '@/server/services/session-service';

/**
 * POST /api/v1/auth/token — log in with email or member number.
 * Body: { identifier, password, deviceName? } → { tokenType, accessToken, expiresIn, refreshToken }
 */
export const POST = apiHandler(async (request) => {
  const body = (await readJson(request)) as Record<string, unknown>;
  const meta = requestMetaFromHeaders(request.headers);
  const { userId } = await authenticate(body, meta);
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName : undefined;
  return json(await createMobileSession(userId, meta, deviceName));
});
