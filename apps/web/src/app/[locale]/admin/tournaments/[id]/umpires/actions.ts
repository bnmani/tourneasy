'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { currentRequestMeta, getActor } from '@/server/auth/web';
import { toFormState } from '@/server/actions/form-utils';
import { AppError, isAppError } from '@/server/lib/errors';
import { createUmpire, resetUmpireAccess, revokeUmpire } from '@/server/services/umpire-service';
import type { UmpireFormState } from './state';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** The PIN and QR leave only in the response to this one request: not stored, not logged. */
async function reveal(
  displayName: string,
  access: { pin: string; qrUrl: string },
): Promise<UmpireFormState> {
  const svg = await QRCode.toString(access.qrUrl, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  return {
    reveal: {
      displayName,
      pin: access.pin,
      qrUrl: access.qrUrl,
      qrImage: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    },
  };
}

export async function createUmpireAction(
  _locale: AppLocale,
  tournamentId: string,
  _prev: UmpireFormState,
  formData: FormData,
): Promise<UmpireFormState> {
  try {
    const displayName = String(formData.get('displayName') ?? '');
    const access = await createUmpire(
      await actorOrThrow(),
      { tournamentId, displayName },
      await currentRequestMeta(),
    );
    revalidatePath('/', 'layout');
    return await reveal(displayName.trim(), access);
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function resetUmpireAction(
  _locale: AppLocale,
  _tournamentId: string,
  umpireId: string,
  _prev: UmpireFormState,
  formData: FormData,
): Promise<UmpireFormState> {
  try {
    const actor = await actorOrThrow();
    const access = await resetUmpireAccess(actor, umpireId, await currentRequestMeta());
    revalidatePath('/', 'layout');
    return await reveal(String(formData.get('displayName') ?? ''), access);
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function revokeUmpireAction(
  locale: AppLocale,
  tournamentId: string,
  umpireId: string,
) {
  let status = 'umpireRevoked';
  try {
    await revokeUmpire(await actorOrThrow(), umpireId, await currentRequestMeta());
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[umpire action] failed');
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/admin/tournaments/${tournamentId}/umpires?status=${status}`);
}
