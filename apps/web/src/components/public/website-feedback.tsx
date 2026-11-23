import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { publicWebsiteFeedback } from '@/server/services/feedback-service';
import { FeedbackStars } from './feedback-stars';

/** Player comments published on the whole website, shown on the home page. Nothing when there are none. */
export async function WebsiteFeedback() {
  const items = await publicWebsiteFeedback(6);
  if (items.length === 0) return null;
  const t = await getTranslations('Feedback');
  return (
    <section aria-labelledby="website-feedback-title" className="space-y-4">
      <div>
        <h2 id="website-feedback-title" className="font-heading text-2xl font-semibold">
          {t('websiteTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('websiteIntro')}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{f.firstName}</p>
              <FeedbackStars rating={f.rating} />
            </div>
            <p className="line-clamp-4 text-sm whitespace-pre-line">{f.comment}</p>
            <Link
              href={`/tournaments/${f.tournament.slug}`}
              className="mt-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {f.tournament.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
