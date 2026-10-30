'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useOptimistic, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { setFoodAccessAction } from '@/server/actions/pricing-food-actions';

/** Owner: food ordering on or off for one tournament (D87), as a switch that shows its state. */
export function FoodAccessToggle({
  locale,
  tournamentId,
  on,
  label,
  stateLabel,
}: {
  locale: AppLocale;
  tournamentId: string;
  on: boolean;
  label: string;
  /** "On" / "Off" next to the switch. */
  stateLabel: { on: string; off: string };
}) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      setShown(!shown);
      await setFoodAccessAction(locale, tournamentId, !shown);
    });
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={label}
      onClick={flip}
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-3 rounded-md p-1 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-70"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
          shown ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-background shadow transition-transform',
            shown ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
      <span className="w-8">{shown ? stateLabel.on : stateLabel.off}</span>
    </button>
  );
}
