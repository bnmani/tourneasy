'use client';

import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import { changePartnerAction, type ChangePartnerState } from '@/server/actions/entry-admin-actions';
import { PlayerChooser } from './add-entry-form';

/**
 * Change partner on a doubles entry (D115). "Check" shows what will happen (who leaves, who
 * joins, money back); "Confirm change" saves it. Choosing another player hides the old preview.
 */
export function ChangePartnerForm({
  locale,
  tournamentId,
  eventId,
  registrationId,
  players,
}: {
  locale: AppLocale;
  tournamentId: string;
  eventId: string;
  registrationId: string;
  /** The entry's players (player 1 first): the organiser picks who is replaced. */
  players: { id: string; name: string; memberNumber: string }[];
}) {
  const t = useTranslations('Admin.entries');
  const ta = useTranslations('Admin.addEntry');
  const te = useTranslations('Errors');
  const [state, action] = useActionState<ChangePartnerState, FormData>(
    changePartnerAction.bind(null, locale, tournamentId, registrationId),
    initialFormState,
  );
  // A new answer redraws the fields with what was typed; choosing again hides the preview.
  const [seen, setSeen] = useState(state);
  const [version, setVersion] = useState(0);
  const [stale, setStale] = useState(false);
  if (state !== seen) {
    setSeen(state);
    setVersion((v) => v + 1);
    setStale(false);
  }
  const preview = !stale && !state.done ? state.preview : undefined;
  const euro = (cents: number) => formatEuro(cents, locale);
  const fieldError = (key: string) => {
    const code = Object.entries(state.fields ?? {}).find(
      ([k]) => k === key || k.startsWith(`${key}.`),
    )?.[1];
    return code ? te(code as 'invalid') : null;
  };
  const allowNew = state.values?.allowNew === '1';
  // Player 2 is replaced unless the organiser picks player 1; the search then offers partners
  // who may play with the player who stays.
  const [replace, setReplace] = useState(
    (state.values?.replace as string | undefined) ?? players[1]?.id ?? '',
  );
  const stays = players.find((p) => p.id !== replace);

  if (state.done)
    return (
      <FormSuccess>
        {t('partnerChanged', { name: state.done.name, event: state.done.event })}
      </FormSuccess>
    );

  return (
    <form action={action} className="mt-2 w-80 max-w-full space-y-3 whitespace-normal" noValidate>
      <FormError state={state} />
      {allowNew && <input type="hidden" name="allowNew" value="1" />}
      {players.length > 1 ? (
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium">{t('replaceWho')}</legend>
          {players.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="replace"
                value={p.id}
                checked={replace === p.id}
                onChange={() => {
                  setReplace(p.id);
                  setStale(true);
                }}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <PlayerChooser
        prefix="partner"
        label={t('changePartnerNew')}
        tournamentId={tournamentId}
        eventId={eventId}
        partnerOf={stays?.memberNumber}
        includeEntered
        onChoose={() => setStale(true)}
        error={fieldError('partner')}
        values={state.values}
        version={version}
      />
      {state.duplicates && state.duplicates.partner.length > 0 && (
        <div className="space-y-2 rounded-md border border-brand/50 p-3 text-sm">
          <p className="font-medium">{ta('duplicateTitle')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {state.duplicates.partner.map((d) => (
              <li key={d.memberNumber}>
                {d.name} · {d.memberNumber}
                {d.born ? ` · ${ta('bornIn', { year: d.born })}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{ta('duplicateHint')}</p>
          <Button type="submit" name="allowNew" value="1" size="sm" variant="secondary">
            {ta('addAnyway')}
          </Button>
        </div>
      )}
      {preview && (
        <div className="space-y-2 rounded-md border bg-secondary p-3 text-sm" aria-live="polite">
          <p className="font-medium">{t('changePartnerSummary')}</p>
          <ul className="list-disc space-y-1 pl-5">
            {preview.oldPartner ? (
              <li>
                {t('previewOld', { name: preview.oldPartner.name })}{' '}
                {preview.oldPartner.refundCents > 0
                  ? t('previewRefund', {
                      name: preview.oldPartner.name,
                      amount: euro(preview.oldPartner.refundCents),
                    })
                  : t('previewNoRefund', { name: preview.oldPartner.name })}
              </li>
            ) : (
              <li>{t('previewNoOld')}</li>
            )}
            <li>
              {preview.newPartner.memberNumber
                ? t('previewNew', { name: preview.newPartner.name })
                : t('previewNewPlayer', { name: preview.newPartner.name })}{' '}
              {preview.newPartner.paidMoves
                ? t('previewPaidMoves', { name: preview.newPartner.name })
                : t('previewUnpaid', { name: preview.newPartner.name })}
            </li>
            {preview.from && !preview.from.with && (
              <li>{t('previewFromAlone', { name: preview.newPartner.name })}</li>
            )}
          </ul>
          {preview.from?.with && (
            <fieldset className="space-y-1">
              <legend className="font-medium">
                {t('leftBehindQuestion', {
                  name: preview.newPartner.name,
                  other: preview.from.with,
                })}
              </legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="leftBehind"
                  value="keep"
                  defaultChecked={preview.from.defaultChoice === 'keep'}
                  className="mt-1"
                />
                {t('leftBehindKeep', { other: preview.from.with })}
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="leftBehind"
                  value="cancel"
                  defaultChecked={preview.from.defaultChoice === 'cancel'}
                  className="mt-1"
                />
                <span>
                  {t('leftBehindCancel')}
                  {preview.from.refundCents > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      ({t('leftBehindRefund', { amount: euro(preview.from.refundCents) })})
                    </span>
                  )}
                </span>
              </label>
            </fieldset>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify" defaultChecked />
            {t('notifyPlayers')}
          </label>
        </div>
      )}
      {preview ? (
        <SubmitButton name="confirm" value="1" size="sm">
          {t('changePartnerConfirm')}
        </SubmitButton>
      ) : (
        <SubmitButton size="sm" variant="secondary">
          {t('changePartnerCheck')}
        </SubmitButton>
      )}
    </form>
  );
}
