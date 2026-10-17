import { getTranslations } from 'next-intl/server';

export async function SiteFooter() {
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-border text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 sm:flex-row sm:justify-between">
        <p>{t('tagline')}</p>
        {/* Year passed as a string so it isn't formatted as "2.026" in Dutch. */}
        <p>{t('copyright', { year: String(new Date().getFullYear()) })}</p>
      </div>
    </footer>
  );
}
