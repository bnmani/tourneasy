import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { helpGuide, PUBLIC_GUIDES } from '@/content/help';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { CONTACT_EMAIL } from '@/lib/site';
import { getActor } from '@/server/auth/web';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Help' });
  return { title: t('title'), description: t('intro') };
}

/** The help index (D92): the public guides, plus the administrator guide for admins. */
export default async function HelpPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const [t, actor] = await Promise.all([getTranslations('Help'), getActor()]);
  const cards = [
    ...PUBLIC_GUIDES.map((key) => ({ key, href: `/help/${key}`, extra: null })),
    ...(actor?.roles.includes('ADMIN')
      ? [{ key: 'admins' as const, href: '/admin/help', extra: t('adminOnly') }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{t('intro')}</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map(({ key, href, extra }) => {
          const guide = helpGuide(locale, key);
          return (
            <li key={key}>
              <Link
                href={href}
                className="flex h-full flex-col rounded-lg border bg-card p-5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="font-heading text-xl font-semibold">{guide.title}</span>
                <span className="mt-1.5 text-muted-foreground">{guide.summary}</span>
                {extra && <span className="mt-1 text-sm text-muted-foreground">{extra}</span>}
                <span className="mt-4 text-sm font-medium text-primary">{t('read')} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-10 text-sm text-muted-foreground">{t('stuck', { email: CONTACT_EMAIL })}</p>
    </div>
  );
}
