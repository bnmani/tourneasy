'use client';

import { Mail, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  searchPartnersAction,
  type PartnerSuggestion,
} from '@/server/actions/registration-actions';

const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * Partner for a doubles entry (D59): search registered players by name or member number and
 * pick one, or invite someone by email when they are not found. The chosen value is submitted
 * as `partner.<eventId>` (member number or email address).
 */
export function PartnerPicker({
  slug,
  eventId,
  disabled,
  error,
}: {
  slug: string;
  eventId: string;
  disabled: boolean;
  error: string | null;
}) {
  const t = useTranslations('Entry');
  const id = useId();
  const [mode, setMode] = useState<'search' | 'invite'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartnerSuggestion[]>([]);
  const [searched, setSearched] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<PartnerSuggestion | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

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
        const found = await searchPartnersAction(slug, eventId, value);
        setResults(found);
        setSearched(value);
        setOpen(true);
      });
    }, 250);
  }

  function pick(p: PartnerSuggestion) {
    setChosen(p);
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id={`${id}-label`}>
        {t('partner')}
      </p>

      {chosen ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary bg-secondary px-3 py-2 text-sm">
          <input type="hidden" name={`partner.${eventId}`} value={chosen.memberNumber} />
          <span>
            <span className="font-medium">{chosen.name}</span>
            <span className="block text-xs text-muted-foreground">
              {[chosen.club, chosen.memberNumber].filter(Boolean).join(' · ')}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setChosen(null)}
            disabled={disabled}
          >
            <X aria-hidden="true" />
            {t('partnerChange')}
          </Button>
        </div>
      ) : mode === 'invite' ? (
        <div className="space-y-2">
          <label htmlFor={`${id}-email`} className="sr-only">
            {t('partnerInviteEmail')}
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id={`${id}-email`}
              name={`partner.${eventId}`}
              type="email"
              placeholder={t('partnerInviteEmail')}
              disabled={disabled}
              autoComplete="off"
              aria-describedby={hintId}
              aria-invalid={error ? true : undefined}
              className={cn(inputClass, 'pl-9')}
            />
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {t('partnerInviteHint')}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setMode('search')}
            >
              {t('partnerBackToSearch')}
            </button>
          </p>
        </div>
      ) : (
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-[1.375rem] left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            role="combobox"
            aria-labelledby={`${id}-label`}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-describedby={hintId}
            aria-invalid={error ? true : undefined}
            value={query}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={t('partnerSearchPlaceholder')}
            disabled={disabled}
            autoComplete="off"
            className={cn(inputClass, 'pl-9')}
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
              {results.length > 0 ? (
                <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
                  {results.map((p, i) => (
                    <li
                      key={p.memberNumber}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(p)}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-sm',
                        i === active ? 'bg-secondary' : 'hover:bg-accent',
                      )}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[p.club, p.memberNumber].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p id={listId} role="status" className="px-3 py-2 text-sm text-muted-foreground">
                  {t('partnerNoResults', { query: searched })}
                </p>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMode('invite');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
              >
                <Mail aria-hidden="true" className="size-4" />
                {t('partnerInviteInstead')}
              </button>
            </div>
          )}
          <p id={hintId} className="mt-2 text-xs text-muted-foreground">
            {pending ? t('partnerSearching') : t('partnerSearchHint')}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setMode('invite')}
              disabled={disabled}
            >
              {t('partnerInviteInstead')}
            </button>
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
