/**
 * Public (no login) read API: query parameters and response shapes. Shared by the web pages,
 * the REST handlers, the OpenAPI document (/api/openapi.json) and later the mobile app.
 */
import { z } from 'zod';
import { DISCIPLINES } from './auth';
import { DRAW_TYPES, PROVINCES } from './admin';
import { TOURNAMENT_PHASES } from '../rules/tournament-phase';

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(values).optional());
const optionalSearch = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 80) : undefined),
  z.string().optional(),
);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const cursor = z.string().max(200).optional();

export const TOURNAMENT_WHEN = ['upcoming', 'open', 'past'] as const;

export const publicTournamentQuerySchema = z.object({
  q: optionalSearch,
  province: optionalEnum(PROVINCES),
  discipline: optionalEnum(DISCIPLINES),
  when: z.preprocess((v) => v || undefined, z.enum(TOURNAMENT_WHEN).default('upcoming')),
  limit,
  cursor,
});
export type PublicTournamentQuery = z.infer<typeof publicTournamentQuerySchema>;

export const publicDirectoryQuerySchema = z.object({
  q: optionalSearch,
  province: optionalEnum(PROVINCES),
  limit,
  cursor,
});
export type PublicDirectoryQuery = z.infer<typeof publicDirectoryQuerySchema>;

const localized = z.object({ nl: z.string(), en: z.string() }).partial().nullable();
const isoDate = z.string().describe('YYYY-MM-DD');
const isoDateTime = z.string().describe('ISO 8601 date-time (UTC)');

export const publicVenueRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  province: z.enum(PROVINCES),
});

export const publicTournamentSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  startsOn: isoDate,
  endsOn: isoDate,
  phase: z.enum(TOURNAMENT_PHASES),
  registrationOpensAt: isoDateTime,
  registrationClosesAt: isoDateTime,
  venue: publicVenueRefSchema.nullable(),
  disciplines: z.array(z.enum(DISCIPLINES)),
  eventCount: z.number().int(),
  feeFromCents: z.number().int().nullable(),
  feeToCents: z.number().int().nullable(),
});
export type PublicTournamentSummary = z.infer<typeof publicTournamentSummarySchema>;

export const publicEventSchema = z.object({
  id: z.string().uuid(),
  discipline: z.enum(DISCIPLINES),
  name: localized.describe('Custom name; otherwise build it from discipline, age and level'),
  ageCategory: z.object({ code: z.string(), name: localized }).nullable(),
  level: z.string().nullable(),
  feeCents: z.number().int(),
  maxEntries: z.number().int().nullable(),
  drawType: z.enum(DRAW_TYPES),
  groupSize: z.number().int().nullable(),
  advancePerGroup: z.number().int().nullable(),
  matchesPerEntry: z.number().int().nullable(),
  knockoutSize: z.number().int().nullable(),
  bestOf: z.number().int(),
  pointsToWin: z.number().int(),
  pointsCap: z.number().int(),
  /** Different scoring for the knockout stage or the last rounds (D61). */
  knockoutScoring: z
    .object({
      from: z.enum(['KO', 'QF', 'SF', 'F']),
      bestOf: z.number().int(),
      pointsToWin: z.number().int(),
      pointsCap: z.number().int(),
    })
    .nullable(),
  isOpen: z.boolean(),
});
export type PublicEvent = z.infer<typeof publicEventSchema>;

export const publicVenueSchema = publicVenueRefSchema.extend({
  street: z.string(),
  houseNumber: z.string(),
  postcode: z.string(),
  country: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  numberOfCourts: z.number().int(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  facilities: localized,
  parkingInfo: localized,
  publicTransportInfo: localized,
});
export type PublicVenue = z.infer<typeof publicVenueSchema>;

export const publicTournamentSchema = publicTournamentSummarySchema.extend({
  description: localized,
  dayStartTime: z.string().nullable(),
  withdrawalDeadline: isoDateTime,
  maxEventsPerPlayer: z.number().int(),
  /** Multi-category discount (D52): total in cents for 1, 2, 3 … categories; empty = none. */
  bundlePricesCents: z.array(z.number().int()),
  /** The schedule is published (D56). */
  schedulePublished: z.boolean(),
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  venue: publicVenueSchema.nullable(),
  events: z.array(publicEventSchema),
});
export type PublicTournament = z.infer<typeof publicTournamentSchema>;

export const publicClubSchema = z.object({
  slug: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  city: z.string().nullable(),
  province: z.enum(PROVINCES).nullable(),
  website: z.string().nullable(),
  venue: publicVenueRefSchema.nullable().describe('Home venue'),
  publicPlayerCount: z.number().int(),
});
export type PublicClub = z.infer<typeof publicClubSchema>;

export const publicPlayerSchema = z.object({
  memberNumber: z.string(),
  name: z.string(),
  club: z.object({ slug: z.string(), name: z.string() }).nullable(),
  preferredDisciplines: z.array(z.enum(DISCIPLINES)),
  followerCount: z.number().int(),
});
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.string().nullable() });
