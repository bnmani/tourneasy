import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { MfaDisable, MfaNewCodes, MfaSetup } from '@/components/account/mfa-panel';
import { PasskeyAdd, PasskeyRemove } from '@/components/account/passkey-panel';
import { FormSuccess } from '@/components/forms/fields';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/server/actions/account-actions';
import { requireActor } from '@/server/auth/web';
import { mfaSetup, mfaStatus } from '@/server/services/mfa-service';
import { listSessions } from '@/server/services/session-service';
import { ChangePasswordForm } from './change-password-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Security' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SecurityPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account/security`);
  const query = await searchParams;
  const status = firstParam(query.status);
  const [sessions, mfa] = await Promise.all([listSessions(actor), mfaStatus(actor)]);
  // The app's QR code shows once chosen; a passkey is the other choice (D88).
  const setup =
    !mfa.appEnabledAt && firstParam(query.mfa) === 'setup' ? await mfaSetup(actor) : null;
  const tm = await getTranslations('Security.mfa');
  const tk = await getTranslations('Security.passkey');
  const staff =
    actor.mfaSetupRequired ||
    actor.roles.some((r) => r === 'ORGANISER' || r === 'ADMIN' || r === 'OWNER');
  const t = await getTranslations('Security');
  const format = await getFormatter();
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
      {status === 'mfaDisabled' && <FormSuccess>{tm('disabled')}</FormSuccess>}
      {status === 'passkeyRemoved' && <FormSuccess>{tk('removed')}</FormSuccess>}
      {status === 'recoveryUsed' && (
        <p
          role="status"
          className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {tm('recoveryUsed')}
        </p>
      )}

      <FormSection title={tm('title')}>
        <div id="two-step" className="space-y-4">
          <p className="text-sm text-muted-foreground">{tm('intro')}</p>
          {mfa.required && (
            <p role="alert" className="text-sm font-medium text-amber-700">
              {tm('required')}
            </p>
          )}
          {mfa.on && (
            <p className="text-sm font-medium">
              {tm('statusOn')}{' '}
              <span className={mfa.codesLeft < 3 ? 'text-destructive' : 'text-muted-foreground'}>
                {tm('codesLeft', { count: mfa.codesLeft })}
              </span>
            </p>
          )}

          <section className="space-y-3 rounded-md border p-4">
            <h3 className="font-semibold">
              {tk('title')}{' '}
              <span className="ml-1 rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {tk('recommended')}
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">{tk('intro')}</p>
            <p className="text-xs text-muted-foreground">{tk('mobileNote')}</p>
            {mfa.passkeys.length > 0 && (
              <ul className="divide-y rounded-md border">
                {mfa.passkeys.map((p) => (
                  <li key={p.id} className="space-y-1 p-3 text-sm">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-muted-foreground">
                      {tk('addedOn', {
                        date: format.dateTime(p.createdAt, { dateStyle: 'medium' }),
                      })}
                      {' · '}
                      {p.lastUsedAt
                        ? tk('lastUsed', {
                            date: format.dateTime(p.lastUsedAt, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }),
                          })
                        : tk('neverUsed')}
                    </p>
                    <PasskeyRemove locale={locale} passkeyId={p.id} name={p.name} />
                  </li>
                ))}
              </ul>
            )}
            <PasskeyAdd primary={!mfa.on} />
          </section>

          <section className="space-y-3 rounded-md border p-4">
            <h3 className="font-semibold">{tm('appTitle')}</h3>
            {mfa.appEnabledAt ? (
              <>
                <p className="text-sm">
                  {tm('on', {
                    date: format.dateTime(mfa.appEnabledAt, { dateStyle: 'medium' }),
                  })}
                </p>
                <MfaDisable locale={locale} staff={staff && mfa.passkeys.length === 0} />
              </>
            ) : setup ? (
              <MfaSetup qrSvg={setup.qrSvg} secret={setup.secret} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{tm('appIntro')}</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/account/security?mfa=setup#two-step">{tm('start')}</Link>
                </Button>
              </>
            )}
          </section>

          {mfa.on && <MfaNewCodes app={!!mfa.appEnabledAt} />}
        </div>
      </FormSection>

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
