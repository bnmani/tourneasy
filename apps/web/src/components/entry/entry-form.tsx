'use client';

import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { Check, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition, type FormEvent } from 'react';
import { FormError } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { enterAction } from '@/server/actions/registration-actions';

export type EntryEventOption = {
  id: string;
  label: string;
  doubles: boolean;
  feeCents: number;
  spots: string | null;
  full: boolean;
  isOpen: boolean;
  alreadyEntered: boolean;
  reasons: string[];
};

const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The entry form. Submitted with startTransition rather than <form action> so React does not
 * reset the choices when the server reports a problem (e.g. an unknown partner).
 */
export function EntryForm({
  locale,
  slug,
  events,
  maxEvents,
  enteredCount,
  phone,
}: {
  locale: AppLocale;
  slug: string;
  events: EntryEventOption[];
  maxEvents: number;
  enteredCount: number;
  phone: string;
}) {
  const t = useTranslations('Entry');
  const te = useTranslations('Errors');
  const [state, dispatch] = useActionState(enterAction.bind(null, locale, slug), initialFormState);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [looking, setLooking] = useState<Record<string, boolean>>({});
  const room = Math.max(0, maxEvents - enteredCount);
  const total = events
    .filter((e) => selected.includes(e.id))
    .reduce((sum, e) => sum + e.feeCents, 0);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const fieldError = (key: string) => {
    const code = state.fields?.[key];
    return code ? te(code as 'invalid') : null;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormError state={state} />

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-heading text-xl font-semibold">{t('events')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('eventsHint', { max: maxEvents, entered: enteredCount })}
        </p>
        {fieldError('events') && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {fieldError('events')}
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {events.map((e) => {
            const blocked = !e.isOpen || e.alreadyEntered || e.reasons.length > 0;
            const checked = selected.includes(e.id);
            const atLimit = !checked && selected.length >= room;
            const error = fieldError(`event.${e.id}`);
            const partnerError = fieldError(`partner.${e.id}`);
            return (
              <li
                key={e.id}
                className={cn(
                  'rounded-md border p-4 transition-colors',
                  checked && 'border-primary bg-secondary/60',
                  blocked && 'opacity-70',
                )}
              >
                <label
                  className={cn(
                    'flex items-start gap-3',
                    blocked || atLimit ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    name="eventId"
                    value={e.id}
                    checked={checked}
                    disabled={blocked || atLimit}
                    onChange={() => toggle(e.id)}
                    className="mt-1 size-5 shrink-0 accent-primary"
                    aria-describedby={`event-${e.id}-info`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-semibold">
                        {e.label}
                        {e.doubles && (
                          <Users
                            aria-hidden="true"
                            className="ml-1.5 inline size-4 text-muted-foreground"
                          />
                        )}
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatEuro(e.feeCents, locale)}{' '}
                        <span className="font-normal text-muted-foreground">{t('feeNote')}</span>
                      </span>
                    </span>
                    <span
                      id={`event-${e.id}-info`}
                      className="mt-0.5 block text-sm text-muted-foreground"
                    >
                      {e.alreadyEntered ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Check aria-hidden="true" className="size-4" /> {t('entered')}
                        </span>
                      ) : !e.isOpen ? (
                        t('closed')
                      ) : e.reasons.length > 0 ? (
                        e.reasons.join(' · ')
                      ) : e.full ? (
                        <span className="font-medium text-accent-text">{t('full')}</span>
                      ) : (
                        e.spots
                      )}
                    </span>
                  </span>
                </label>
                {error && (
                  <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}

                {checked && e.doubles && (
                  <div className="mt-4 space-y-2 border-t pt-4 sm:pl-8">
                    <label htmlFor={`partner-${e.id}`} className="text-sm font-medium">
                      {t('partner')}
                    </label>
                    <input
                      id={`partner-${e.id}`}
                      name={`partner.${e.id}`}
                      placeholder={t('partnerPlaceholder')}
                      disabled={looking[e.id]}
                      autoComplete="off"
                      aria-invalid={partnerError ? true : undefined}
                      aria-describedby={`partner-${e.id}-hint`}
                      className={inputClass}
                    />
                    <p id={`partner-${e.id}-hint`} className="text-xs text-muted-foreground">
                      {t('partnerHint')}
                    </p>
                    {partnerError && (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        {partnerError}
                      </p>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`looking.${e.id}`}
                        checked={!!looking[e.id]}
                        onChange={(ev) => setLooking((l) => ({ ...l, [e.id]: ev.target.checked }))}
                        className="size-4 accent-primary"
                      />
                      {t('lookingForPartner')}
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <label htmlFor="phone" className="text-sm font-medium">
          {t('mobile')}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          autoComplete="tel"
          aria-describedby="phone-hint"
          className={cn(inputClass, 'mt-1.5 sm:max-w-xs')}
        />
        <p id="phone-hint" className="mt-1 text-xs text-muted-foreground">
          {t('mobileHint')}
        </p>
        {fieldError('phone') && (
          <p role="alert" className="mt-1 text-sm font-medium text-destructive">
            {fieldError('phone')}
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-heading text-xl font-semibold">{t('summary')}</h2>
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">{t('selected', { count: selected.length })}</span>
          <span className="text-right">
            <span className="block text-sm text-muted-foreground">{t('total')}</span>
            <span className="font-heading text-2xl font-semibold">{formatEuro(total, locale)}</span>
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t('payNote')}</p>
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="text-sm">
            {t('terms')}{' '}
            <Link
              href="/terms"
              target="_blank"
              className="text-accent-text underline underline-offset-4"
            >
              {t('termsLink')}
            </Link>
          </span>
        </label>
        {fieldError('acceptTerms') && (
          <p role="alert" className="mt-2 text-sm font-medium text-destructive">
            {fieldError('acceptTerms')}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-5 w-full sm:w-auto" disabled={pending}>
          {t('submit')}
        </Button>
      </section>
    </form>
  );
}
