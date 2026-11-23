import { formatDate } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getActor } from '@/server/auth/web';
import {
  feedbackStateFor,
  publicFeedbackFor,
  publicRatingFor,
  tournamentIdForSlug,
} from '@/server/services/feedback-service';
import { FeedbackForm } from './feedback-form';

/**
 * Player feedback on the tournament page: published comments, and once the tournament has ended
 * a box for signed-in players to leave their own (D-feedback).
 */
export async function TournamentFeedback({
  slug,
  locale,
  ended,
  sent,
}: {
  slug: string;
  locale: AppLocale;
  ended: boolean;
  sent: boolean;
}) {
  const tournamentId = await tournamentIdForSlug(slug);
  if (!tournamentId) return null;
  const [items, actor, rating] = await Promise.all([
    publicFeedbackFor(tournamentId),
    getActor(),
    publicRatingFor(tournamentId),
  ]);
  const state = ended ? await feedbackStateFor(actor, tournamentId) : null;
  const t = await getTranslations('Feedback');
  if (items.length === 0 && !ended) return null;

  return (
    <section id="feedback" aria-labelledby="feedback-title" className="scroll-mt-24 space-y-4">
      <h2 id="feedback-title" className="font-heading text-2xl font-semibold">
        {t('sectionTitle')}
      </h2>
      {rating && (
        <p className="text-sm">
          {t('average', { average: rating.average.toFixed(1), count: rating.count })}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.id} className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {f.firstName} · {t('outOf', { rating: f.rating })}
                {f.moderatedAt ? ` · ${formatDate(f.moderatedAt, locale)}` : ''}
              </p>
              <p className="mt-2 text-sm whitespace-pre-line">{f.comment}</p>
            </li>
          ))}
        </ul>
      )}
      {ended && (
        <div className="rounded-lg border bg-card p-4">
          {sent || state === 'sent' ? (
            <p className="text-sm">{sent ? t('sent') : t('alreadySent')}</p>
          ) : state === 'open' ? (
            <>
              <h3 className="mb-3 font-semibold">{t('formTitle')}</h3>
              <FeedbackForm locale={locale} tournamentId={tournamentId} slug={slug} />
            </>
          ) : state === 'signedOut' ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/${locale}/tournaments/${slug}#feedback`)}`}
              className="text-sm underline"
            >
              {t('signIn')}
            </Link>
          ) : null}
        </div>
      )}
      <Link href="/feedback" className="text-sm underline underline-offset-4">
        {t('allWebsite')}
      </Link>
    </section>
  );
}
