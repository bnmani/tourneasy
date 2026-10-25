import { Lock, LockOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PaymentSettingsForm, UnlockSettingsForm } from '@/components/admin/payment-settings-forms';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { clearPaymentSettingsAction, lockSettingsAction } from '@/server/actions/payment-actions';
import { requireRole } from '@/server/auth/web';
import { getPaymentSettings, paymentSettingsLog } from '@/server/services/payment-settings-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.paymentSettings' });
  return { title: t('title'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Admin: Stripe keys, locked behind the admin's password (D54). */
export default async function PaymentSettingsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const query = await searchParams;
  const [settings, log] = await Promise.all([getPaymentSettings(actor), paymentSettingsLog(actor)]);
  const t = await getTranslations('Admin');
  const tp = await getTranslations('Admin.paymentSettings');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const webhookUrl = `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/api/v1/payments/webhook`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: t('navPayments'), href: '/admin/payments' }, { label: tp('title') }]}
        title={tp('title')}
        intro={tp('intro')}
      />
      <StatusNotice status={firstParam(query.status)} />

      <section className="space-y-2 rounded-lg border bg-card p-4 text-sm sm:p-6">
        <p className="font-semibold">
          {settings.active ? tp('statusActive', { mode: settings.mode ?? '' }) : tp('statusOff')}
        </p>
        {settings.source === 'environment' && (
          <p className="text-muted-foreground">{tp('fromEnvironment')}</p>
        )}
        {settings.active && !settings.webhookConfigured && (
          <p className="text-destructive">{tp('webhookMissing')}</p>
        )}
        {settings.unreadable && <p className="text-destructive">{tp('unreadable')}</p>}
        {settings.active && (
          <p className={settings.webhookSilent ? 'text-destructive' : 'text-muted-foreground'}>
            {settings.lastWebhook
              ? tp('lastWebhook', {
                  date: when(settings.lastWebhook.createdAt),
                  type: settings.lastWebhook.type,
                })
              : tp('noWebhookYet')}
            {settings.webhookSilent && <> {tp('webhookSilent')}</>}
          </p>
        )}
        {settings.stored && (
          <p className="text-muted-foreground">
            {tp('lastUpdated', {
              name: settings.stored.updatedByName,
              date: when(settings.stored.updatedAt),
            })}
          </p>
        )}
        <p className="text-muted-foreground">{tp('webhookUrl', { url: webhookUrl })}</p>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        {!settings.canEncrypt ? (
          <p role="alert" className="text-sm text-destructive">
            {tp('noEncryptionKey')}
          </p>
        ) : settings.unlockedUntil ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <LockOpen aria-hidden="true" className="size-4" />
                {tp('unlockedUntil', {
                  time: format.dateTime(settings.unlockedUntil, { timeStyle: 'short' }),
                })}
              </p>
              <form action={lockSettingsAction.bind(null, locale)}>
                <Button type="submit" variant="outline" size="sm">
                  {tp('lock')}
                </Button>
              </form>
            </div>
            <PaymentSettingsForm
              locale={locale}
              publishableKey={settings.stored?.publishableKey ?? null}
              secretKeyLast4={settings.stored?.secretKeyLast4 ?? null}
              webhookSet={settings.stored?.webhookSet ?? false}
            />
            {settings.stored && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-destructive">
                  {tp('remove')}
                </summary>
                <form
                  action={clearPaymentSettingsAction.bind(null, locale)}
                  className="mt-2 space-y-2"
                >
                  <p className="text-muted-foreground">{tp('removeHint')}</p>
                  <Button type="submit" size="sm" variant="destructive">
                    {tp('removeConfirm')}
                  </Button>
                </form>
              </details>
            )}
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Lock aria-hidden="true" className="size-4" />
              {tp('locked')}
            </p>
            <UnlockSettingsForm locale={locale} />
          </>
        )}
      </section>

      <section aria-labelledby="log-title" className="space-y-2">
        <h2 id="log-title" className="text-lg font-semibold">
          {tp('log')}
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tp('logEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span>
                  {tp(`action.${entry.action.split('.').pop()}` as 'action.unlock')} ·{' '}
                  {entry.actor?.name ?? '—'}
                </span>
                <span className="text-muted-foreground">{when(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
