import { Trophy } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

export async function SiteHeader() {
  const t = await getTranslations('Header');

  return (
    <header className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="focus-visible:ring-ring flex items-center gap-2 rounded-md text-lg font-bold focus-visible:outline-none focus-visible:ring-2"
        >
          <Trophy aria-hidden="true" className="text-primary size-6" />
          <span>Tourneasy</span>
        </Link>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
