import type { AppLocale } from '@tourneasy/shared/i18n';
import { LayoutDashboard, LogOut, Shield } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { logoutAction } from '@/server/actions/auth-actions';
import { getActor } from '@/server/auth/web';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { SmartHeader } from './smart-header';

const navLink =
  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const mobileLink =
  'block border-b border-border px-1 py-3 font-semibold last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export async function SiteHeader() {
  const t = await getTranslations('Header');
  const locale = (await getLocale()) as AppLocale;
  const actor = await getActor();
  // Tournament, live, results and player pages join the menu in Phase 3 (no dead links until then).
  const links = [
    { href: '/', label: t('home') },
    { href: '/#about', label: t('about') },
  ];

  return (
    <SmartHeader
      openLabel={t('openMenu')}
      closeLabel={t('closeMenu')}
      mobileMenu={
        <nav aria-label={t('mainNav')} className="mx-auto max-w-6xl px-4 pb-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={mobileLink}>
              {l.label}
            </Link>
          ))}
          {!actor && (
            <Link href="/login" className={mobileLink}>
              {t('login')}
            </Link>
          )}
          <div className="pt-3">
            <LanguageSwitcher />
          </div>
        </nav>
      }
    >
      <Link
        href="/"
        aria-label={t('homeLink')}
        className="shrink-0 rounded-md text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Logo />
      </Link>

      <nav aria-label={t('mainNav')} className="ml-4 hidden items-center gap-1 md:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={navLink}>
            {l.label}
          </Link>
        ))}
      </nav>

      <nav aria-label={t('accountMenu')} className="ml-auto flex items-center gap-1 sm:gap-2">
        {actor ? (
          <>
            {actor.roles.includes('ADMIN') && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin">
                  <Shield aria-hidden="true" />
                  <span className="sr-only lg:not-sr-only">{t('admin')}</span>
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/account">
                <LayoutDashboard aria-hidden="true" />
                <span className="sr-only lg:not-sr-only">{t('dashboard')}</span>
              </Link>
            </Button>
            <form action={logoutAction.bind(null, locale)}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut aria-hidden="true" />
                <span className="sr-only lg:not-sr-only">{t('logout')}</span>
              </Button>
            </form>
          </>
        ) : (
          <>
            <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
              <Link href="/login">{t('login')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">{t('register')}</Link>
            </Button>
          </>
        )}
        <div className="hidden md:block">
          <LanguageSwitcher />
        </div>
      </nav>
    </SmartHeader>
  );
}
