'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('Admin');
  const pathname = usePathname();
  const items = [
    { href: '/admin', label: t('navDashboard'), exact: true },
    { href: '/admin/tournaments', label: t('navTournaments') },
    ...(isAdmin
      ? [
          { href: '/admin/players', label: t('navPlayers') },
          { href: '/admin/venues', label: t('navVenues') },
          { href: '/admin/clubs', label: t('navClubs') },
          { href: '/admin/payments', label: t('navPayments') },
          { href: '/admin/users', label: t('users') },
          { href: '/admin/appearance', label: t('navAppearance') },
          { href: '/admin/email', label: t('navEmail') },
          { href: '/admin/audit', label: t('navAudit') },
        ]
      : []),
  ];
  return (
    <nav aria-label={t('portal')} className="min-w-0">
      <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
