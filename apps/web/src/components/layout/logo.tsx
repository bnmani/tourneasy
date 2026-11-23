import { cn } from '@/lib/utils';
import { TestBadge } from './test-site';

/**
 * The Tourneasy mark: the infinity loop with the shuttlecock. The picture is transparent around
 * the artwork, so the square behind it takes the active theme's primary colour and follows
 * theme changes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 rounded-md bg-[var(--logo-bg)] p-1.5', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo-mark.png" alt="" className="size-full" />
    </span>
  );
}

/** Full logo: mark, name and tagline. The tagline is part of the brand, so it isn't translated. */
export function Logo({
  className,
  compact = false,
  taglineFrom,
}: {
  className?: string;
  compact?: boolean;
  /** Hide the tagline on very narrow screens (the header on small phones). */
  taglineFrom?: 'sm';
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-12" />
      <span className="leading-none">
        <span className="block font-heading text-xl font-bold tracking-tight">
          Tourneasy
          <TestBadge />
        </span>
        {!compact && (
          <span
            className={cn(
              'mt-1 block text-[0.6rem] font-semibold tracking-[0.2em] whitespace-nowrap uppercase opacity-75',
              taglineFrom === 'sm' && 'max-[420px]:hidden',
            )}
          >
            Tournament made easy
          </span>
        )}
      </span>
    </span>
  );
}
