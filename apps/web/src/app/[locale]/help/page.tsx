import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HelpGuideView } from '@/components/help/help-guide';
import { helpGuide } from '@/content/help';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { CONTACT_EMAIL } from '@/lib/site';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const guide = helpGuide(locale, 'players');
  return { title: guide.title, description: guide.summary };
}

/** Public help (D92): the player guide. Staff guides are in the portal under Help. */
export default async function HelpPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = await getTranslations('Help');
  const guide = helpGuide(locale, 'players');

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <h1 className="mb-8 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {guide.title}
      </h1>
      <HelpGuideView guide={guide} locale={locale} contentsLabel={t('contents')} />
      <p className="mt-14 border-t pt-6 text-sm text-muted-foreground">
        {t('stuck', { email: CONTACT_EMAIL })}
      </p>
    </div>
  );
}
