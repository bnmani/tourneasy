import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireActor } from '@/server/auth/web';
import { listMyConsents } from '@/server/services/gdpr-service';
import { DeleteAccountForm } from './delete-account-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Privacy' });
  return { title: t('title'), robots: { index: false } };
}

export default async function PrivacySettingsPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account/privacy`);
  const consents = await listMyConsents(actor);
  const t = await getTranslations('Privacy');
  const format = await getFormatter();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('intro')}</p>
      </header>

      <FormSection title={t('consentTitle')}>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {consents.map((c) => (
            <li key={c.id}>
              {t('consentGiven', {
                type: t(`consentTypes.${c.type}`),
                version: c.version,
                date: format.dateTime(c.createdAt, { dateStyle: 'long' }),
              })}
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection title={t('exportTitle')}>
        <p className="text-sm text-muted-foreground">{t('exportText')}</p>
        <Button asChild variant="outline">
          {/* Plain link: the API route answers with a file download (cookie auth, GET). */}
          <a href="/api/v1/me/export" download>
            {t('exportButton')}
          </a>
        </Button>
      </FormSection>

      <FormSection title={t('deleteTitle')}>
        <p className="text-sm text-muted-foreground">{t('deleteText')}</p>
        <DeleteAccountForm locale={locale} />
      </FormSection>
    </div>
  );
}
