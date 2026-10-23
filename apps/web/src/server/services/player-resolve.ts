/**
 * Finding — or creating — the players of an entry (D63), shared by the participants import and
 * the "add entry" screen. Matching follows the player import (D60): member number, federation
 * ID, or email and name together; without those, name and date of birth. A player not found is
 * created when enough is known (name, gender, date of birth), without an account.
 */
import { prisma } from '@tourneasy/db';
import { adminPlayerSchema, fieldErrors } from '@tourneasy/shared';
import { excelSerialToIsoDate } from '../lib/xlsx';
import { nameKey, nextMemberNumber, profileData } from './player-service';
import { playerSelect, type PlayerRow } from './registration-service';

export type PlayerSpec = {
  memberNumber?: string;
  federationId?: string;
  email?: string;
  firstName?: string;
  lastNamePrefix?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  club?: string;
};

export type Resolved =
  { ok: true; player: PlayerRow; created: boolean } | { ok: false; field: string; error: string };

/** "M", "man", "male", "heer" → MALE; "V", "F", "vrouw", "female", "dame" → FEMALE. */
export function normaliseGender(value?: string): string | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (['m', 'man', 'male', 'heer', 'h', 'jongen'].includes(v)) return 'MALE';
  if (['v', 'f', 'vrouw', 'female', 'dame', 'd', 'meisje'].includes(v)) return 'FEMALE';
  return v.toUpperCase();
}

/** "2004-05-01", "1-5-2004", "01/05/2004" or an Excel day number → "2004-05-01". */
export function normaliseDate(value?: string): string | undefined {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  if (/^\d{4,5}$/.test(v)) return excelSerialToIsoDate(v);
  const dmy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return v;
}

const find = (where: object) =>
  prisma.playerProfile.findFirst({
    where: { deletedAt: null, mergedIntoId: null, ...where },
    select: playerSelect,
  });

/** Finds the player, or creates them when `create` is set and the details are complete. */
export async function resolvePlayer(
  spec: PlayerSpec,
  opts: { create: boolean },
): Promise<Resolved> {
  const memberNumber = spec.memberNumber?.trim().toUpperCase();
  if (memberNumber) {
    const p = await find({ memberNumber });
    return p
      ? { ok: true, player: p, created: false }
      : { ok: false, field: 'memberNumber', error: 'playerNotFound' };
  }
  const federationId = spec.federationId?.trim();
  if (federationId) {
    const p = await find({ federationId });
    if (p) return { ok: true, player: p, created: false };
  }
  const wanted = nameKey(spec.firstName, spec.lastNamePrefix, spec.lastName);
  const email = spec.email?.trim().toLowerCase();
  if (email && wanted) {
    const same = await prisma.playerProfile.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        OR: [{ contactEmail: email }, { user: { email } }],
      },
      select: playerSelect,
    });
    const match = same.find((p) => nameKey(p.firstName, p.lastNamePrefix, p.lastName) === wanted);
    if (match) return { ok: true, player: match, created: false };
  }
  if (email && !wanted) {
    // Only an email address (e.g. the participants export): fine when it is unambiguous.
    const same = await prisma.playerProfile.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        OR: [{ contactEmail: email }, { user: { email } }],
      },
      select: playerSelect,
      take: 2,
    });
    if (same.length === 1) return { ok: true, player: same[0]!, created: false };
    return { ok: false, field: 'email', error: same.length > 1 ? 'emailShared' : 'playerNotFound' };
  }
  const dateOfBirth = normaliseDate(spec.dateOfBirth);
  if (wanted && dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    const sameBirthday = await prisma.playerProfile.findMany({
      where: { deletedAt: null, mergedIntoId: null, dateOfBirth: new Date(dateOfBirth) },
      select: playerSelect,
    });
    const match = sameBirthday.find(
      (p) => nameKey(p.firstName, p.lastNamePrefix, p.lastName) === wanted,
    );
    if (match) return { ok: true, player: match, created: false };
  }
  if (!opts.create || !wanted) return { ok: false, field: 'memberNumber', error: 'playerNotFound' };

  const club = spec.club?.trim().toLowerCase();
  const clubId = club
    ? (
        await prisma.club.findFirst({
          where: {
            deletedAt: null,
            OR: [
              { name: { equals: club, mode: 'insensitive' } },
              { shortName: { equals: club, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        })
      )?.id
    : undefined;
  const parsed = adminPlayerSchema.safeParse({
    firstName: spec.firstName,
    lastNamePrefix: spec.lastNamePrefix,
    lastName: spec.lastName,
    contactEmail: email,
    dateOfBirth,
    gender: normaliseGender(spec.gender),
    clubId,
    federationId,
    preferredDisciplines: [],
  });
  if (!parsed.success) {
    const [field, error] = Object.entries(fieldErrors(parsed.error))[0] ?? [
      'memberNumber',
      'invalid',
    ];
    return { ok: false, field, error };
  }
  const created = await prisma.$transaction(async (tx) =>
    tx.playerProfile.create({
      data: {
        ...profileData(parsed.data),
        memberNumber: await nextMemberNumber(tx),
        contactEmail: parsed.data.contactEmail ?? null,
        publicProfile: false,
      },
      select: playerSelect,
    }),
  );
  return { ok: true, player: created, created: true };
}
