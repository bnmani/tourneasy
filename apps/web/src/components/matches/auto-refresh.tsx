'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Live updates by polling (D57, Hostinger-friendly): re-renders the page's server data every
 * `seconds` while the tab is visible.
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
