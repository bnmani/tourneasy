'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const SHOW_NEAR_TOP_PX = 120;
const SCROLL_THRESHOLD_PX = 6;

/**
 * Sticky header that slides away while scrolling down and returns as soon as the visitor
 * scrolls up (or tabs into it), so the menu is always one small scroll away. On small screens
 * the main links move into a menu panel.
 */
export function SmartHeader({
  children,
  mobileMenu,
  openLabel,
  closeLabel,
}: {
  children: ReactNode;
  mobileMenu: ReactNode;
  openLabel: string;
  closeLabel: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const lastY = useRef(0);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y <= SHOW_NEAR_TOP_PX || y < lastY.current - SCROLL_THRESHOLD_PX) setHidden(false);
      else if (y > lastY.current + SCROLL_THRESHOLD_PX) setHidden(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      onFocusCapture={() => setHidden(false)}
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md transition-[translate,box-shadow] duration-300',
        hidden && !open && '-translate-y-full',
        scrolled && 'shadow-[0_8px_24px_-16px_rgb(0_0_0/0.45)]',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {children}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? closeLabel : openLabel}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
        >
          {open ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
      <div id="mobile-menu" hidden={!open} className="border-t border-border lg:hidden">
        {mobileMenu}
      </div>
    </header>
  );
}
