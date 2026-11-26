import { z } from 'zod';
import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { parseInput } from '@/server/lib/validation';
import {
  getMyPreferences,
  OPTIONAL_TYPES,
  saveMyPreferences,
} from '@/server/services/notification-service';
import {
  getMyPushPreferences,
  PUSH_TYPES,
  saveMyPushPreferences,
} from '@/server/services/push-service';
import type { Actor } from '@/server/services/session-service';

const switches = (types: readonly string[]) =>
  Object.fromEntries(types.map((type) => [type, z.boolean().optional()]));

/** Email kinds at the top level (as before); push kinds under `push`. */
const preferencesSchema = z
  .object({ ...switches(OPTIONAL_TYPES), push: z.object(switches(PUSH_TYPES)).strict().optional() })
  .strict();

async function current(actor: Actor) {
  const [data, push] = await Promise.all([getMyPreferences(actor), getMyPushPreferences(actor)]);
  return { data, push };
}

/**
 * GET /api/v1/me/notification-preferences — `data`: every optional email kind with on/off;
 * `push`: the push kinds for the mobile app.
 */
export const GET = apiHandler(async (request) => {
  return json(await current(await requireApiActor(request)));
});

/** PATCH /api/v1/me/notification-preferences — { TYPE: boolean, …, push?: { TYPE: boolean } }. */
export const PATCH = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  const { push, ...email } = parseInput(preferencesSchema, await readJson(request));
  await saveMyPreferences(actor, email);
  if (push) await saveMyPushPreferences(actor, push);
  return json(await current(actor));
});
