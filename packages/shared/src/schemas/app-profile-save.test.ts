import { describe, expect, it } from 'vitest';

import { profileUpdateSchema } from './auth';

/** The body the mobile app sends on PATCH /me, with a club and levels set and with them empty. */
const fullBody = {
  firstName: 'Sam',
  lastNamePrefix: '',
  lastName: 'Jansen',
  phone: '+31 6 12345678',
  dateOfBirth: '1998-03-12',
  gender: 'MALE',
  nationality: 'NL',
  clubId: '00000000-0000-4000-8000-000000000001',
  federationId: 'BNL-123',
  levelSinglesId: '00000000-0000-4000-8000-000000000002',
  levelDoublesId: '',
  levelMixedId: '',
  emergencyName: 'Alex',
  emergencyPhone: '+31 6 87654321',
  preferredDisciplines: ['HE', 'HD'],
  locale: 'nl',
  publicProfile: false,
};

describe('mobile profile save body', () => {
  it('is accepted by the website profile schema', () => {
    expect(profileUpdateSchema.safeParse(fullBody).success).toBe(true);
  });

  it('accepts cleared optional fields sent as empty strings', () => {
    const cleared = { ...fullBody, nationality: '', clubId: '', federationId: '', emergencyName: '', emergencyPhone: '' };
    expect(profileUpdateSchema.safeParse(cleared).success).toBe(true);
  });
});
