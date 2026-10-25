import { getFormatter, getTranslations } from 'next-intl/server';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { auditLabel } from '@/lib/labels';

type Entry = {
  id: string;
  action: string;
  entityType: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
  actor: { name: string; email: string } | null;
};

function summary(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** The change log table: the whole site (admins) or one tournament. */
export async function AuditTable({ entries }: { entries: Entry[] }) {
  const t = await getTranslations('Admin');
  const ta = await getTranslations('AuditActions');
  const format = await getFormatter();
  if (entries.length === 0) return <p className="text-muted-foreground">{t('audit.empty')}</p>;
  return (
    <ScrollRegion label={t('audit.title')} className="rounded-lg border bg-card">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">
              {t('audit.time')}
            </th>
            <th scope="col" className="px-3 py-2">
              {t('audit.actor')}
            </th>
            <th scope="col" className="px-3 py-2">
              {t('audit.action')}
            </th>
            <th scope="col" className="px-3 py-2">
              {t('audit.entity')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="px-3 py-2 whitespace-nowrap">
                {format.dateTime(e.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}
              </td>
              <td className="px-3 py-2">
                {e.actor ? (
                  <>
                    {e.actor.name}
                    <div className="text-xs text-muted-foreground">{e.actor.email}</div>
                  </>
                ) : (
                  t('audit.system')
                )}
              </td>
              <td className="px-3 py-2">
                <div>{auditLabel(ta, e.action)}</div>
                <div className="font-mono text-xs text-muted-foreground">{e.action}</div>
              </td>
              <td className="px-3 py-2">
                <div>{e.entityType}</div>
                <div className="max-w-md font-mono text-xs break-all text-muted-foreground">
                  {summary(e.before)} {e.before && e.after ? '→' : ''} {summary(e.after)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
