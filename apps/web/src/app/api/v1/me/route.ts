import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { deleteMyAccount } from '@/server/services/gdpr-service';
import { getMyAccount, updateMyProfile } from '@/server/services/profile-service';

/** GET /api/v1/me — my account and player profile. */
export const GET = apiHandler(async (request) => {
  return json(await getMyAccount(await requireApiActor(request)));
});

/** PATCH /api/v1/me — update my profile (full profile object, same rules as the web form). */
export const PATCH = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  await updateMyProfile(actor, await readJson(request), requestMetaFromHeaders(request.headers));
  return json(await getMyAccount(actor));
});

/** DELETE /api/v1/me — { password, confirm: true }; anonymises the account (GDPR). */
export const DELETE = apiHandler(async (request) => {
  await deleteMyAccount(await requireApiActor(request), await readJson(request));
  return new Response(null, { status: 204 });
});
