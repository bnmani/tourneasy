'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Live updates by polling (D57, Hostinger-friendly): re-renders the page's server data every
 * `seconds` while the tab is visible, and as soon as the tab is shown again.
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    // Back on the tab (another desk may have changed things): refresh straight away.
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);
  return null;
}
