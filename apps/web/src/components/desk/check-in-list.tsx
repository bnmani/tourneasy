'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  payAtDeskAction,
  playerCheckInAction,
  undoPayAtDeskAction,
} from '@/server/actions/match-actions';
import { CheckInToggle, QuickButton } from './quick-buttons';

export type CheckInRow = {
  playerId: string;
  name: string;
  memberNumber: string;
  club: string | null;
  /** "09:30 · 3 wedstrijden", formatted on the server. */
  when: string | null;
  present: boolean;
  /** "Nu op baan 3" while the player is busy in another match, formatted on the server. */
  busy: string | null;
  /** "€ 25,00" when something is still to pay. */
  unpaid: string | null;
  /** Something was paid at the desk and can be undone (D96). */
  deskPaid: boolean;
};

/**
 * The day's players at the desk (D74, D140): two columns of player cards, not checked in on the
 * left and checked in on the right. A tap moves a player across (and back, as undo). Search
 * covers both columns.
 */
export function CheckInList({ tournamentId, rows }: { tournamentId: string; rows: CheckInRow[] }) {
  const t = useTranslations('Admin.desk');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.memberNumber.toLowerCase().includes(q) ||
        (r.club ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);
  const present = rows.filter((r) => r.present).length;
  const notYet = shown.filter((r) => !r.present);
  const here = shown.filter((r) => r.present);

  return (
    <section aria-labelledby="checkin-title" className="space-y-3">
      <h2 id="checkin-title" className="text-lg font-semibold">
        {t('presentCount', { present, total: rows.length })}
      </h2>
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
        <div className="grid grid-cols-2 items-start gap-3">
          <Column
            title={t('notCheckedInCount', { count: notYet.length })}
            rows={notYet}
            tournamentId={tournamentId}
          />
          <Column
            title={t('checkedInCount', { count: here.length })}
            rows={here}
            tournamentId={tournamentId}
          />
        </div>
      )}
    </section>
  );
}

function Column({
  title,
  rows,
  tournamentId,
}: {
  title: string;
  rows: CheckInRow[];
  tournamentId: string;
}) {
  const t = useTranslations('Admin.desk');
  return (
    <div className="min-w-0 space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('columnEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.playerId}>
              <CheckInToggle
                name={r.name}
                detail={[r.memberNumber, r.club, r.when].filter(Boolean).join(' · ')}
                checkedIn={r.present}
                busy={r.busy}
                toggle={() => playerCheckInAction(tournamentId, r.playerId, !r.present)}
                labels={{ checkedIn: t('checkedIn'), tapToCheckIn: t('tapToCheckIn') }}
                footer={
                  r.unpaid || r.deskPaid ? (
                    <div className="flex flex-wrap items-center gap-2">
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
                      {r.deskPaid && (
                        <QuickButton
                          size="sm"
                          variant="ghost"
                          action={() => undoPayAtDeskAction(tournamentId, r.playerId)}
                          confirm={t('undoPayConfirm', { name: r.name })}
                        >
                          {t('undoPay')}
                        </QuickButton>
                      )}
                    </div>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
