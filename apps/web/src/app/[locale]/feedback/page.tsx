import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHero } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { publicWebsiteFeedback } from '@/server/services/feedback-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return pageMetadata({ locale, path: '/feedback', title: t('websiteTitle') });
}

/** Public: player comments that were published on the whole website (with the player's consent). */
export default async function WebsiteFeedbackPage({ params }: LocaleParams) {
  await pageLocale(params);
  const t = await getTranslations('Feedback');
  const items = await publicWebsiteFeedback();
  return (
    <>
      <PageHero title={t('websiteTitle')}>
        <p className="max-w-2xl text-sm opacity-90">{t('websiteIntro')}</p>
      </PageHero>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:py-10">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((f) => (
              <li key={f.id} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  {f.firstName} · {t('outOf', { rating: f.rating })} ·{' '}
                  <Link href={`/tournaments/${f.tournament.slug}`} className="underline">
                    {f.tournament.name}
                  </Link>
                </p>
                <p className="mt-2 text-sm whitespace-pre-line">{f.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
