import { getTranslations } from 'next-intl/server';

/**
 * Shown while a page loads: a quiet skeleton, announced once to screen readers. `contained`
 * when the layout already provides the page container (admin).
 */
export async function PageLoading({ contained = false }: { contained?: boolean }) {
  const t = await getTranslations('Common');
  return (
    <div
      role="status"
      aria-live="polite"
      className={contained ? 'w-full' : 'mx-auto w-full max-w-4xl px-4 py-10'}
    >
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="animate-pulse space-y-4 motion-reduce:animate-none">
        <div className="h-8 w-1/3 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="mt-8 h-32 rounded-lg bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
