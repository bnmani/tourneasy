/**
 * Input contracts for accounts and profiles, shared by the web app, the REST API and the
 * mobile app. Error messages are translation keys under the `Errors` namespace.
 */
import { z } from 'zod';
import { locales } from '../i18n';
import { ageOn, isMinor, parseDateOnly } from '../rules/age';
import { isCommonPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../rules/identity';

export const DISCIPLINES = ['HE', 'DE', 'HD', 'DD', 'GD'] as const;
export type DisciplineCode = (typeof DISCIPLINES)[number];
// Badminton events are men's, women's or mixed: players register as male or female (D11).
export const GENDERS = ['MALE', 'FEMALE'] as const;
export type GenderCode = (typeof GENDERS)[number];
export const ASSIGNABLE_ROLES = ['ORGANISER', 'ADMIN'] as const;

const text = (max: number) =>
  z
    .string({ required_error: 'required', invalid_type_error: 'required' })
    .trim()
    .min(1, 'required')
    .max(max, 'tooLong');

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
  .string({ required_error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, 'required')
  .max(254, 'tooLong')
  .email('emailInvalid');

/** International or Dutch number: digits, spaces, dashes, brackets, optional leading +. */
export const phoneSchema = z
  .string({ required_error: 'required' })
  .trim()
  .min(1, 'required')
  .regex(/^\+?[0-9][0-9\s\-()]{7,19}$/, 'phoneInvalid')
  .transform((v) => v.replace(/[\s\-()]/g, ''));

export const passwordSchema = z
  .string({ required_error: 'required' })
  .min(PASSWORD_MIN_LENGTH, 'passwordTooShort')
  .max(PASSWORD_MAX_LENGTH, 'passwordTooLong')
  .refine((p) => !isCommonPassword(p), 'passwordTooCommon');

export const dateOfBirthSchema = z
  .string({ required_error: 'required' })
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
    dateOfBirth: dateOfBirthSchema,
    gender: z.enum(GENDERS, { errorMap: () => ({ message: 'required' }) }),
    preferredDisciplines: disciplinesSchema,
    locale: z.enum(locales).default('nl'),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'mustAccept' }) }),
    acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'mustAccept' }) }),
    parentalConsent: z.boolean().optional(),
    guardianName: optionalText(120),
  })
  .superRefine((v, ctx) => {
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
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  identifier: text(254),
  password: z.string({ required_error: 'required' }).min(1, 'required').max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().default(true),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

const tokenSchema = z.string().trim().min(20, 'tokenInvalid').max(200, 'tokenInvalid');

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export const verifyEmailSchema = z.object({ token: tokenSchema });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const profileUpdateSchema = z.object({
  firstName: personNameSchema(60),
  lastNamePrefix: optionalPersonNameSchema(20),
  lastName: personNameSchema(80),
  phone: phoneSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'required' }) }),
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
  emergencyPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s\-()]{7,19}$/, 'phoneInvalid')
    .transform((v) => v.replace(/[\s\-()]/g, ''))
    .optional()
    .or(z.literal('').transform(() => undefined)),
  preferredDisciplines: disciplinesSchema,
  locale: z.enum(locales),
  publicProfile: z.boolean().default(false),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'required').max(PASSWORD_MAX_LENGTH),
  confirm: z.literal(true, { errorMap: () => ({ message: 'mustAccept' }) }),
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
