import { formatDayRange } from '@tourneasy/shared';
import { ImageResponse } from 'next/og';
import { markDataUrl, OG_SIZE, OgFrame } from '@/lib/og';
import { getPublicTournament } from '@/server/services/public-service';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Tourneasy tournament';

/** A tournament's share picture: its name, dates and venue. */
export default async function TournamentImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale = raw === 'en' ? 'en' : 'nl';
  const t = await getPublicTournament(slug).catch(() => null);
  const lines = t
    ? [
        formatDayRange(t.startsOn, t.endsOn, locale, 'long'),
        ...(t.venue ? [`${t.venue.name}, ${t.venue.city}`] : []),
      ]
    : [];
  return new ImageResponse(
    <OgFrame
      eyebrow={locale === 'en' ? 'Badminton tournament' : 'Badmintontoernooi'}
      title={t?.name ?? 'Tourneasy'}
      lines={lines}
      mark={markDataUrl()}
    />,
    size,
  );
}
