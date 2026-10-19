import type { AppLocale } from '@tourneasy/shared/i18n';
import { LayoutDashboard, LogOut, Shield, Trophy } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/server/actions/auth-actions';
import { getActor } from '@/server/auth/web';
import { LanguageSwitcher } from './language-switcher';

export async function SiteHeader() {
  const t = await getTranslations('Header');
  const locale = (await getLocale()) as AppLocale;
  const actor = await getActor();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="flex shrink-0 items-center gap-2 rounded-md text-lg font-bold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Trophy aria-hidden="true" className="size-6 text-primary" />
          <span className="hidden min-[400px]:inline">Tourneasy</span>
        </Link>

        <nav aria-label={t('accountMenu')} className="flex items-center gap-1 sm:gap-2">
          {actor ? (
            <>
              {actor.roles.includes('ADMIN') && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">
                    <Shield aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">{t('admin')}</span>
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/account">
                  <LayoutDashboard aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{t('dashboard')}</span>
                </Link>
              </Button>
              <form action={logoutAction.bind(null, locale)}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{t('logout')}</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('login')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t('register')}</Link>
              </Button>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
