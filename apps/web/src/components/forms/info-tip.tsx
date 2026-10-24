'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Help text behind a small info icon next to a label: shown on hover, on keyboard focus and
 * on tap (phones). The text stays in the page as the field's description (aria-describedby),
 * so screen readers still read it with the field; it is hidden from the label itself so a
 * legend's name stays short. Positioned under the label row, which must be `relative`.
 */
export function InfoTip({ id, text }: { id: string; text: string }) {
  const t = useTranslations('Common');
  const [open, setOpen] = useState(false);
  return (
    <span className="group inline-flex">
      <button
        type="button"
        aria-label={t('moreInfo')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info aria-hidden="true" className="size-4" />
      </button>
      <span
        id={id}
        aria-hidden="true"
        className={cn(
          'invisible absolute top-full left-0 z-30 mt-1 w-full max-w-sm rounded-md border bg-card px-3 py-2 text-sm font-normal text-card-foreground opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100',
          open && 'visible opacity-100',
        )}
      >
        {text}
      </span>
    </span>
  );
}
