import { apiHandler, json, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { signUp } from '@/server/services/auth-service';

/** POST /api/v1/auth/register — create an account (same rules as the web sign-up). */
export const POST = apiHandler(async (request) => {
  const result = await signUp(await readJson(request), requestMetaFromHeaders(request.headers));
  return json(result, { status: 201 });
});
