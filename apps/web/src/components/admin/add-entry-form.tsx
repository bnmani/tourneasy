'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { Search, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  addEntryAction,
  searchPlayersForEntryAction,
  type AddEntryState,
  type EntryPlayerOption,
} from '@/server/actions/entry-admin-actions';

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type EventOption = { id: string; label: string; doubles: boolean };

/**
 * Organisers add an entry (player or pair) by picking registered players, or typing a new
 * player's details (D63). After saving the form stays on the category for the next pair.
 */
export function AddEntryForm({
  locale,
  tournamentId,
  events,
}: {
  locale: AppLocale;
  tournamentId: string;
  events: EventOption[];
}) {
  const t = useTranslations('Admin.addEntry');
  const te = useTranslations('Errors');
  const [state, action] = useActionState<AddEntryState, FormData>(
    addEntryAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [player, setPlayer] = useState<EntryPlayerOption | null>(null);
  // An existing player picked from the duplicate warning (D82), per side.
  const [presets, setPresets] = useState<{
    player?: EntryPlayerOption;
    partner?: EntryPlayerOption;
  }>({});
  const event = events.find((e) => e.id === eventId);
  // A fresh pair of fields after each saved entry.
  const round = state.added?.count ?? 0;
  const [seenRound, setSeenRound] = useState(round);
  if (round !== seenRound) {
    setSeenRound(round);
    setPlayer(null);
    setPresets({});
  }
  // React resets the form after every answer; a new version redraws the fields with what was
  // typed (or chosen), so an error or a duplicate warning doesn't wipe them.
  const [seenState, setSeenState] = useState(state);
  const [version, setVersion] = useState(0);
  if (state !== seenState) {
    setSeenState(state);
    setVersion((v) => v + 1);
  }
  const pickExisting = (side: 'player' | 'partner', option: EntryPlayerOption) => {
    setPresets((p) => ({ ...p, [side]: option }));
    if (side === 'player') setPlayer(option);
  };
  const duplicates = state.duplicates;
  const fieldError = (key: string) => {
    const code = Object.entries(state.fields ?? {}).find(
      ([k]) => k === key || k.startsWith(`${key}.`),
    )?.[1];
    return code ? te(code as 'invalid') : null;
  };

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      {state.ok && state.added && (
        <FormSuccess>
          {t(state.added.status === 'WAITLISTED' ? 'addedWaitlist' : 'added', {
            name: state.added.name,
            event: state.added.event,
          })}
        </FormSuccess>
      )}
      <label className="block max-w-md space-y-1.5 text-sm font-medium">
        {t('event')}
        <select
          // React resets the form after each save, which puts the select back on its first
          // option while the state still holds the chosen one; a new element per round keeps
          // the screen and the form in step.
          key={`event-${version}`}
          name="eventId"
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setPlayer(null);
          }}
          className={inputClass}
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <div className={cn('grid gap-4', event?.doubles && 'lg:grid-cols-2')}>
        <PlayerChooser
          key={`p-${eventId}-${round}-${presets.player?.memberNumber ?? ''}`}
          prefix="player"
          preset={presets.player}
          values={state.values}
          version={version}
          label={event?.doubles ? t('player1') : t('player')}
          tournamentId={tournamentId}
          eventId={eventId}
          onChoose={setPlayer}
          error={fieldError('player')}
        />
        {event?.doubles && (
          <PlayerChooser
            key={`q-${eventId}-${round}-${player?.memberNumber ?? ''}-${presets.partner?.memberNumber ?? ''}`}
            prefix="partner"
            preset={presets.partner}
            values={state.values}
            version={version}
            label={t('player2')}
            tournamentId={tournamentId}
            eventId={eventId}
            partnerOf={player?.memberNumber}
            error={fieldError('partner')}
          />
        )}
      </div>
      {duplicates && (duplicates.player.length > 0 || duplicates.partner.length > 0) && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-semibold">{t('duplicateTitle')}</p>
          {(['player', 'partner'] as const).map((side) =>
            duplicates[side].length === 0 || presets[side] ? null : (
              <ul key={side} className="space-y-2">
                {duplicates[side].map((d) => (
                  <li key={d.memberNumber} className="flex flex-wrap items-center gap-3">
                    <span>
                      <span className="font-medium">{d.name}</span>{' '}
                      <span className="text-muted-foreground">
                        {[d.club, d.memberNumber, t('bornIn', { year: d.born })]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => pickExisting(side, d)}
                    >
                      {t('useExisting')}
                    </Button>
                  </li>
                ))}
              </ul>
            ),
          )}
          <p className="text-muted-foreground">{t('duplicateHint')}</p>
          <Button type="submit" name="allowNew" value="1" size="sm" variant="secondary">
            {t('addAnyway')}
          </Button>
        </div>
      )}
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}

function PlayerChooser({
  prefix,
  label,
  tournamentId,
  eventId,
  partnerOf,
  onChoose,
  error,
  preset,
  values,
  version,
}: {
  preset?: EntryPlayerOption;
  /** What was submitted last, to fill the new-player fields again after a reset. */
  values?: Record<string, string | string[]>;
  version: number;
  prefix: 'player' | 'partner';
  label: string;
  tournamentId: string;
  eventId: string;
  partnerOf?: string;
  onChoose?: (p: EntryPlayerOption | null) => void;
  error: string | null;
}) {
  const t = useTranslations('Admin.addEntry');
  const tg = useTranslations('Genders');
  const id = useId();
  const [mode, setMode] = useState<'search' | 'new'>(
    !preset && values?.[`${prefix}.mode`] === 'new' ? 'new' : 'search',
  );
  const typed = (k: string) => {
    const v = values?.[`${prefix}.new.${k}`];
    return typeof v === 'string' ? v : undefined;
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntryPlayerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<EntryPlayerOption | null>(preset ?? null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function choose(p: EntryPlayerOption | null) {
    setChosen(p);
    onChoose?.(p);
    setOpen(false);
    setQuery('');
  }

  function onType(value: string) {
    setQuery(value);
    setActive(-1);
    clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchPlayersForEntryAction(tournamentId, eventId, value, partnerOf));
        setOpen(true);
      });
    }, 250);
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <input type="hidden" name={`${prefix}.mode`} value={mode} />
      {chosen ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary bg-secondary px-3 py-2 text-sm">
          <input type="hidden" name={`${prefix}.memberNumber`} value={chosen.memberNumber} />
          <span>
            <span className="font-medium">{chosen.name}</span>
            <span className="block text-xs text-muted-foreground">
              {[chosen.club, chosen.memberNumber, chosen.born].filter(Boolean).join(' · ')}
            </span>
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => choose(null)}>
            <X aria-hidden="true" />
            {t('change')}
          </Button>
        </div>
      ) : mode === 'new' ? (
        <div key={`new-${version}`} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem_1fr]">
            <input
              name={`${prefix}.new.firstName`}
              defaultValue={typed('firstName')}
              placeholder={t('firstName')}
              aria-label={t('firstName')}
              className={inputClass}
              required
            />
            <input
              name={`${prefix}.new.lastNamePrefix`}
              defaultValue={typed('lastNamePrefix')}
              placeholder={t('prefix')}
              aria-label={t('prefix')}
              className={inputClass}
            />
            <input
              name={`${prefix}.new.lastName`}
              defaultValue={typed('lastName')}
              placeholder={t('lastName')}
              aria-label={t('lastName')}
              className={inputClass}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              name={`${prefix}.new.gender`}
              aria-label={t('gender')}
              defaultValue={typed('gender') ?? ''}
              className={inputClass}
              required
            >
              <option value="" disabled>
                {t('gender')}
              </option>
              <option value="MALE">{tg('MALE')}</option>
              <option value="FEMALE">{tg('FEMALE')}</option>
            </select>
            <input
              type="date"
              name={`${prefix}.new.dateOfBirth`}
              defaultValue={typed('dateOfBirth')}
              aria-label={t('dateOfBirth')}
              className={inputClass}
              required
            />
            <input
              type="email"
              name={`${prefix}.new.email`}
              defaultValue={typed('email')}
              placeholder={t('emailOptional')}
              aria-label={t('emailOptional')}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setMode('search')}
          >
            {t('backToSearch')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-5 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
            value={query}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (!open || results.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => (a + 1) % results.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
              } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault();
                choose(results[active]!);
              } else if (e.key === 'Escape') setOpen(false);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className={cn(inputClass, 'pl-9')}
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
              {results.length > 0 ? (
                <ul id={`${id}-list`} role="listbox" className="max-h-72 overflow-y-auto py-1">
                  {results.map((p, i) => (
                    <li
                      key={p.memberNumber}
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(p)}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-sm',
                        i === active ? 'bg-secondary' : 'hover:bg-accent',
                      )}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[p.club, p.memberNumber, p.born].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  id={`${id}-list`}
                  role="status"
                  className="px-3 py-2 text-sm text-muted-foreground"
                >
                  {t('noResults')}
                </p>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMode('new');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
              >
                <UserPlus aria-hidden="true" className="size-4" />
                {t('newPlayer')}
              </button>
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {pending ? t('searching') : t('searchHint')}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setMode('new')}
            >
              {t('newPlayer')}
            </button>
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
