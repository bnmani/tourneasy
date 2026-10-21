'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * Friendly fallback instead of Next.js' blank "Application error" screen. The most common cause
 * on a live site is a page that was opened before a new version was deployed; reloading fixes it.
 */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations('ErrorPage');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-3 text-muted-foreground">{t('text')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => window.location.reload()}>
          <RotateCw aria-hidden="true" />
          {t('reload')}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t('home')}</Link>
        </Button>
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted-foreground">{error.digest}</p>}
    </div>
  );
}
