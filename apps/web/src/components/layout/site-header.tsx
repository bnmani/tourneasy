import type { AppLocale } from '@tourneasy/shared/i18n';
import { LayoutDashboard, LogOut, Shield } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getActor } from '@/server/auth/web';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { SmartHeader } from './smart-header';

const navLink =
  'rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const mobileLink =
  'block border-b border-border px-1 py-3 font-semibold last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export async function SiteHeader() {
  const t = await getTranslations('Header');
  const locale = (await getLocale()) as AppLocale;
  const actor = await getActor();
  // Live and results pages join the menu in Phase 6 (no links to pages that don't exist yet).
  const links = [
    { href: '/tournaments', label: t('tournaments') },
    { href: '/calendar', label: t('calendar') },
    { href: '/players', label: t('players') },
    { href: '/clubs', label: t('clubs') },
    { href: '/venues', label: t('venues') },
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
          {actor?.roles.includes('ADMIN') && (
            <Link href="/admin" className={mobileLink}>
              {t('admin')}
            </Link>
          )}
          {actor && (
            <form action={`/${locale}/logout`} method="post">
              <button type="submit" className={`${mobileLink} w-full text-left`}>
                {t('logout')}
              </button>
            </form>
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
        <Logo taglineFrom="sm" />
      </Link>

      <nav aria-label={t('mainNav')} className="ml-2 hidden items-center gap-0.5 lg:flex">
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
              <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
                <Link href="/admin" title={t('admin')}>
                  <Shield aria-hidden="true" />
                  <span className="sr-only 2xl:not-sr-only">{t('admin')}</span>
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/account" title={t('dashboard')}>
                <LayoutDashboard aria-hidden="true" />
                <span className="sr-only 2xl:not-sr-only">{t('dashboard')}</span>
              </Link>
            </Button>
            {/* On small screens admin and log out live in the menu panel. */}
            <form action={`/${locale}/logout`} method="post" className="hidden lg:block">
              <Button type="submit" variant="ghost" size="sm" title={t('logout')}>
                <LogOut aria-hidden="true" />
                <span className="sr-only 2xl:not-sr-only">{t('logout')}</span>
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
        <div className="hidden lg:block">
          <LanguageSwitcher />
        </div>
      </nav>
    </SmartHeader>
  );
}
