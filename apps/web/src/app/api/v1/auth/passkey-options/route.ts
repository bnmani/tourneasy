import { apiHandler, json, readJson } from '@/server/lib/api';
import { AppError } from '@/server/lib/errors';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { authenticate } from '@/server/services/auth-service';
import { mfaMethods } from '@/server/services/mfa-service';
import { startMobilePasskeyLogin } from '@/server/services/passkey-service';

/**
 * POST /api/v1/auth/passkey-options — { identifier, password } → { pendingId, options }.
 * The second login step with a passkey in the app: the phone signs `options` with Face ID or
 * Touch ID, then the app calls /auth/token again with { passkey: { pendingId, response } }.
 */
export const POST = apiHandler(async (request) => {
  const meta = requestMetaFromHeaders(request.headers);
  const { userId } = await authenticate(await readJson(request), meta);
  if ((await mfaMethods(userId)).passkeys === 0) throw new AppError('passkeyInvalid');
  return json(await startMobilePasskeyLogin(userId, meta));
});
