'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useSyncExternalStore } from 'react';
import { PRODUCTION_HOST } from '@/lib/site';

/**
 * Test site markings (D110). Decided in the browser from the address, so the same build can
 * never mark the live site: anything but tourneasy.com (and www) is the test site.
 */
function useTestSite() {
  return useSyncExternalStore(
    () => () => {},
    () => location.hostname.replace(/^www\./, '') !== PRODUCTION_HOST,
    () => false,
  );
}

/** Amber bar above the header on every page, with the way to the live site. */
export function TestSiteBanner() {
  const t = useTranslations('Common');
  const test = useTestSite();
  // "[TEST]" in front of the tab title; Next sets the title on every navigation.
  useEffect(() => {
    if (!test) return;
    const mark = () => {
      if (!document.title.startsWith('[TEST]')) document.title = `[TEST] ${document.title}`;
    };
    mark();
    const head = document.querySelector('head');
    if (!head) return;
    const observer = new MutationObserver(mark);
    observer.observe(head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [test]);
  if (!test) return null;
  return (
    <div
      role="note"
      className="bg-amber-400 px-4 py-1.5 text-center text-sm font-medium text-amber-950"
    >
      <strong>{t('testSite')}</strong> {t('testSiteText')}{' '}
      <a href={`https://${PRODUCTION_HOST}`} className="font-semibold whitespace-nowrap underline">
        {t('testSiteLink')}
      </a>
    </div>
  );
}

/** "TEST" next to the name in the logo. */
export function TestBadge() {
  const test = useTestSite();
  if (!test) return null;
  return (
    <span className="ml-1.5 rounded bg-amber-400 px-1.5 py-0.5 align-middle font-sans text-[0.65rem] font-bold tracking-wider text-amber-950">
      TEST
    </span>
  );
}
