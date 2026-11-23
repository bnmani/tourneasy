import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { publicWebsiteFeedback } from '@/server/services/feedback-service';
import { FeedbackStars } from './feedback-stars';

/** Up to this many comments sit in a plain grid; more of them scroll in a loop. */
const GRID_MAX = 3;

type Item = Awaited<ReturnType<typeof publicWebsiteFeedback>>[number];

function FeedbackCard({ f, className }: { f: Item; className: string }) {
  return (
    <li className={`flex flex-col gap-2 rounded-lg border bg-card p-4 ${className}`}>
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
  );
}

/**
 * Player comments published on the whole website, on the home page. A few sit in a grid; more
 * scroll from right to left in a loop (paused on hover and focus, still for reduced motion).
 * The list is shown twice, so the loop joins up seamlessly and the first card follows the last.
 */
export async function WebsiteFeedback() {
  const items = await publicWebsiteFeedback(20);
  if (items.length === 0) return null;
  const t = await getTranslations('Feedback');
  const looping = items.length > GRID_MAX;
  // About four seconds per card, so the speed stays calm whatever the count.
  const duration = `${Math.max(24, items.length * 4)}s`;

  return (
    <section aria-labelledby="website-feedback-title" className="space-y-4">
      <div>
        <h2 id="website-feedback-title" className="font-heading text-2xl font-semibold">
          {t('websiteTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('websiteIntro')}</p>
      </div>
      {looping ? (
        <div className="feedback-marquee overflow-hidden">
          <div className="feedback-track flex w-max" style={{ animationDuration: duration }}>
            <ul className="flex gap-4 pr-4">
              {items.map((f) => (
                <FeedbackCard key={f.id} f={f} className="w-72 shrink-0" />
              ))}
            </ul>
            <ul className="flex gap-4 pr-4" aria-hidden="true" inert>
              {items.map((f) => (
                <FeedbackCard key={f.id} f={f} className="w-72 shrink-0" />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <FeedbackCard key={f.id} f={f} className="" />
          ))}
        </ul>
      )}
    </section>
  );
}
