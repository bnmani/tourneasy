import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getActor } from '@/server/auth/web';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  // Metadata renders alongside the layout's role check: don't reveal admin titles to others.
  if (!(await getActor())?.roles.includes('ADMIN')) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('title'), robots: { index: false } };
}

export default async function AdminHomePage({ params }: LocaleParams) {
  await pageLocale(params);
  const t = await getTranslations('Admin');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link
            href="/admin/users"
            className="flex h-full flex-col gap-2 rounded-lg border bg-card p-5 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Users aria-hidden="true" className="size-6 text-primary" />
            <span className="font-semibold">{t('users')}</span>
            <span className="text-sm text-muted-foreground">{t('usersIntro')}</span>
          </Link>
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">{t('comingNext')}</p>
    </div>
  );
}
