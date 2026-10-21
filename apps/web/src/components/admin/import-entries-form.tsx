'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
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
            })}
          </FormSuccess>
          {state.result.errors.length > 0 && (
            <section>
              <h2 className="font-semibold">{tp('importErrors')}</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {state.result.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    {tp('importLine', {
                      line: e.line,
                      message: `${e.field}: ${te.has(e.error as 'invalid') ? te(e.error as 'invalid', { min: 10, minutes: 15 }) : e.error}`,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
