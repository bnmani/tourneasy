'use client';

import { ChevronDown, FileDown, FileSpreadsheet, LayoutGrid } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const ICONS = { pdf: FileDown, xlsx: FileSpreadsheet, courts: LayoutGrid } as const;

export type ExportItem = { label: string; href: string; kind: keyof typeof ICONS };

/** "Export ▾" with a short list of downloads (schedule: PDF, Excel, per court; D79). */
export function ExportMenu({
  label,
  items,
  className,
}: {
  label: string;
  items: ExportItem[];
  /** Classes for the button, to match the page (portal button or public hero). */
  className: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Fixed below the button, so a parent with overflow: hidden (the page hero) can't clip it.
  const [pos, setPos] = useState<CSSProperties>({});
  const place = () => {
    const button = ref.current?.querySelector('summary')?.getBoundingClientRect();
    if (!button) return;
    const width = 224;
    const left = Math.max(8, Math.min(button.left, window.innerWidth - width - 8));
    setPos({ position: 'fixed', top: button.bottom + 4, left, width });
  };
  // Close on a click elsewhere, Escape or scrolling, like other menus.
  useEffect(() => {
    const shut = () => {
      if (ref.current?.open) ref.current.open = false;
    };
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', shut, { passive: true });
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', shut);
      window.removeEventListener('resize', shut);
    };
  }, []);
  return (
    <details
      ref={ref}
      className="relative"
      onToggle={(e) => {
        if (e.currentTarget.open) place();
      }}
    >
      <summary
        className={cn('cursor-pointer list-none [&::-webkit-details-marker]:hidden', className)}
      >
        <FileDown aria-hidden="true" className="size-4" />
        {label}
        <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      <ul
        style={pos}
        className="absolute right-0 z-50 mt-1 min-w-52 rounded-md border bg-card p-1 text-sm text-card-foreground shadow-lg"
      >
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <li key={item.href}>
              <a
                href={item.href}
                download
                onClick={() => {
                  if (ref.current) ref.current.open = false;
                }}
                className="flex items-center gap-2 rounded px-3 py-2 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
