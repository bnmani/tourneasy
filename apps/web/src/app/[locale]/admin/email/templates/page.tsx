import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { emailTemplateLog, listEmailTemplates } from '@/server/services/email-template-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.emailTemplates' });
  return { title: t('title'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Admin: every email with its edited texts (D69). */
export default async function EmailTemplatesPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'OWNER');
  const [templates, log] = await Promise.all([listEmailTemplates(actor), emailTemplateLog(actor)]);
  const t = await getTranslations('Admin.emailTemplates');
  const format = await getFormatter();
  return (
    <>
      <PageHeader
        title={t('title')}
        intro={t('intro')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/email">← E-mail</Link>
          </Button>
        }
      />
      <ul className="divide-y rounded-lg border bg-card">
        {templates.map((x) => (
          <li
            key={x.kind}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">{t(`kinds.${x.kind}`)}</p>
              <p className="text-sm text-muted-foreground">{t(`when.${x.kind}`)}</p>
              <p className="text-xs text-muted-foreground">
                NL: {t('changed', { count: x.changed.nl })} · EN:{' '}
                {t('changed', { count: x.changed.en })}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/email/templates/${x.kind}?lang=${locale}`}>{t('open')}</Link>
            </Button>
          </li>
        ))}
      </ul>
      <section aria-labelledby="log-title" className="space-y-2">
        <h2 id="log-title" className="text-lg font-semibold">
          {t('log')}
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('logEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {log.map((entry) => {
              const [kind, lang] = (entry.entityId ?? ':').split(':');
              return (
                <li key={entry.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                  <span>
                    {t(`action_${entry.action.split('.').pop()}` as 'action_update')} ·{' '}
                    {t(`kinds.${kind}` as 'kinds.common')} ({lang?.toUpperCase()}) ·{' '}
                    {entry.actor?.name ?? '—'}
                  </span>
                  <span className="text-muted-foreground">
                    {format.dateTime(entry.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
