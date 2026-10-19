import { fieldErrors, refreshTokenSchema } from '@tourneasy/shared';
import { apiHandler, json, readJson } from '@/server/lib/api';
import { validationError } from '@/server/lib/errors';
import { refreshMobileSession } from '@/server/services/session-service';

/** POST /api/v1/auth/refresh — rotate the refresh token, get a new access token. */
export const POST = apiHandler(async (request) => {
  const parsed = refreshTokenSchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return json(await refreshMobileSession(parsed.data.refreshToken));
});
