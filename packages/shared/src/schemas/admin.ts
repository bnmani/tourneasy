/**
 * Input contracts for the admin/organiser portal. Dates and times come from HTML inputs:
 * "YYYY-MM-DD" (date), "YYYY-MM-DDTHH:mm" (datetime-local, Dutch time) and "HH:MM".
 * Error messages are translation keys under `Errors.*`.
 */
import { z } from 'zod';
import { parseDateOnly } from '../rules/age';
import { parseEuroToCents } from '../rules/money';
import { amsterdamLocalToUtc, TIME_OF_DAY_PATTERN } from '../rules/time';
import { DISCIPLINES, GENDERS } from './auth';

export const PROVINCES = [
  'DRENTHE',
  'FLEVOLAND',
  'FRIESLAND',
  'GELDERLAND',
  'GRONINGEN',
  'LIMBURG',
  'NOORD_BRABANT',
  'NOORD_HOLLAND',
  'OVERIJSSEL',
  'UTRECHT',
  'ZEELAND',
  'ZUID_HOLLAND',
  'OUTSIDE_NL',
] as const;

export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'OPEN',
  'CLOSED',
  'IN_PROGRESS',
  'FINISHED',
  'ARCHIVED',
] as const;
export type TournamentStatusCode = (typeof TOURNAMENT_STATUSES)[number];
export const TOURNAMENT_TYPES = ['SELF', 'THIRD_PARTY'] as const;
export const DRAW_TYPES = [
  'KNOCKOUT',
  'DOUBLE_KNOCKOUT',
  'ROUND_ROBIN',
  'SWISS',
  'GROUPS_KNOCKOUT',
  'HYBRID_ROUND_ROBIN_KNOCKOUT',
] as const;

/** Hybrid round robin + knock-out: each entry plays this many random opponents (odd numbers). */
export const MATCHES_PER_ENTRY_OPTIONS = [3, 5, 7, 9] as const;
/** …after which the best N of the overall ranking go to the knock-out stage. */
export const KNOCKOUT_SIZE_OPTIONS = [4, 8, 16, 32] as const;

/** Allowed status changes (organiser workflow). Archive is possible from any final-ish state. */
export const STATUS_TRANSITIONS: Record<TournamentStatusCode, TournamentStatusCode[]> = {
  DRAFT: ['OPEN', 'ARCHIVED'],
  OPEN: ['CLOSED', 'DRAFT'],
  CLOSED: ['IN_PROGRESS', 'OPEN'],
  IN_PROGRESS: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

const text = (max: number) =>
  z.string({ required_error: 'required' }).trim().min(1, 'required').max(max, 'tooLong');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'tooLong')
    .optional()
    .transform((v) => (v ? v : undefined));
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid('invalid').optional());
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: 'invalid' })
      .int('invalid')
      .min(min, 'invalid')
      .max(max, 'invalid')
      .optional(),
  );
const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().toLowerCase().email('emailInvalid').max(254).optional(),
);
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(300, 'tooLong')
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url('invalid'))
    .optional(),
);
const optionalPhone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s\-()]{7,19}$/, 'phoneInvalid')
    .transform((v) => v.replace(/[\s\-()]/g, ''))
    .optional(),
);
const dateOnly = z
  .string({ required_error: 'required' })
  .min(1, 'required')
  .refine((v) => parseDateOnly(v) !== null, 'dateInvalid')
  .transform((v) => parseDateOnly(v)!);
const localDateTime = z
  .string({ required_error: 'required' })
  .min(1, 'required')
  .refine((v) => amsterdamLocalToUtc(v) !== null, 'dateInvalid')
  .transform((v) => amsterdamLocalToUtc(v)!);

// ── Venues & clubs ────────────────────────────────────────────────────────────────

/** Venue select value meaning "create a venue from the inline `newVenue.*` fields". */
export const NEW_VENUE = 'new';

export const venueSchema = z
  .object({
    name: text(120),
    street: text(120),
    houseNumber: text(20),
    postcode: z.string().trim().toUpperCase().min(1, 'required').max(12, 'tooLong'),
    city: text(80),
    province: z.enum(PROVINCES, { errorMap: () => ({ message: 'required' }) }),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'invalid')
      .default('NL'),
    numberOfCourts: z.coerce
      .number({ invalid_type_error: 'invalid' })
      .int('invalid')
      .min(1, 'invalid')
      .max(60, 'invalid'),
    latitude: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(-90, 'invalid').max(90, 'invalid').optional(),
    ),
    longitude: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(-180, 'invalid').max(180, 'invalid').optional(),
    ),
    phone: optionalPhone,
    website: optionalUrl,
    facilities: optionalText(1000),
    parkingInfo: optionalText(1000),
    publicTransportInfo: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    // Dutch postcodes: "1234 AB" (normalised); other countries free-form.
    if (v.country === 'NL' && !/^\d{4}\s?[A-Z]{2}$/.test(v.postcode)) {
      ctx.addIssue({ code: 'custom', path: ['postcode'], message: 'postcodeInvalid' });
    }
  })
  .transform((v) => ({
    ...v,
    postcode:
      v.country === 'NL' ? v.postcode.replace(/^(\d{4})\s?([A-Z]{2})$/, '$1 $2') : v.postcode,
  }));
export type VenueInput = z.infer<typeof venueSchema>;

export const clubSchema = z.object({
  name: text(120),
  shortName: optionalText(30),
  federationCode: optionalText(20),
  city: optionalText(80),
  province: z.preprocess(emptyToUndefined, z.enum(PROVINCES).optional()),
  website: optionalUrl,
  email: optionalEmail,
  venueId: optionalUuid,
});
export type ClubInput = z.infer<typeof clubSchema>;

// ── Tournaments ───────────────────────────────────────────────────────────────────

export const tournamentSchema = z
  .object({
    name: text(120),
    type: z.enum(TOURNAMENT_TYPES).default('SELF'),
    organiserEmail: optionalEmail,
    venueId: optionalUuid,
    startsOn: dateOnly,
    endsOn: dateOnly,
    dayStartTime: z.preprocess(
      emptyToUndefined,
      z.string().regex(TIME_OF_DAY_PATTERN, 'timeInvalid').optional(),
    ),
    registrationOpensAt: localDateTime,
    registrationClosesAt: localDateTime,
    withdrawalDeadline: localDateTime,
    maxParticipants: optionalInt(2, 5000),
    maxEventsPerPlayer: z.coerce
      .number()
      .int('invalid')
      .min(1, 'invalid')
      .max(5, 'invalid')
      .default(3),
    courtsAvailable: optionalInt(1, 60),
    contactName: optionalText(120),
    contactEmail: optionalEmail,
    contactPhone: optionalPhone,
    descriptionNl: optionalText(5000),
    descriptionEn: optionalText(5000),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.endsOn < v.startsOn) issue('endsOn', 'endBeforeStart');
    if (v.registrationClosesAt <= v.registrationOpensAt)
      issue('registrationClosesAt', 'deadlineOrder');
    // Entries close before the first day starts (Dutch midnight ≈ start date 00:00 UTC − 1/2 h).
    if (v.registrationClosesAt.getTime() > v.startsOn.getTime())
      issue('registrationClosesAt', 'deadlineAfterStart');
    if (v.withdrawalDeadline.getTime() > v.startsOn.getTime())
      issue('withdrawalDeadline', 'deadlineAfterStart');
    // Withdrawing is only possible while entries are open (draws are made after closing).
    if (v.withdrawalDeadline > v.registrationClosesAt)
      issue('withdrawalDeadline', 'withdrawalAfterClose');
  });
export type TournamentInput = z.infer<typeof tournamentSchema>;

export const tournamentStatusSchema = z.object({ status: z.enum(TOURNAMENT_STATUSES) });

export const organiserEmailSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'required').email('emailInvalid').max(254),
});

// ── Events (tournament setup) ─────────────────────────────────────────────────────

export const eventSchema = z
  .object({
    discipline: z.enum(DISCIPLINES, { errorMap: () => ({ message: 'required' }) }),
    ageCategoryId: optionalUuid,
    levelClassId: optionalUuid,
    nameNl: optionalText(80),
    nameEn: optionalText(80),
    fee: z
      .string({ required_error: 'required' })
      .min(1, 'required')
      .refine((v) => parseEuroToCents(v) !== null, 'feeInvalid')
      .transform((v) => parseEuroToCents(v)!),
    maxEntries: optionalInt(2, 512),
    drawType: z.enum(DRAW_TYPES),
    groupSize: optionalInt(3, 8),
    advancePerGroup: optionalInt(1, 4),
    matchesPerEntry: optionalInt(3, 9),
    knockoutSize: optionalInt(4, 32),
    bestOf: z.coerce
      .number()
      .refine((n) => [1, 3, 5].includes(n), 'invalid')
      .default(3),
    pointsToWin: z.coerce
      .number()
      .refine((n) => [11, 15, 21].includes(n), 'invalid')
      .default(21),
    pointsCap: z.coerce.number().int().min(11, 'invalid').max(40, 'invalid').default(30),
    isOpen: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.drawType === 'GROUPS_KNOCKOUT') {
      if (!v.groupSize) ctx.addIssue({ code: 'custom', path: ['groupSize'], message: 'required' });
      if (!v.advancePerGroup)
        ctx.addIssue({ code: 'custom', path: ['advancePerGroup'], message: 'required' });
      if (v.groupSize && v.advancePerGroup && v.advancePerGroup >= v.groupSize) {
        ctx.addIssue({ code: 'custom', path: ['advancePerGroup'], message: 'invalid' });
      }
    }
    if (v.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT') {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      if (!v.matchesPerEntry) issue('matchesPerEntry', 'required');
      else if (!(MATCHES_PER_ENTRY_OPTIONS as readonly number[]).includes(v.matchesPerEntry))
        issue('matchesPerEntry', 'oddMatches');
      if (!v.knockoutSize) issue('knockoutSize', 'required');
      else if (!(KNOCKOUT_SIZE_OPTIONS as readonly number[]).includes(v.knockoutSize))
        issue('knockoutSize', 'invalid');
      // Enough entries to give everyone that many different opponents and fill the knock-out.
      if (v.maxEntries && v.matchesPerEntry && v.maxEntries <= v.matchesPerEntry)
        issue('maxEntries', 'tooFewEntries');
      if (v.maxEntries && v.knockoutSize && v.maxEntries < v.knockoutSize)
        issue('maxEntries', 'tooFewEntries');
    }
    if (v.pointsCap < v.pointsToWin)
      ctx.addIssue({ code: 'custom', path: ['pointsCap'], message: 'invalid' });
  });
export type EventInput = z.infer<typeof eventSchema>;

// ── Players (admin) ───────────────────────────────────────────────────────────────

export const adminPlayerSchema = z.object({
  firstName: text(60),
  lastNamePrefix: optionalText(20),
  lastName: text(80),
  contactEmail: optionalEmail,
  phone: optionalPhone,
  dateOfBirth: dateOnly,
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'required' }) }),
  nationality: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'invalid')
      .optional(),
  ),
  clubId: optionalUuid,
  federationId: optionalText(20),
  levelSinglesId: optionalUuid,
  levelDoublesId: optionalUuid,
  levelMixedId: optionalUuid,
  preferredDisciplines: z.array(z.enum(DISCIPLINES)).default([]),
});
export type AdminPlayerInput = z.infer<typeof adminPlayerSchema>;

export const mergePlayersSchema = z.object({
  sourceId: z.string().uuid('invalid'),
  targetMemberNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^TE\d{6}$/, 'invalid'),
});

export const PLAYER_CSV_COLUMNS = [
  'firstName',
  'lastNamePrefix',
  'lastName',
  'email',
  'phone',
  'dateOfBirth',
  'gender',
  'club',
  'federationId',
  'preferredEvents',
] as const;

// ── Site appearance ────────────────────────────────────────────────────────────

/** Site themes (D42): `midnight` is the default; admins can switch to the others. */
export const SITE_THEMES = ['midnight', 'teal', 'aqua', 'night'] as const;
export type SiteTheme = (typeof SITE_THEMES)[number];
export const DEFAULT_SITE_THEME: SiteTheme = 'midnight';

export const siteThemeSchema = z.object({
  theme: z.enum(SITE_THEMES, { errorMap: () => ({ message: 'invalid' }) }),
});
