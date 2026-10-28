import { Lock, LockOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmailSettingsForm } from '@/components/admin/email-settings-form';
import { UnlockSettingsForm } from '@/components/admin/payment-settings-forms';
import { PageHeader } from '@/components/admin/ui';
import { FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  clearEmailSettingsAction,
  lockEmailSettingsAction,
  setEmailSendingAction,
  testEmailAction,
} from '@/server/actions/email-settings-actions';
import { requireRole } from '@/server/auth/web';
import { emailSettingsLog, getEmailSettings } from '@/server/services/email-settings-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.emailSettings' });
  return { title: t('title'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Admin: SMTP settings for all emails, locked behind the admin's password (D58). */
export default async function EmailSettingsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'OWNER');
  const query = await searchParams;
  const settings = await getEmailSettings(actor);
  const log = await emailSettingsLog(actor);
  const t = await getTranslations('Admin.emailSettings');
  const tt = await getTranslations('Admin.emailTemplates');
  const te = await getTranslations('Errors');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const status = firstParam(query.status);
  const s = settings.stored;
  const sending = settings.sending;
  const paused = !!sending?.paused;
  const notices = ['saved', 'locked', 'deleted', 'testSent', 'paused', 'resumed', 'allowSaved'];

  return (
    <>
      <PageHeader title={t('title')} intro={t('intro')} />

      {status === 'saved' && <FormSuccess>{t('saved')}</FormSuccess>}
      {status === 'locked' && <FormSuccess>{t('lockedNow')}</FormSuccess>}
      {status === 'deleted' && <FormSuccess>{t('removed')}</FormSuccess>}
      {(status === 'paused' || status === 'resumed' || status === 'allowSaved') && (
        <FormSuccess>{t(status)}</FormSuccess>
      )}
      {status === 'testSent' && (
        <FormSuccess>{t('testSent', { to: firstParam(query.to) ?? '' })}</FormSuccess>
      )}
      {status && !notices.includes(status) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {status === 'allowInvalid'
            ? t('allowInvalid')
            : te.has(status as 'unexpected')
              ? te(status as 'smtpRejected', {
                  reason: firstParam(query.reason) ?? '',
                  minutes: 15,
                })
              : te('unexpected')}
        </p>
      )}

      <section
        aria-labelledby="sending-title"
        className={cn(
          'space-y-3 rounded-lg border p-4 text-sm sm:p-6',
          paused ? 'border-amber-500/60 bg-amber-500/10' : 'bg-card',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sending-title" className="text-base font-semibold">
            {t('sendingTitle')}
          </h2>
          <form action={setEmailSendingAction.bind(null, locale)}>
            <input type="hidden" name="allow" value={sending?.allow.join('\n') ?? ''} />
            <button
              type="submit"
              name="paused"
              value={paused ? '0' : '1'}
              role="switch"
              aria-checked={!paused}
              className="flex items-center gap-3 rounded-full py-1 pr-1 pl-3 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('sendingSwitch')}
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
                  paused ? 'bg-muted-foreground/40' : 'bg-primary',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-5 rounded-full bg-background shadow transition-transform',
                    paused ? 'translate-x-1' : 'translate-x-6',
                  )}
                />
              </span>
            </button>
          </form>
        </div>
        <p className={paused ? 'font-medium' : 'text-muted-foreground'}>
          {paused ? t('sendingOff') : t('sendingOn')}
        </p>
        <p className="text-muted-foreground">{t('sendingAlways')}</p>
        {sending && (
          <p className="text-muted-foreground">
            {t('sendingBy', { name: sending.updatedByName, date: when(sending.updatedAt) })}
          </p>
        )}
        <details open={paused}>
          <summary className="cursor-pointer font-medium">{t('allowLabel')}</summary>
          <form action={setEmailSendingAction.bind(null, locale)} className="mt-2 space-y-2">
            <input type="hidden" name="paused" value={paused ? '1' : '0'} />
            <input type="hidden" name="allowOnly" value="1" />
            <textarea
              name="allow"
              aria-label={t('allowLabel')}
              aria-describedby="allow-hint"
              rows={3}
              defaultValue={sending?.allow.join('\n') ?? ''}
              className="w-full max-w-lg rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
            />
            <p id="allow-hint" className="text-muted-foreground">
              {t('allowHint')}
            </p>
            <Button type="submit" variant="outline" size="sm">
              {t('allowSave')}
            </Button>
          </form>
        </details>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm sm:p-6">
        <div>
          <p className="font-semibold">{tt('manage')}</p>
          <p className="text-muted-foreground">{tt('manageHint')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/email/templates">{tt('manage')}</Link>
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 text-sm sm:p-6">
        <p className="font-semibold">
          {settings.source === 'portal' && s
            ? t('statusPortal', { host: s.host })
            : settings.source === 'portal'
              ? t('statusActive')
              : settings.source === 'environment'
                ? t('statusEnvironment')
                : t('statusOff')}
        </p>
        {settings.unreadable && <p className="text-destructive">{t('unreadable')}</p>}
        {s && (
          <p className="text-muted-foreground">
            {t('lastUpdated', { name: s.updatedByName, date: when(s.updatedAt) })}
          </p>
        )}
        {settings.active && (
          <form
            action={testEmailAction.bind(null, locale)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-sm">
              <span className="block text-muted-foreground">{t('testTo')}</span>
              <input
                name="to"
                type="email"
                placeholder={t('testToPlaceholder')}
                className="h-10 w-72 max-w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              />
            </label>
            <Button type="submit" variant="outline">
              {t('sendTest')}
            </Button>
          </form>
        )}
        {settings.active && <p className="text-muted-foreground">{t('testHint')}</p>}
      </section>

      {settings.owner && (
        <>
          <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
            {!settings.canEncrypt ? (
              <p role="alert" className="text-sm text-destructive">
                {t('noEncryptionKey')}
              </p>
            ) : settings.unlockedUntil ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <LockOpen aria-hidden="true" className="size-4" />
                    {t('unlockedUntil', {
                      time: format.dateTime(settings.unlockedUntil, { timeStyle: 'short' }),
                    })}
                  </p>
                  <form action={lockEmailSettingsAction.bind(null, locale)}>
                    <Button type="submit" variant="outline" size="sm">
                      {t('lock')}
                    </Button>
                  </form>
                </div>
                <EmailSettingsForm
                  locale={locale}
                  values={{
                    host: s?.host ?? '',
                    port: String(s?.port ?? 587),
                    security: s?.security ?? 'starttls',
                    user: s?.user ?? '',
                    from: s?.from ?? 'Tourneasy <no-reply@tourneasy.app>',
                    passwordSet: !!s?.passwordSet,
                  }}
                />
                {s && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-destructive">
                      {t('remove')}
                    </summary>
                    <form
                      action={clearEmailSettingsAction.bind(null, locale)}
                      className="mt-2 space-y-2"
                    >
                      <p className="text-muted-foreground">{t('removeHint')}</p>
                      <Button type="submit" size="sm" variant="destructive">
                        {t('removeConfirm')}
                      </Button>
                    </form>
                  </details>
                )}
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Lock aria-hidden="true" className="size-4" />
                  {t('locked')}
                </p>
                <UnlockSettingsForm locale={locale} page="email" />
              </>
            )}
          </section>
        </>
      )}
      <section aria-labelledby="log-title" className="space-y-2">
        <h2 id="log-title" className="text-lg font-semibold">
          {t('log')}
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('logEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span>
                  {t(`action.${entry.action.split('.').pop()}` as 'action.unlock')} ·{' '}
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
