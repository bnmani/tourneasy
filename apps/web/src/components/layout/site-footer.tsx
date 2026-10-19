import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function SiteFooter() {
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-border text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p>{t('tagline')}</p>
        <ul className="flex flex-wrap gap-4">
          <li>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              {t('privacy')}
            </Link>
          </li>
          <li>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              {t('terms')}
            </Link>
          </li>
        </ul>
        {/* Year passed as a string so it isn't formatted as "2.026" in Dutch. */}
        <p>{t('copyright', { year: String(new Date().getFullYear()) })}</p>
      </div>
    </footer>
  );
}
