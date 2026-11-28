'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import {
  createUmpireAction,
  resetUmpireAction,
} from '@/app/[locale]/admin/tournaments/[id]/umpires/actions';
import type {
  UmpireFormState,
  UmpireReveal,
} from '@/app/[locale]/admin/tournaments/[id]/umpires/state';

/** The PIN and QR code, once. Hiding it (or leaving the page) loses it for good. */
function RevealPanel({ reveal, onHide }: { reveal: UmpireReveal; onHide?: () => void }) {
  const t = useTranslations('Admin.umpires');
  return (
    <div
      role="status"
      className="space-y-3 rounded-md border border-primary/30 bg-secondary p-4 text-secondary-foreground"
    >
      <p className="font-semibold">{t('revealTitle', { name: reveal.displayName })}</p>
      <p className="text-sm">{t('revealOnce')}</p>
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-muted-foreground">{t('pin')}</p>
          <p className="font-mono text-3xl font-bold tracking-widest tabular-nums">{reveal.pin}</p>
        </div>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reveal.qrImage}
            alt={t('qrAlt', { name: reveal.displayName })}
            width={160}
            height={160}
            className="rounded bg-white"
          />
        </div>
      </div>
      <p className="text-xs break-all text-muted-foreground">
        {t('qrLink')}: {reveal.qrUrl}
      </p>
      {onHide && (
        <Button type="button" size="sm" variant="outline" onClick={onHide}>
          {t('hide')}
        </Button>
      )}
    </div>
  );
}

export function AddUmpireForm({
  locale,
  tournamentId,
}: {
  locale: AppLocale;
  tournamentId: string;
}) {
  const t = useTranslations('Admin.umpires');
  const [state, action] = useActionState<UmpireFormState, FormData>(
    createUmpireAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  const [hidden, setHidden] = useState<UmpireReveal | null>(null);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <FormError state={state} />
        <TextField name="displayName" label={t('name')} state={state} required maxLength={60} />
        <SubmitButton>{t('add')}</SubmitButton>
      </form>
      {state.reveal && state.reveal !== hidden && (
        <RevealPanel reveal={state.reveal} onHide={() => setHidden(state.reveal ?? null)} />
      )}
    </div>
  );
}

export function ResetUmpireForm({
  locale,
  tournamentId,
  umpireId,
  displayName,
}: {
  locale: AppLocale;
  tournamentId: string;
  umpireId: string;
  displayName: string;
}) {
  const t = useTranslations('Admin.umpires');
  const [state, action] = useActionState<UmpireFormState, FormData>(
    resetUmpireAction.bind(null, locale, tournamentId, umpireId),
    initialFormState,
  );
  const [hidden, setHidden] = useState<UmpireReveal | null>(null);
  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="displayName" value={displayName} />
        <FormError state={state} />
        <SubmitButton>{t('reset')}</SubmitButton>
      </form>
      {state.reveal && state.reveal !== hidden && (
        <RevealPanel reveal={state.reveal} onHide={() => setHidden(state.reveal ?? null)} />
      )}
    </div>
  );
}
