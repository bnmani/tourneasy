/**
 * Tournament logos (D67): one small PNG or JPEG per tournament, kept in the database and shown
 * on the tournament page and at the top of its emails. The file type is read from the bytes
 * (not the name or the browser's claim), and the size from the image header, so emails can
 * give the image fixed dimensions (Outlook needs them).
 */
import { prisma } from '@tourneasy/db';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { siteUrl } from '../lib/urls';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

export const LOGO_MAX_BYTES = 1024 * 1024;

/** Type and pixel size from a PNG or JPEG header; null for anything else. */
export function imageInfo(
  bytes: Uint8Array,
): { mimeType: 'image/png' | 'image/jpeg'; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: signature, then the IHDR chunk with width and height.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: walk the segments to the first "start of frame" marker.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      const length = view.getUint16(i + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame)
        return {
          mimeType: 'image/jpeg',
          height: view.getUint16(i + 5),
          width: view.getUint16(i + 7),
        };
      i += 2 + length;
    }
  }
  return null;
}

/** Saves (or replaces) the tournament's logo. */
export async function setTournamentLogo(
  actor: Actor,
  tournamentId: string,
  file: { bytes: Uint8Array },
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  if (file.bytes.length === 0) throw new AppError('logoInvalid');
  if (file.bytes.length > LOGO_MAX_BYTES) throw new AppError('logoTooLarge');
  const info = imageInfo(file.bytes);
  if (!info || info.width < 1 || info.height < 1 || info.width > 5000 || info.height > 5000)
    throw new AppError('logoInvalid');
  const data = { ...info, data: Buffer.from(file.bytes) };
  await prisma.$transaction(async (tx) => {
    await tx.tournamentLogo.upsert({
      where: { tournamentId },
      create: { tournamentId, ...data },
      update: data,
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'tournament.logo.set',
      entityType: 'Tournament',
      entityId: tournamentId,
      after: { ...info, bytes: file.bytes.length },
      meta,
    });
  });
}

export async function removeTournamentLogo(actor: Actor, tournamentId: string, meta: RequestMeta) {
  await assertCanManageTournament(actor, tournamentId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.tournamentLogo.deleteMany({ where: { tournamentId } });
    if (count === 0) throw new AppError('notFound');
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'tournament.logo.remove',
      entityType: 'Tournament',
      entityId: tournamentId,
      meta,
    });
  });
}

/** Public address of a logo; the version in the URL lets browsers cache it forever. */
export const logoUrlFor = (tournamentId: string, updatedAt: Date) =>
  siteUrl(`/api/v1/tournament-logos/${tournamentId}?v=${updatedAt.getTime()}`);

export type LogoRef = { url: string; width: number; height: number };

/** Public address and size of a tournament's logo, or null when it has none. */
export async function tournamentLogo(tournamentId: string): Promise<LogoRef | null> {
  const logo = await prisma.tournamentLogo.findUnique({
    where: { tournamentId },
    select: { width: true, height: true, updatedAt: true },
  });
  if (!logo) return null;
  return {
    url: logoUrlFor(tournamentId, logo.updatedAt),
    width: logo.width,
    height: logo.height,
  };
}

/** The logo's bytes for the image endpoint. */
export async function tournamentLogoFile(tournamentId: string) {
  return prisma.tournamentLogo.findUnique({
    where: { tournamentId },
    select: { mimeType: true, data: true, updatedAt: true },
  });
}

/** The logo as it goes into the tournament's emails, or null when it has none. */
export async function emailLogo(tournamentId: string, tournamentName: string) {
  const logo = await tournamentLogo(tournamentId);
  return logo ? { ...logo, alt: tournamentName } : null;
}

/** The logo for a tournament page, found by its slug. */
export async function pageLogo(slug: string, tournamentName: string) {
  const t = await prisma.tournament.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  return t ? emailLogo(t.id, tournamentName) : null;
}
