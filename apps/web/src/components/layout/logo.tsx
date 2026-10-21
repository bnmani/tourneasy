import { cn } from '@/lib/utils';

/**
 * Logo A "Shuttle" (D43): a shuttlecock in a round badge with a band in the brand accent.
 * Colours come from the active theme, so the mark follows theme changes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn('shrink-0', className)}>
      <circle cx="20" cy="20" r="19" fill="var(--primary)" />
      <g transform="translate(0 1.6)">
        <g fill="var(--primary-foreground)">
          <path d="M11 9.2 L15.2 8.3 L18.1 23 L16.5 23 Z" />
          <path d="M15.8 8.2 L19.7 7.9 L19.85 23 L18.4 23 Z" />
          <path d="M20.3 7.9 L24.2 8.2 L21.6 23 L20.15 23 Z" />
          <path d="M24.8 8.3 L29 9.2 L23.5 23 L21.9 23 Z" />
          <path d="M16.3 23.7 H23.7 V24.4 A3.7 3.7 0 0 1 16.3 24.4 Z" />
        </g>
        <path d="M14.3 17 H25.7" stroke="var(--brand)" strokeWidth="1.9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Full logo: mark, name and tagline. The tagline is part of the brand, so it isn't translated. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-9" />
      <span className="leading-none">
        <span className="block font-heading text-xl font-bold tracking-tight">Tourneasy</span>
        {!compact && (
          <span className="mt-1 block text-[0.6rem] font-semibold tracking-[0.2em] whitespace-nowrap uppercase opacity-75">
            Tournament made easy
          </span>
        )}
      </span>
    </span>
  );
}
