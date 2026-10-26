/**
 * Input contracts for accounts and profiles, shared by the web app, the REST API and the
 * mobile app. Error messages are translation keys under the `Errors` namespace.
 */
import { z } from 'zod';
import { locales } from '../i18n';
import { ageOn, isMinor, parseDateOnly } from '../rules/age';
import { disciplinesForGender } from '../rules/eligibility';
import { isCommonPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../rules/identity';
import { normalisePhone } from '../rules/phone';

export const DISCIPLINES = ['HE', 'DE', 'HD', 'DD', 'GD'] as const;
export type DisciplineCode = (typeof DISCIPLINES)[number];
// Badminton events are men's, women's or mixed: players register as male or female (D11).
export const GENDERS = ['MALE', 'FEMALE'] as const;
export type GenderCode = (typeof GENDERS)[number];
export const ASSIGNABLE_ROLES = ['ORGANISER', 'ADMIN', 'OWNER'] as const;

const text = (max: number) =>
  z.string({ error: 'required' }).trim().min(1, 'required').max(max, 'tooLong');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'tooLong')
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Names of people: letters in any language, with spaces, hyphens, apostrophes and dots
 * ("Anne-Marie", "van 't Hof", "J. de Vries"); no digits or other symbols.
 */
export const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M}\s'’.-]*$/u;
export const personNameSchema = (max: number) =>
  text(max).regex(PERSON_NAME_PATTERN, 'lettersOnly');
export const optionalPersonNameSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'tooLong')
    .refine((v) => v === '' || PERSON_NAME_PATTERN.test(v), 'lettersOnly')
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z
  .string({ error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, 'required')
  .max(254, 'tooLong')
  .email('emailInvalid');

/**
 * Phone number, stored internationally (+31612345678). The form sends country + number joined;
 * Dutch national input ("06 12 34 56 78") is converted (D66).
 */
export const phoneSchema = z
  .string({ error: 'required' })
  .trim()
  .min(1, 'required')
  .transform((v, ctx) => {
    const e164 = normalisePhone(v);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'phoneInvalid' });
      return z.NEVER;
    }
    return e164;
  });

/** Optional phone: empty means none. */
export const optionalPhoneSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  phoneSchema.optional(),
);

export const passwordSchema = z
  .string({ error: 'required' })
  .min(PASSWORD_MIN_LENGTH, 'passwordTooShort')
  .max(PASSWORD_MAX_LENGTH, 'passwordTooLong')
  .refine((p) => !isCommonPassword(p), 'passwordTooCommon');

export const dateOfBirthSchema = z
  .string({ error: 'required' })
  .min(1, 'required')
  .refine((v) => parseDateOnly(v) !== null, 'dateInvalid')
  .refine((v) => {
    const age = ageOn(v);
    return age >= 4 && age <= 110;
  }, 'dateOutOfRange');

const disciplinesSchema = z.array(z.enum(DISCIPLINES)).max(DISCIPLINES.length).default([]);

export const signUpSchema = z
  .object({
    firstName: personNameSchema(60),
    lastNamePrefix: optionalPersonNameSchema(20),
    lastName: personNameSchema(80),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    /** The web form asks twice; the mobile app checks on the phone and may leave this out. */
    passwordRepeat: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    dateOfBirth: dateOfBirthSchema,
    gender: z.enum(GENDERS, { error: 'required' }),
    preferredDisciplines: disciplinesSchema,
    locale: z.enum(locales).default('nl'),
    acceptTerms: z.literal(true, { error: 'mustAccept' }),
    acceptPrivacy: z.literal(true, { error: 'mustAccept' }),
    parentalConsent: z.boolean().optional(),
    guardianName: optionalText(120),
  })
  .superRefine((v, ctx) => {
    if (v.passwordRepeat !== undefined && v.passwordRepeat !== v.password) {
      ctx.addIssue({ code: 'custom', path: ['passwordRepeat'], message: 'passwordMismatch' });
    }
    if (parseDateOnly(v.dateOfBirth) && isMinor(v.dateOfBirth)) {
      if (!v.parentalConsent) {
        ctx.addIssue({
          code: 'custom',
          path: ['parentalConsent'],
          message: 'parentalConsentRequired',
        });
      }
      if (!v.guardianName) {
        ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'required' });
      }
    }
  })
  // Only categories the player's gender can play (D66).
  .transform((v) => ({
    ...v,
    preferredDisciplines: disciplinesForGender(v.preferredDisciplines, v.gender),
  }));
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  identifier: text(254),
  password: z.string({ error: 'required' }).min(1, 'required').max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().default(true),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

const tokenSchema = z.string().trim().min(20, 'tokenInvalid').max(200, 'tokenInvalid');

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    passwordRepeat: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  })
  .refine((v) => v.passwordRepeat === undefined || v.passwordRepeat === v.password, {
    path: ['passwordRepeat'],
    message: 'passwordMismatch',
  });
export const verifyEmailSchema = z.object({ token: tokenSchema });

/** Activating an account from an invite (D76). Minors also need consent; the service checks. */
export const acceptPlayerInviteSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    passwordRepeat: z.string().max(PASSWORD_MAX_LENGTH).optional(),
    acceptTerms: z.literal(true, { error: 'mustAccept' }),
    acceptPrivacy: z.literal(true, { error: 'mustAccept' }),
    parentalConsent: z.boolean().optional(),
    guardianName: optionalText(120),
  })
  .refine((v) => v.passwordRepeat === undefined || v.passwordRepeat === v.password, {
    path: ['passwordRepeat'],
    message: 'passwordMismatch',
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    newPasswordRepeat: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  })
  .refine((v) => v.newPasswordRepeat === undefined || v.newPasswordRepeat === v.newPassword, {
    path: ['newPasswordRepeat'],
    message: 'passwordMismatch',
  });

export const profileUpdateSchema = z
  .object({
    firstName: personNameSchema(60),
    lastNamePrefix: optionalPersonNameSchema(20),
    lastName: personNameSchema(80),
    phone: phoneSchema,
    dateOfBirth: dateOfBirthSchema,
    gender: z.enum(GENDERS, { error: 'required' }),
    nationality: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'invalid')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    clubId: z
      .string()
      .uuid('invalid')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    federationId: optionalText(20),
    levelSinglesId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    levelDoublesId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    levelMixedId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    emergencyName: optionalText(120),
    emergencyPhone: optionalPhoneSchema,
    preferredDisciplines: disciplinesSchema,
    locale: z.enum(locales),
    publicProfile: z.boolean().default(false),
  })
  .transform((v) => ({
    ...v,
    preferredDisciplines: disciplinesForGender(v.preferredDisciplines, v.gender),
  }));
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
  confirm: z.literal(true, { error: 'mustAccept' }),
});

export const roleChangeSchema = z.object({
  userId: z.string().uuid('invalid'),
  role: z.enum(ASSIGNABLE_ROLES),
});

/** Mobile: exchange a refresh token for a new token pair. */
export const refreshTokenSchema = z.object({ refreshToken: tokenSchema });

/** Flattens a ZodError into `{ field: errorKey }` (first error per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_form';
    if (!(field in out))
      out[field] = KNOWN_ERROR_KEYS.has(issue.message) ? issue.message : 'invalid';
  }
  return out;
}

export const KNOWN_ERROR_KEYS = new Set([
  'passwordMismatch',
  'smtpRejected',
  'gameScore',
  'tooFewGames',
  'tooManyGames',
  'seedOrder',
  'stripeKeyFormat',
  'stripeKeyRejected',
  'stripeModeMismatch',
  'bundleOrder',
  'required',
  'tooLong',
  'invalid',
  'emailInvalid',
  'phoneInvalid',
  'dateInvalid',
  'dateOutOfRange',
  'passwordTooShort',
  'passwordTooLong',
  'passwordTooCommon',
  'mustAccept',
  'parentalConsentRequired',
  'tokenInvalid',
  'postcodeInvalid',
  'timeInvalid',
  'endBeforeStart',
  'deadlineOrder',
  'deadlineAfterStart',
  'feeInvalid',
  'duplicate',
  'emailTaken',
  'withdrawalAfterClose',
  'oddMatches',
  'tooFewEntries',
  'chooseEvent',
  'partnerRequired',
  'partnerNotFound',
  'partnerSelf',
  'partnerIneligible',
  'partnerAlreadyEntered',
  'notEligible',
  'alreadyEntered',
  'maxEvents',
  'lettersOnly',
]);
