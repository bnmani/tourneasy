import { Trophy } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

export async function SiteHeader() {
  const t = await getTranslations('Header');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="flex items-center gap-2 rounded-md text-lg font-bold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Trophy aria-hidden="true" className="size-6 text-primary" />
          <span>Tourneasy</span>
        </Link>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
