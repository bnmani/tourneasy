import { Bell, CalendarSearch, CreditCard } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@tourneasy/shared/i18n';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  // The [locale] layout has already rejected unsupported locales.
  setRequestLocale(locale as AppLocale);
  const t = await getTranslations('Home');
  const tc = await getTranslations('Common');

  const features = [
    { icon: CalendarSearch, title: t('featureFindTitle'), text: t('featureFindText') },
    { icon: CreditCard, title: t('featureRegisterTitle'), text: t('featureRegisterText') },
    { icon: Bell, title: t('featureFollowTitle'), text: t('featureFollowText') },
  ];

  return (
    <>
      <section className="bg-secondary">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">{t('heroText')}</p>
          {/* Targets arrive in Phase 1 (account) and Phase 3 (tournaments). */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" disabled aria-describedby="cta-soon">
              {t('ctaBrowse')}
            </Button>
            <Button size="lg" variant="outline" disabled aria-describedby="cta-soon">
              {t('ctaRegister')}
            </Button>
          </div>
          <p id="cta-soon" className="text-muted-foreground mt-2 text-sm">
            {tc('comingSoon')}
          </p>
        </div>
      </section>

      <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="features-title" className="text-2xl font-semibold">
          {t('featuresTitle')}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="bg-card rounded-lg border p-6">
              <Icon aria-hidden="true" className="text-primary size-8" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-2">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
