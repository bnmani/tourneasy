'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { payAtDeskAction, playerCheckInAction } from '@/server/actions/match-actions';
import { CheckInToggle, QuickButton } from './quick-buttons';

export type CheckInRow = {
  playerId: string;
  name: string;
  memberNumber: string;
  club: string | null;
  /** "09:30 · 3 wedstrijden", formatted on the server. */
  when: string | null;
  present: boolean;
  /** "€ 25,00" when something is still to pay. */
  unpaid: string | null;
};

/** The day's players at the desk (D74): search, one tap per player, pay what's open. */
export function CheckInList({ tournamentId, rows }: { tournamentId: string; rows: CheckInRow[] }) {
  const t = useTranslations('Admin.desk');
  const [query, setQuery] = useState('');
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyAbsent || !r.present) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.memberNumber.toLowerCase().includes(q) ||
          (r.club ?? '').toLowerCase().includes(q)),
    );
  }, [rows, query, onlyAbsent]);
  const present = rows.filter((r) => r.present).length;

  return (
    <section aria-labelledby="checkin-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checkin-title" className="text-lg font-semibold">
          {t('presentCount', { present, total: rows.length })}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyAbsent}
            onChange={(e) => setOnlyAbsent(e.target.checked)}
            className="size-5 accent-primary"
          />
          {t('onlyAbsent')}
        </label>
      </div>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('checkInSearch')}
          placeholder={t('checkInSearch')}
          autoComplete="off"
          className="h-11 w-full rounded-md border border-input bg-background pr-3 pl-9 text-base sm:text-sm"
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noPlayers')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {shown.map((r) => (
            <li
              key={r.playerId}
              className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[r.memberNumber, r.club, r.when].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {r.unpaid && (
                  <>
                    <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                      {t('unpaid', { amount: r.unpaid })}
                    </span>
                    <QuickButton
                      size="sm"
                      variant="outline"
                      action={() => payAtDeskAction(tournamentId, r.playerId)}
                      confirm={t('payConfirm', { name: r.name, amount: r.unpaid })}
                    >
                      {t('payAtDesk')}
                    </QuickButton>
                  </>
                )}
                <div className="w-44">
                  <CheckInToggle
                    label={r.name}
                    checkedIn={r.present}
                    toggle={() => playerCheckInAction(tournamentId, r.playerId, !r.present)}
                    labels={{ present: t('present'), checkIn: t('checkIn') }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
