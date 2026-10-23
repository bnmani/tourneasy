import { formatDate } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { Megaphone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { publicNews } from '@/server/services/news-service';

/** Organiser news on the tournament page (D62); nothing when there is none. */
export async function TournamentNews({ slug, locale }: { slug: string; locale: AppLocale }) {
  const news = await publicNews(slug, locale);
  if (news.length === 0) return null;
  const t = await getTranslations('Tournament');
  return (
    <section id="news" aria-labelledby="news-title" className="scroll-mt-24 space-y-3">
      <h2 id="news-title" className="flex items-center gap-2 font-heading text-2xl font-semibold">
        <Megaphone aria-hidden="true" className="size-5" />
        {t('news')}
      </h2>
      <ul className="space-y-3">
        {news.map((n) => (
          <li key={n.id} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{formatDate(n.publishedAt, locale)}</p>
            <h3 className="mt-1 font-semibold">{n.title}</h3>
            <p className="mt-2 text-sm whitespace-pre-line">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
