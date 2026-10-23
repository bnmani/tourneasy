'use client';

import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type CarouselItem = {
  slug: string;
  name: string;
  dates: string;
  place: string | null;
  phase: string;
  phaseLabel: string;
  disciplines: string[];
  fee: string | null;
};

const INTERVAL_MS = 6000;

/**
 * Current and upcoming tournaments, one at a time. Auto-advances, but pauses while hovered or
 * focused and never moves for visitors who prefer reduced motion (WCAG 2.2.2).
 */
export function TournamentCarousel({
  items,
  labels,
}: {
  items: CarouselItem[];
  labels: { region: string; previous: string; next: string; slide: string; viewAll: string };
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);
  const count = items.length;
  const go = useCallback((i: number) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  useEffect(() => {
    if (paused || count < 2 || reducedMotion.current) return;
    const timer = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [index, paused, count, go]);

  if (count === 0) return null;
  const item = items[index]!;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="rounded-xl bg-hero-card p-5 text-hero-card-foreground shadow-[0_30px_60px_-30px_rgb(0_0_0/0.55)] sm:p-6"
    >
      <div
        aria-roledescription="slide"
        aria-label={labels.slide
          .replace('{current}', String(index + 1))
          .replace('{total}', String(count))}
        className="grid gap-5 md:grid-cols-[280px_1fr] md:items-center"
      >
        <div
          aria-hidden="true"
          className="relative h-32 overflow-hidden rounded-lg bg-[linear-gradient(135deg,var(--primary),var(--brand))] md:h-40"
        >
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_46px,rgb(255_255_255/0.14)_46px_48px)]" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40" />
          <span
            className={cn(
              'absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-bold',
              item.phase === 'inProgress'
                ? 'bg-live text-live-foreground'
                : 'bg-hero text-hero-foreground',
            )}
          >
            {item.phaseLabel}
          </span>
        </div>
        <div className="min-w-0" aria-live={paused ? 'polite' : 'off'}>
          <h2 className="font-heading text-2xl leading-tight font-semibold">
            <Link href={`/tournaments/${item.slug}`} className="underline-offset-4 hover:underline">
              {item.name}
            </Link>
          </h2>
          <p className="mt-1 opacity-85">{item.dates}</p>
          {item.place && (
            <p className="mt-1 flex items-center gap-1.5 opacity-85">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {item.place}
            </p>
          )}
          <p className="mt-3 text-sm opacity-85">
            {[item.disciplines.join(' · '), item.fee].filter(Boolean).join('   ·   ')}
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={it.slug}
              type="button"
              onClick={() => go(i)}
              aria-label={labels.slide
                .replace('{current}', String(i + 1))
                .replace('{total}', String(count))}
              aria-current={i === index ? 'true' : undefined}
              className={cn(
                'h-2 rounded-full bg-current transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                i === index ? 'w-6 opacity-100' : 'w-2 opacity-35',
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tournaments"
            className="mr-1 text-sm font-semibold underline-offset-4 hover:underline"
          >
            {labels.viewAll}
          </Link>
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label={labels.previous}
                className="grid size-9 place-items-center rounded-full border border-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label={labels.next}
                className="grid size-9 place-items-center rounded-full border border-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
