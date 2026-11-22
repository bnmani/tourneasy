'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FoodOrderRow = {
  id: string;
  /** What the search matches against (lowercased on the page or here). */
  text: string;
  node: ReactNode;
};

export type FoodOrderGroup = {
  key: string;
  title: string;
  /** Shown when the group has no orders and no search is typed. Omitted: the group is hidden. */
  emptyText?: string;
  rows: FoodOrderRow[];
  className?: string;
};

type Props = {
  groups: FoodOrderGroup[];
  searchLabel: string;
  searchPlaceholder: string;
  noMatches: string;
};

/**
 * The orders to hand out and the collected ones. Typing filters them on the spot: no submit,
 * no page reload, so the list stays where the organiser is looking.
 */
export function FoodOrderList({ groups, searchLabel, searchPlaceholder, noMatches }: Props) {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const q = query.trim().toLowerCase();
  const shown = groups.map((g) => ({
    ...g,
    rows: q ? g.rows.filter((r) => r.text.toLowerCase().includes(q)) : g.rows,
  }));
  const matches = shown.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={inputId} className="sr-only">
          {searchLabel}
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-base sm:text-sm"
        />
      </div>
      {q && matches === 0 && <p className="text-sm text-muted-foreground">{noMatches}</p>}
      {shown.map((g) => {
        if (q && g.rows.length === 0) return null;
        if (!q && g.rows.length === 0 && !g.emptyText) return null;
        return (
          <div key={g.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{g.title}</h3>
            {g.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{g.emptyText}</p>
            ) : (
              <ul className={cn('divide-y rounded-md border', g.className)}>
                {g.rows.map((r) => (
                  <Fragment key={r.id}>{r.node}</Fragment>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
