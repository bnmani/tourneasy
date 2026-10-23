import { describe, expect, it } from 'vitest';
import { fieldErrors, loginSchema, profileUpdateSchema, signUpSchema } from './auth';

const adult = {
  firstName: 'Daan',
  lastName: 'Jansen',
  email: 'Daan@Example.nl ',
  phone: '06 12 34 56 78',
  password: 'Shuttle-Smash-2027',
  dateOfBirth: '1995-04-12',
  gender: 'MALE',
  preferredDisciplines: ['HE', 'GD'],
  locale: 'nl',
  acceptTerms: true,
  acceptPrivacy: true,
};

describe('signUpSchema', () => {
  it('accepts a valid adult and normalises email and phone', () => {
    const r = signUpSchema.safeParse(adult);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('daan@example.nl');
      expect(r.data.phone).toBe('+31612345678');
      expect(r.data.preferredDisciplines).toEqual(['HE', 'GD']);
    }
  });

  it('keeps only the categories the gender can play', () => {
    const r = signUpSchema.safeParse({
      ...adult,
      gender: 'FEMALE',
      preferredDisciplines: ['HE', 'DD', 'GD'],
    });
    expect(r.success && r.data.preferredDisciplines).toEqual(['DD', 'GD']);
  });

  it('requires terms, privacy and a valid phone', () => {
    const r = signUpSchema.safeParse({ ...adult, acceptTerms: false, phone: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrors(r.error)).toMatchObject({
        acceptTerms: 'mustAccept',
        phone: 'phoneInvalid',
      });
    }
  });

  it('rejects short and common passwords with specific keys', () => {
    const short = signUpSchema.safeParse({ ...adult, password: 'kort' });
    const common = signUpSchema.safeParse({ ...adult, password: 'wachtwoord123' });
    expect(!short.success && fieldErrors(short.error).password).toBe('passwordTooShort');
    expect(!common.success && fieldErrors(common.error).password).toBe('passwordTooCommon');
  });

  it('requires parental consent and a guardian name for under-16s', () => {
    const year = new Date().getUTCFullYear() - 12;
    const r = signUpSchema.safeParse({ ...adult, dateOfBirth: `${year}-01-01` });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrors(r.error)).toMatchObject({
        parentalConsent: 'parentalConsentRequired',
        guardianName: 'required',
      });
    }
    const ok = signUpSchema.safeParse({
      ...adult,
      dateOfBirth: `${year}-01-01`,
      parentalConsent: true,
      guardianName: 'Anna Jansen',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown disciplines and genders', () => {
    const r = signUpSchema.safeParse({ ...adult, gender: 'X', preferredDisciplines: ['ZZ'] });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('defaults rememberMe to true', () => {
    const r = loginSchema.parse({ identifier: 'TE100001', password: 'x' });
    expect(r.rememberMe).toBe(true);
  });
});

describe('profileUpdateSchema', () => {
  it('turns empty optional fields into undefined', () => {
    const r = profileUpdateSchema.parse({
      ...adult,
      nationality: '',
      clubId: '',
      emergencyPhone: '',
      levelSinglesId: '',
    });
    expect(r.nationality).toBeUndefined();
    expect(r.clubId).toBeUndefined();
    expect(r.emergencyPhone).toBeUndefined();
    expect(r.publicProfile).toBe(false);
  });
});

describe('repeated password', () => {
  it('must match when given (web forms), and may be left out (mobile app)', async () => {
    const { resetPasswordSchema, changePasswordSchema } = await import('./auth');
    const token = 'x'.repeat(30);
    expect(
      resetPasswordSchema.safeParse({
        token,
        password: 'Shuttle-Smash-2027',
        passwordRepeat: 'Shuttle-Smash-2028',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token,
        password: 'Shuttle-Smash-2027',
        passwordRepeat: 'Shuttle-Smash-2027',
      }).success,
    ).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: 'Shuttle-Smash-2027' }).success).toBe(
      true,
    );
    const bad = changePasswordSchema.safeParse({
      currentPassword: 'a',
      newPassword: 'Shuttle-Smash-2027',
      newPasswordRepeat: '',
    });
    expect(bad.success ? null : bad.error.issues[0]).toMatchObject({
      path: ['newPasswordRepeat'],
      message: 'passwordMismatch',
    });
  });
});
