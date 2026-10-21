import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { filterInputClass, PageHeader, StatusNotice } from '@/components/admin/ui';
import { DrawView } from '@/components/draws/draw-view';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import {
  deleteDraftAction,
  generateDrawAction,
  publishDrawAction,
  saveSeedsAction,
  suggestSeedsAction,
  swapEntriesAction,
} from '@/server/actions/draw-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { entryName, getDrawSetup } from '@/server/services/draw-service';

type Props = {
  params: Promise<{ locale: string; id: string; eventId: string }>;
  searchParams: SearchParams;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.draws' });
  return { title: t('title'), robots: { index: false } };
}

/** One event's draw: seeds (suggested by level), generate, preview, swap, publish (D55). */
export default async function EventDrawPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id, eventId } = await params;
  const actor = await requirePortal(locale);
  const setup = await getDrawSetup(actor, eventId).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!setup || setup.event.tournament.id !== id) notFound();
  const query = await searchParams;
  const t = await getTranslations('Admin');
  const td = await getTranslations('Admin.draws');
  const tf = await getTranslations('DrawTypes');
  const draft = setup.status === 'DRAFT';
  const published = setup.status === 'PUBLISHED';
  const incomplete = setup.entries.filter((e) => !e.complete).length;
  const drawEntries = setup.draws.flatMap((d) =>
    d.entries.map((e) => ({
      id: e.id,
      label: `${d.name ? `${td('groupShort', { name: d.name })} · ` : ''}${d.type === 'KNOCKOUT' || d.type === 'DOUBLE_KNOCKOUT' ? `#${e.position} · ` : ''}${entryName(e) ?? td('bye')}`,
    })),
  );

  return (
    <>
      <PageHeader
        title={setup.event.label}
        intro={`${setup.event.tournament.name} · ${tf(setup.event.drawType)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${id}/draws`}>{t('back')}</Link>
          </Button>
        }
      />
      <StatusNotice status={firstParam(query.status)} params={{ min: '2' }} />

      <div className="space-y-2 text-sm">
        {setup.entriesOpen && (
          <p className="rounded-md border border-brand/40 bg-brand/10 px-4 py-2">
            {td('entriesOpen')}
          </p>
        )}
        {setup.outOfDate && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-destructive">
            {td('outOfDate')}
          </p>
        )}
        {incomplete > 0 && (
          <p className="text-muted-foreground">{td('incomplete', { count: incomplete })}</p>
        )}
      </div>

      {!published && (
        <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{td('seedsTitle')}</h2>
              <p className="text-sm text-muted-foreground">{td('seedsHelp')}</p>
            </div>
            <form
              action={suggestSeedsAction.bind(null, locale, id, eventId)}
              className="flex items-end gap-2"
            >
              <label className="text-sm">
                <span className="block text-muted-foreground">{td('seedCount')}</span>
                <input
                  name="count"
                  type="number"
                  min={0}
                  max={64}
                  defaultValue={setup.defaultSeeds}
                  className={cn(filterInputClass, 'w-20 sm:w-20')}
                />
              </label>
              <Button type="submit" variant="outline">
                {td('suggest')}
              </Button>
            </form>
          </div>
          <form action={saveSeedsAction.bind(null, locale, id, eventId)} className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-3">{td('seed')}</th>
                    <th className="py-2 pr-3">{td('entry')}</th>
                    <th className="py-2 pr-3">{td('level')}</th>
                    <th className="py-2">{td('suggested')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {setup.entries
                    .filter((e) => e.complete)
                    .sort(
                      (a, b) =>
                        (a.seed ?? 999) - (b.seed ?? 999) ||
                        (a.suggestedRank ?? 999) - (b.suggestedRank ?? 999),
                    )
                    .map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-3">
                          <input
                            name={`seed.${e.id}`}
                            type="number"
                            min={1}
                            max={64}
                            defaultValue={e.seed ?? ''}
                            aria-label={td('seedFor', { name: e.name })}
                            className={cn(filterInputClass, 'w-16 sm:w-16')}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{e.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {e.players
                              .map((p) => [p.memberNumber, p.club].filter(Boolean).join(' · '))
                              .join(' / ')}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {e.players.map((p) => p.level ?? '–').join(' / ')}
                        </td>
                        <td className="py-2 text-muted-foreground">{e.suggestedRank ?? '–'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Button type="submit" variant="outline">
              {td('saveSeeds')}
            </Button>
          </form>
        </section>
      )}

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {td('drawTitle')}{' '}
            <span className="ml-1 rounded-full bg-muted px-2.5 py-0.5 align-middle text-xs font-bold text-muted-foreground">
              {td(`status${setup.status as 'NONE' | 'DRAFT' | 'PUBLISHED'}`)}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {!published && (
              <form action={generateDrawAction.bind(null, locale, id, eventId)}>
                <Button type="submit">{draft ? td('regenerate') : td('generate')}</Button>
              </form>
            )}
            {draft && (
              <form action={publishDrawAction.bind(null, locale, id, eventId, true)}>
                <Button type="submit" variant="outline">
                  {td('publish')}
                </Button>
              </form>
            )}
            {published && (
              <form action={publishDrawAction.bind(null, locale, id, eventId, false)}>
                <Button type="submit" variant="outline">
                  {td('unpublish')}
                </Button>
              </form>
            )}
            {draft && (
              <form action={deleteDraftAction.bind(null, locale, id, eventId)}>
                <Button type="submit" variant="ghost" className="text-destructive">
                  {td('delete')}
                </Button>
              </form>
            )}
          </div>
        </div>
        {setup.status === 'NONE' ? (
          <p className="text-sm text-muted-foreground">{td('noDraw')}</p>
        ) : (
          <>
            {draft && (
              <form
                action={swapEntriesAction.bind(null, locale, id, eventId)}
                className="flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-3"
              >
                <label className="text-sm">
                  <span className="block text-muted-foreground">{td('swapA')}</span>
                  <select name="a" required className={filterInputClass}>
                    {drawEntries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-muted-foreground">{td('swapB')}</span>
                  <select name="b" required className={filterInputClass}>
                    {drawEntries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  {td('swap')}
                </Button>
              </form>
            )}
            <DrawView draws={setup.draws} />
          </>
        )}
      </section>
    </>
  );
}
