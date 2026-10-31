import { Role } from '@tourneasy/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HelpGuideView } from '@/components/help/help-guide';
import { helpGuide } from '@/content/help';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return { title: helpGuide(locale, 'admins').title };
}

/** The administrator guide (D92): inside the portal, for admins only. */
export default async function AdminHelpPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, Role.ADMIN, `/${locale}/admin/help`);
  const t = await getTranslations('Help');
  const g = helpGuide(locale, 'admins');

  return (
    <>
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{g.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href="/help" className="underline underline-offset-4">
            {t('allGuides')}
          </Link>
        </p>
      </div>
      <HelpGuideView guide={g} locale={locale} contentsLabel={t('contents')} compact />
    </>
  );
}
