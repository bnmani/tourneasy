import { z } from 'zod';
import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { parseInput } from '@/server/lib/validation';
import {
  getMyPreferences,
  OPTIONAL_TYPES,
  saveMyPreferences,
} from '@/server/services/notification-service';

const preferencesSchema = z
  .object(Object.fromEntries(OPTIONAL_TYPES.map((type) => [type, z.boolean().optional()])))
  .strict();

/** GET /api/v1/me/notification-preferences — every optional email kind with on/off. */
export const GET = apiHandler(async (request) => {
  return json({ data: await getMyPreferences(await requireApiActor(request)) });
});

/** PATCH /api/v1/me/notification-preferences — { TYPE: boolean, … }; returns the new list. */
export const PATCH = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  await saveMyPreferences(actor, parseInput(preferencesSchema, await readJson(request)));
  return json({ data: await getMyPreferences(actor) });
});
