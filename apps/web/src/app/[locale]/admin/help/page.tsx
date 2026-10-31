import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HelpGuideView } from '@/components/help/help-guide';
import { type HelpGuideKey, helpGuide, staffGuides } from '@/content/help';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { requirePortal } from '@/server/auth/web';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Help' });
  return { title: t('title') };
}

/**
 * Help in the portal (D92): the staff guides this user's roles allow, one tab each. The owner
 * also sees the owner-only section of the administrator guide.
 */
export default async function PortalHelpPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale, `/${locale}/admin/help`);
  const t = await getTranslations('Help');
  const keys = staffGuides(actor.roles);
  const asked = firstParam((await searchParams).guide) as HelpGuideKey | undefined;
  const current = asked && keys.includes(asked) ? asked : keys[0]!;
  const guide = helpGuide(locale, current, actor.roles);

  return (
    <>
      <div className="space-y-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{guide.title}</h1>
        <div className="flex flex-wrap gap-2">
          {keys.length > 1 &&
            keys.map((key) => (
              <Link
                key={key}
                href={`/admin/help?guide=${key}`}
                aria-current={key === current ? 'page' : undefined}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium',
                  key === current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {helpGuide(locale, key).title}
              </Link>
            ))}
          <Link
            href="/help"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            {helpGuide(locale, 'players').title}
          </Link>
        </div>
      </div>
      <HelpGuideView guide={guide} locale={locale} contentsLabel={t('contents')} compact />
    </>
  );
}
