import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { HelpGuideView } from '@/components/help/help-guide';
import { helpGuide, PUBLIC_GUIDES } from '@/content/help';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { CONTACT_EMAIL } from '@/lib/site';

type Params = { params: Promise<{ locale: string; guide: string }> };
type PublicGuide = (typeof PUBLIC_GUIDES)[number];

const isPublicGuide = (key: string): key is PublicGuide =>
  (PUBLIC_GUIDES as readonly string[]).includes(key);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { guide } = await params;
  if (!isPublicGuide(guide)) return {};
  const g = helpGuide(locale, guide);
  return { title: g.title, description: g.summary };
}

export default async function HelpGuidePage({ params }: Params) {
  const locale = await pageLocale(params);
  const { guide } = await params;
  if (!isPublicGuide(guide)) notFound();
  const t = await getTranslations('Help');
  const g = helpGuide(locale, guide);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Link
        href="/help"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← {t('allGuides')}
      </Link>
      <h1 className="mt-3 mb-8 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {g.title}
      </h1>
      <HelpGuideView guide={g} locale={locale} contentsLabel={t('contents')} />
      <p className="mt-14 border-t pt-6 text-sm text-muted-foreground">
        {t('stuck', { email: CONTACT_EMAIL })}
      </p>
    </div>
  );
}
