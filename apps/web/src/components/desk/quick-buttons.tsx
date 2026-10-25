'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useState, useTransition } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuickResult } from '@/server/actions/match-actions';

/**
 * Desk buttons that answer instantly (D74): the change shows at once and is saved in the
 * background; the page's data refreshes without reloading. On a refusal the button returns to
 * its previous state and says why.
 */
function useQuick() {
  const te = useTranslations('Errors');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<QuickResult>, before?: () => void) =>
    startTransition(async () => {
      setError(null);
      before?.();
      const result = await work();
      if (!result.ok)
        setError(
          te.has(result.error as 'unexpected')
            ? te(result.error as 'unexpected', { minutes: 15, min: 10 })
            : te('unexpected'),
        );
    });
  return { error, pending, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

/** One player's check-in on a match card. */
export function CheckInToggle({
  name,
  label,
  checkedIn,
  toggle,
  labels,
}: {
  /** Shown in the button (match cards); leave out where the name is next to it. */
  name?: string;
  /** Accessible name when no name is shown. */
  label?: string;
  checkedIn: boolean;
  /** Bound server action: sets the opposite of `checkedIn`. */
  toggle: () => Promise<QuickResult>;
  labels: { present: string; checkIn: string };
}) {
  const [shown, setShown] = useOptimistic(checkedIn);
  const { error, run } = useQuick();
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => run(toggle, () => setShown(!shown))}
        aria-pressed={shown}
        aria-label={name ? undefined : label}
        className={cn(
          'flex min-h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors',
          shown ? 'border-primary bg-secondary' : 'border-dashed',
        )}
      >
        <span aria-hidden="true">{shown ? '✓' : '○'}</span>
        {name && <span className="truncate">{name}</span>}
        <span className={cn(name ? 'ml-auto text-muted-foreground' : 'font-medium')}>
          {shown ? labels.present : labels.checkIn}
        </span>
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** A one-tap desk action (on court, walkover, pay at the desk), optionally confirmed first. */
export function QuickButton({
  action,
  children,
  confirm,
  className,
  ...props
}: Omit<ButtonProps, 'onClick' | 'type' | 'action'> & {
  action: () => Promise<QuickResult>;
  confirm?: string;
}) {
  const { error, pending, run } = useQuick();
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          run(action);
        }}
        {...props}
      >
        {children}
      </Button>
      <ErrorLine error={error} />
    </span>
  );
}
