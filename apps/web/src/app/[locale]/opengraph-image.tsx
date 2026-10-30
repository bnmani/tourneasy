import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { markDataUrl, OG_SIZE, OgFrame } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Tourneasy — Tournament made easy';

/** The picture shown when the site is shared (WhatsApp, Facebook, LinkedIn…). */
export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'nl', namespace: 'Metadata' });
  return new ImageResponse(
    <OgFrame
      eyebrow={locale === 'en' ? 'Badminton tournaments' : 'Badmintontoernooien'}
      title={t('title').replace(/^Tourneasy — /, '')}
      lines={[t('description')]}
      mark={markDataUrl()}
    />,
    size,
  );
}
