import type { TournamentPhase } from '@tourneasy/shared';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

/** Compact dark band at the top of public pages, in the theme's hero colours. */
export function PageHero({
  eyebrow,
  title,
  intro,
  logo,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  intro?: ReactNode;
  /** A tournament's own logo (D67), on a white tile so any logo reads on the dark hero. */
  logo?: { url: string; width: number; height: number; alt: string } | null;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-hero text-hero-foreground">
      <CourtLines className="opacity-[0.12]" />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own endpoint
          <img
            src={logo.url}
            alt={logo.alt}
            width={Math.round((logo.width / logo.height) * 56)}
            height={56}
            className="mb-4 h-14 w-auto max-w-[min(16rem,100%)] rounded-md bg-white object-contain p-1.5"
          />
        )}
        {eyebrow && (
          <div className="mb-3 text-xs font-bold tracking-[0.14em] text-hero-highlight uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="max-w-3xl text-3xl leading-tight font-semibold text-balance sm:text-5xl">
          {title}
        </h1>
        {intro && <div className="mt-3 max-w-2xl text-lg text-hero-muted">{intro}</div>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

/** Court lines in perspective, used as a quiet background pattern. */
export function CourtLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      <g fill="none" stroke="var(--hero-foreground)" strokeWidth="2">
        <path d="M640 30 L1180 30 L1290 330 L520 330 Z" />
        <path d="M670 30 L560 330 M1150 30 L1250 330 M910 30 L905 330" />
        <path d="M600 140 L1220 140 M570 230 L1255 230" />
      </g>
    </svg>
  );
}

const PHASE_STYLE: Record<TournamentPhase, string> = {
  registrationOpen: 'bg-brand text-brand-foreground',
  registrationSoon: 'bg-secondary text-secondary-foreground',
  registrationClosed: 'bg-muted text-muted-foreground',
  inProgress: 'bg-live text-live-foreground',
  finished: 'bg-muted text-muted-foreground',
};

export async function PhaseBadge({
  phase,
  className,
}: {
  phase: TournamentPhase;
  className?: string;
}) {
  const t = await getTranslations('Phases');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold',
        PHASE_STYLE[phase],
        className,
      )}
    >
      {phase === 'inProgress' && (
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {t(phase)}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
      {children}
    </span>
  );
}

/** Label/value pairs in a card. */
export function InfoList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="text-right font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
