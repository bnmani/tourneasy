import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ImportPlayersForm } from '@/components/admin/player-forms';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { UndoImportButton } from '@/components/admin/undo-import-button';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { undoPlayerImportAction } from '@/server/actions/admin-actions';
import { recentPlayerImports } from '@/server/services/player-service';
import { requireRole } from '@/server/auth/web';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'players.importTitle');
}

export default async function ImportPlayersPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin');
  const query = await searchParams;
  const [imports, format] = await Promise.all([recentPlayerImports(actor), getFormatter()]);
  return (
    <>
      <PageHeader
        crumbs={[
          { label: t('navPlayers'), href: '/admin/players' },
          { label: t('players.importTitle') },
        ]}
        title={t('players.importTitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/v1/admin/players/template" download>
                {t('players.template')}
              </a>
            </Button>
          </>
        }
      />
      <StatusNotice
        status={firstParam(query.status)}
        params={{ removed: firstParam(query.removed) ?? '0', kept: firstParam(query.kept) ?? '0' }}
      />
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <ImportPlayersForm />
      </div>
      {imports.length > 0 && (
        // A wrong file can be taken back: players it made that nothing uses yet go (D100).
        <section aria-labelledby="imports-title" className="space-y-3">
          <h2 id="imports-title" className="text-lg font-semibold">
            {t('players.recentImports')}
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {imports.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {format.dateTime(i.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    {i.by && <span className="text-muted-foreground"> · {i.by}</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {t('players.importSummary', { created: i.created, updated: i.updated })}
                    {i.undone && <> · {t('players.importUndoneLabel')}</>}
                    {!i.undone && !i.canUndo && i.created > 0 && (
                      <> · {t('players.importNoUndo')}</>
                    )}
                  </p>
                </div>
                {i.canUndo && (
                  <UndoImportButton
                    action={undoPlayerImportAction.bind(null, locale, i.id)}
                    label={t('players.undoImport')}
                    confirm={t('players.undoImportConfirm', {
                      removable: i.removable,
                      kept: i.created - i.removable,
                    })}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
