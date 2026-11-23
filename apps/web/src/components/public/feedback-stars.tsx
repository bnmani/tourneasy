import { getTranslations } from 'next-intl/server';

/** Filled stars for a 1–5 rating. Screen readers hear "4 stars", not a bare symbol. */
export async function FeedbackStars({ rating }: { rating: number }) {
  const t = await getTranslations('Feedback');
  return (
    <span className="tracking-wide text-amber-600" aria-label={t('starsLabel', { count: rating })}>
      {'★'.repeat(rating)}
      <span className="text-muted-foreground/40">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}
