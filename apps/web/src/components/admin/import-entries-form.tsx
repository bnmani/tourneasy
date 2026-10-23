'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { cn } from '@/lib/utils';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { importEntriesAction, type EntryImportState } from '@/server/actions/admin-actions';

/** Upload form for the participants import, with the result and errors per line. */
export function ImportEntriesForm({
  tournamentId,
  columns,
}: {
  tournamentId: string;
  columns: string[];
}) {
  const t = useTranslations('Admin.entries');
  const tp = useTranslations('Admin.players');
  const te = useTranslations('Errors');
  const [state, action] = useActionState<EntryImportState, FormData>(
    importEntriesAction.bind(null, tournamentId),
    initialFormState,
  );
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('importHelp', { columns: columns.join(', ') })}
        </p>
        <FormError state={state} />
        <div className="space-y-1.5">
          <label htmlFor="import-file" className="block text-sm font-medium">
            {tp('file')}
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2"
          />
        </div>
        <SubmitButton>{tp('importSubmit')}</SubmitButton>
      </form>
      {state.result && (
        <div className="space-y-3">
          <FormSuccess>
            {t('importResult', {
              created: state.result.created,
              waitlisted: state.result.waitlisted,
              skipped: state.result.skipped,
              newPlayers: state.result.newPlayers,
            })}
          </FormSuccess>
          {state.result.rows.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">{t('importLog')}</h2>
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b bg-muted text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">{tp('importLogLine')}</th>
                      <th className="px-3 py-2">{t('importLogEntry')}</th>
                      <th className="px-3 py-2">{tp('importLogResult')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {state.result.rows.map((r) => (
                      <tr
                        key={r.line}
                        className={cn(
                          r.outcome === 'skipped' && 'bg-destructive/5',
                          r.outcome === 'waitlisted' && 'bg-brand/10',
                        )}
                      >
                        <td className="px-3 py-1.5 tabular-nums">{r.line}</td>
                        <td className="px-3 py-1.5">{r.name || '—'}</td>
                        <td className="px-3 py-1.5">
                          {t(`importOutcome.${r.outcome}`)}
                          {r.error && (
                            <span className="block text-xs text-destructive">
                              {r.field}:{' '}
                              {te.has(r.error as 'invalid')
                                ? te(r.error as 'invalid', { min: 10, minutes: 15 })
                                : r.error}
                            </span>
                          )}
                          {r.newPlayers.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              {t('importNewPlayers', { numbers: r.newPlayers.join(', ') })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
