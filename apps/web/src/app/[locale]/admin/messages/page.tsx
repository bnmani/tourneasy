import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { PushMessageForm } from '@/components/admin/push-message-form';
import { pageLocale } from '@/lib/page';
import { messageAllAppUsersAction } from '@/server/actions/message-actions';
import { requireRole } from '@/server/auth/web';
import { appMessageHistory, appUserCount } from '@/server/services/message-service';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'PushMessage.all' });
  return { title: t('title'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Admins: a push message to everyone who uses the app, tested on yourself first. */
export default async function AppMessagePage({ params }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const [count, history] = await Promise.all([appUserCount(actor), appMessageHistory(actor)]);
  const t = await getTranslations('PushMessage.all');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <PageHeader title={t('heading')} intro={t('intro', { count })} />

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <PushMessageForm
          action={messageAllAppUsersAction.bind(null, locale)}
          count={count}
          withTest
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('history')}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : (
          <ul className="space-y-3">
            {history.map((m) => (
              <li key={m.at.toISOString()} className="space-y-1 rounded-lg border bg-card p-4">
                <h3 className="font-semibold">{m.title}</h3>
                <p className="text-sm whitespace-pre-line">{m.body}</p>
                <p className="text-xs text-muted-foreground">
                  {t('sentBy', { date: when(m.at), name: m.by, count: m.recipients })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
