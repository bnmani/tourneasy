import { Bell, CalendarSearch, CreditCard } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getActor } from '@/server/auth/web';
import type { AppLocale } from '@tourneasy/shared/i18n';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  // The [locale] layout has already rejected unsupported locales.
  setRequestLocale(locale as AppLocale);
  const t = await getTranslations('Home');
  const tc = await getTranslations('Common');
  const actor = await getActor();

  const features = [
    { icon: CalendarSearch, title: t('featureFindTitle'), text: t('featureFindText') },
    { icon: CreditCard, title: t('featureRegisterTitle'), text: t('featureRegisterText') },
    { icon: Bell, title: t('featureFollowTitle'), text: t('featureFollowText') },
  ];

  return (
    <>
      <section className="bg-secondary">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t('heroText')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              {actor ? (
                <Link href="/account">{t('ctaDashboard')}</Link>
              ) : (
                <Link href="/register">{t('ctaRegister')}</Link>
              )}
            </Button>
            {/* Tournament pages arrive in Phase 3. */}
            <Button size="lg" variant="outline" disabled aria-describedby="cta-soon">
              {t('ctaBrowse')}
            </Button>
            <span id="cta-soon" className="text-sm text-muted-foreground">
              {tc('comingSoon')}
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="features-title" className="text-2xl font-semibold">
          {t('featuresTitle')}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-lg border bg-card p-6">
              <Icon aria-hidden="true" className="size-8 text-primary" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
