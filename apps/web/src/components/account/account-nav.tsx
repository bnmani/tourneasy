'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function AccountNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('Account');
  const ta = useTranslations('Admin');
  const pathname = usePathname();
  const items = [
    { href: '/account', label: t('dashboard') },
    { href: '/account/profile', label: t('profile') },
    { href: '/account/security', label: t('security') },
    { href: '/account/privacy', label: t('privacy') },
    ...(isAdmin ? [{ href: '/admin', label: ta('nav') }] : []),
  ];
  return (
    <nav aria-label={t('nav')}>
      <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active =
            item.href === '/account' ? pathname === item.href : pathname.startsWith(item.href);
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
