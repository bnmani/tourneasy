'use client';

import { CheckCircle2, Circle } from 'lucide-react';
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
          'flex min-h-9 w-full items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors',
          shown
            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
            : 'border-dashed hover:bg-accent',
        )}
      >
        {shown ? (
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
        {name && <span className="truncate">{name}</span>}
        <span
          className={cn(
            name ? 'ml-auto' : 'font-medium',
            shown ? 'font-semibold' : 'text-muted-foreground',
          )}
        >
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

/**
 * A desk action that takes one short text (a discount code, a cancel reason) and updates the
 * page in place like the other quick buttons (D113).
 */
export function QuickTextAction({
  action,
  label,
  placeholder,
  maxLength,
  required = false,
  uppercase = false,
  variant = 'outline',
  className,
}: {
  action: (value: string) => Promise<QuickResult>;
  label: string;
  placeholder: string;
  maxLength: number;
  required?: boolean;
  uppercase?: boolean;
  variant?: ButtonProps['variant'];
  className?: string;
}) {
  const [value, setValue] = useState('');
  const { error, pending, run } = useQuick();
  return (
    <form
      className={cn('space-y-1', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (required && !value.trim()) return;
        run(() => action(value.trim()));
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <input
          value={value}
          onChange={(e) => setValue(uppercase ? e.target.value.toUpperCase() : e.target.value)}
          maxLength={maxLength}
          aria-label={placeholder}
          placeholder={placeholder}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base sm:text-xs"
        />
        <Button type="submit" size="sm" variant={variant} className="h-8" disabled={pending}>
          {label}
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}
