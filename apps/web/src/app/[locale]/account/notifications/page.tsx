import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FormSection } from '@/components/forms/fields';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireActor } from '@/server/auth/web';
import { getMyPreferences } from '@/server/services/notification-service';
import { PreferencesForm } from './preferences-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  return { title: t('title'), robots: { index: false } };
}

/** Which optional emails a player gets (D62); essential ones are listed for clarity. */
export default async function NotificationsPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account/notifications`);
  const prefs = await getMyPreferences(actor);
  const t = await getTranslations('Notifications');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
      <FormSection title={t('optional')}>
        <PreferencesForm prefs={prefs} />
      </FormSection>
      <FormSection title={t('essential')}>
        <p className="text-sm text-muted-foreground">{t('essentialHint')}</p>
      </FormSection>
    </div>
  );
}
