import { Locale, prisma } from '@tourneasy/db';
import { fieldErrors, isMinor, parseDateOnly, profileUpdateSchema } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import type { Actor } from './session-service';

const profileInclude = {
  playerProfile: {
    include: {
      club: { select: { id: true, name: true } },
      levelSingles: { select: { id: true, code: true } },
      levelDoubles: { select: { id: true, code: true } },
      levelMixed: { select: { id: true, code: true } },
    },
  },
  roles: { select: { role: true } },
} as const;

export async function getMyAccount(actor: Actor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    include: profileInclude,
  });
  if (!user) throw new AppError('notFound');
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    name: user.name,
    locale: user.locale,
    roles: user.roles.map((r) => r.role),
    createdAt: user.createdAt,
    profile: user.playerProfile && {
      memberNumber: user.playerProfile.memberNumber,
      federationId: user.playerProfile.federationId,
      firstName: user.playerProfile.firstName,
      lastNamePrefix: user.playerProfile.lastNamePrefix,
      lastName: user.playerProfile.lastName,
      dateOfBirth: user.playerProfile.dateOfBirth.toISOString().slice(0, 10),
      gender: user.playerProfile.gender,
      nationality: user.playerProfile.nationality,
      phone: user.playerProfile.phone,
      club: user.playerProfile.club,
      levelSingles: user.playerProfile.levelSingles,
      levelDoubles: user.playerProfile.levelDoubles,
      levelMixed: user.playerProfile.levelMixed,
      emergencyName: user.playerProfile.emergencyName,
      emergencyPhone: user.playerProfile.emergencyPhone,
      preferredDisciplines: user.playerProfile.preferredDisciplines,
      isMinor: user.playerProfile.isMinor,
      publicProfile: user.playerProfile.publicProfile,
    },
  };
}
export type MyAccount = Awaited<ReturnType<typeof getMyAccount>>;

export async function updateMyProfile(actor: Actor, input: unknown, meta: RequestMeta) {
  const result = profileUpdateSchema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));
  const data = result.data;

  const existing = await prisma.playerProfile.findUnique({ where: { userId: actor.userId } });
  if (!existing) throw new AppError('notFound');

  const dateOfBirth = parseDateOnly(data.dateOfBirth)!;
  const minor = isMinor(dateOfBirth);
  if (minor && !existing.parentalConsentAt) {
    // A birth date that makes the player a minor needs parental consent, which is
    // collected at sign-up; changing it here would bypass that.
    throw validationError({ dateOfBirth: 'parentalConsentRequired' });
  }

  // Club and levels must exist (ids come from the form).
  const [club, levels] = await Promise.all([
    data.clubId ? prisma.club.findFirst({ where: { id: data.clubId, deletedAt: null } }) : null,
    prisma.levelClass.findMany({
      where: {
        id: {
          in: [data.levelSinglesId, data.levelDoublesId, data.levelMixedId].filter(
            Boolean,
          ) as string[],
        },
      },
      select: { id: true },
    }),
  ]);
  if (data.clubId && !club) throw validationError({ clubId: 'invalid' });
  const levelIds = new Set(levels.map((l) => l.id));
  for (const field of ['levelSinglesId', 'levelDoublesId', 'levelMixedId'] as const) {
    if (data[field] && !levelIds.has(data[field]!)) throw validationError({ [field]: 'invalid' });
  }

  const name = [data.firstName, data.lastNamePrefix, data.lastName].filter(Boolean).join(' ');
  await prisma.$transaction(async (tx) => {
    await tx.playerProfile.update({
      where: { id: existing.id },
      data: {
        firstName: data.firstName,
        lastNamePrefix: data.lastNamePrefix ?? null,
        lastName: data.lastName,
        phone: data.phone,
        dateOfBirth,
        gender: data.gender,
        nationality: data.nationality ?? null,
        clubId: data.clubId ?? null,
        federationId: data.federationId ?? null,
        levelSinglesId: data.levelSinglesId ?? null,
        levelDoublesId: data.levelDoublesId ?? null,
        levelMixedId: data.levelMixedId ?? null,
        emergencyName: data.emergencyName ?? null,
        emergencyPhone: data.emergencyPhone ?? null,
        preferredDisciplines: data.preferredDisciplines,
        isMinor: minor,
        publicProfile: minor ? false : data.publicProfile,
      },
    });
    await tx.user.update({
      where: { id: actor.userId },
      data: { name, locale: data.locale as Locale },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'profile.update',
      entityType: 'PlayerProfile',
      entityId: existing.id,
      meta,
    });
  });
}

/** Options for the profile form. */
export async function getProfileOptions() {
  const [clubs, levels] = await Promise.all([
    prisma.club.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, city: true },
    }),
    prisma.levelClass.findMany({
      where: { isActive: true },
      orderBy: { rank: 'asc' },
      select: { id: true, code: true },
    }),
  ]);
  return { clubs, levels };
}
