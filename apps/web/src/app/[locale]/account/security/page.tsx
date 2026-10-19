import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/server/actions/account-actions';
import { requireActor } from '@/server/auth/web';
import { listSessions } from '@/server/services/session-service';
import { ChangePasswordForm } from './change-password-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Security' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SecurityPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account/security`);
  const sessions = await listSessions(actor);
  const t = await getTranslations('Security');
  const format = await getFormatter();
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>

      <FormSection title={t('changePassword')}>
        <ChangePasswordForm />
      </FormSection>

      <FormSection title={t('sessions')}>
        <p className="text-sm text-muted-foreground">{t('sessionsIntro')}</p>
        <ul className="divide-y rounded-md border">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {s.deviceName ?? t('unknownDevice')}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({s.kind === 'WEB' ? t('web') : t('mobile')})
                  </span>
                  {s.current && (
                    <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {t('thisDevice')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('lastSeen', {
                    date: format.dateTime(s.lastSeenAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              {!s.current && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {t('revoke')}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <form action={revokeOtherSessionsAction}>
            <Button type="submit" variant="outline">
              {t('revokeOthers')}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        )}
      </FormSection>
    </div>
  );
}
