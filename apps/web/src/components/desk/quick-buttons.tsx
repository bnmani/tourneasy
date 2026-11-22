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
  option,
}: {
  /** `checked` is the option's state (false when there is no option). */
  action: (value: string, checked: boolean) => Promise<QuickResult>;
  label: string;
  placeholder: string;
  maxLength: number;
  required?: boolean;
  uppercase?: boolean;
  variant?: ButtonProps['variant'];
  className?: string;
  /** A tick box under the field, e.g. "Hold the refund until an admin approves it". */
  option?: { label: string; defaultChecked: boolean };
}) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(option?.defaultChecked ?? false);
  const { error, pending, run } = useQuick();
  return (
    <form
      className={cn('space-y-1', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (required && !value.trim()) return;
        run(() => action(value.trim(), checked));
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
      {option && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          {option.label}
        </label>
      )}
      <ErrorLine error={error} />
    </form>
  );
}

/**
 * Desk (D126): a waiting match with no court yet. Choose the court and time, then it goes on
 * court straight away, so a match can't start without a court.
 */
export function QuickPlaceAction({
  courts,
  defaultCourtId,
  action,
  label,
  labels,
}: {
  courts: { id: string; label: string }[];
  defaultCourtId?: string;
  action: (courtId: string, startsAt: string) => Promise<QuickResult>;
  label: string;
  labels: { court: string };
}) {
  const [courtId, setCourtId] = useState(defaultCourtId ?? courts[0]?.id ?? '');
  const { error, pending, run } = useQuick();
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!courtId) return;
        run(() => action(courtId, nowInAmsterdam()));
      }}
    >
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{labels.court}</span>
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-base sm:text-xs"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pending}>
          {label}
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

/** Swap one team of a semi-final with one team of the other semi-final (D130). */
export function SwapTeamsForm({
  mine,
  theirs,
  action,
  labels,
}: {
  mine: { side: 'A' | 'B'; name: string }[];
  theirs: { side: 'A' | 'B'; name: string }[];
  action: (side: 'A' | 'B', otherSide: 'A' | 'B') => Promise<QuickResult>;
  labels: { title: string; mine: string; with: string; button: string };
}) {
  const [side, setSide] = useState<'A' | 'B'>(mine[0]!.side);
  const [otherSide, setOtherSide] = useState<'A' | 'B'>(theirs[0]!.side);
  const { error, pending, run } = useQuick();
  const selectClass =
    'h-8 max-w-full rounded-md border border-input bg-background px-2 text-base sm:text-xs';
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{labels.title}</summary>
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => action(side, otherSide));
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{labels.mine}</span>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as 'A' | 'B')}
            className={selectClass}
          >
            {mine.map((o) => (
              <option key={o.side} value={o.side}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{labels.with}</span>
          <select
            value={otherSide}
            onChange={(e) => setOtherSide(e.target.value as 'A' | 'B')}
            className={selectClass}
          >
            {theirs.map((o) => (
              <option key={o.side} value={o.side}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pending}>
          {labels.button}
        </Button>
        <ErrorLine error={error} />
      </form>
    </details>
  );
}

/** The current date and time in Dutch time, as a datetime-local value (YYYY-MM-DDTHH:MM). */
function nowInAmsterdam() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * "Now" next to a date and time box (D135): fills in the current date and time, so a match put
 * on court right now doesn't get a wrong time by a slip. Give `onPick` for a controlled box;
 * otherwise it fills the box named `startsAt` in the same form.
 */
export function NowButton({ label, onPick }: { label: string; onPick?: (value: string) => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8"
      onClick={(e) => {
        const value = nowInAmsterdam();
        if (onPick) return onPick(value);
        const input = e.currentTarget.form?.elements.namedItem('startsAt');
        if (input instanceof HTMLInputElement) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }}
    >
      {label}
    </Button>
  );
}
