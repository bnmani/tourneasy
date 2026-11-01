'use client';

import { disciplinesForGender, type Gender } from '@tourneasy/shared/rules';
import { DISCIPLINES, GENDERS, PLAYER_CSV_COLUMNS } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CheckboxGroup,
  FormError,
  FormSection,
  FormSuccess,
  SelectField,
  SubmitButton,
  PhoneField,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import {
  importPlayersAction,
  mergePreviewAction,
  type MergePreview,
  mergePlayerAction,
  savePlayerAction,
  type ImportState,
} from '@/server/actions/admin-actions';

export type PlayerFormValues = {
  firstName: string;
  lastNamePrefix: string;
  lastName: string;
  contactEmail: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  clubId: string;
  federationId: string;
  levelSinglesId: string;
  levelDoublesId: string;
  levelMixedId: string;
  preferredDisciplines: string[];
};

type Options = {
  clubs: { id: string; name: string; city: string | null }[];
  levels: { id: string; code: string }[];
};

export function PlayerForm({
  locale,
  playerId,
  values,
  options,
  accountEmail,
}: {
  locale: AppLocale;
  playerId: string | null;
  values: Partial<PlayerFormValues>;
  options: Options;
  /** Players with an account: their login email (read-only here). */
  accountEmail?: string | null;
}) {
  const t = useTranslations('Admin.players');
  const ta = useTranslations('Admin');
  const tr = useTranslations('Auth.register');
  const tp = useTranslations('Profile');
  const td = useTranslations('Disciplines');
  const tg = useTranslations('Genders');
  const [state, action] = useActionState(
    savePlayerAction.bind(null, locale, playerId),
    initialFormState,
  );
  // Only the categories this gender can play (D66).
  const [gender, setGender] = useState<string>(String(state.values?.gender ?? values.gender ?? ''));
  const levels = options.levels.map((l) => ({ value: l.id, label: l.code }));
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={tp('sectionPersonal')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField
            name="firstName"
            label={tr('firstName')}
            state={state}
            required
            defaultValue={values.firstName}
          />
          <TextField
            name="lastNamePrefix"
            label={tr('lastNamePrefix')}
            state={state}
            defaultValue={values.lastNamePrefix}
          />
        </div>
        <TextField
          name="lastName"
          label={tr('lastName')}
          state={state}
          required
          defaultValue={values.lastName}
        />
        {accountEmail ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('contactEmail')}</p>
            <p>{accountEmail}</p>
          </div>
        ) : (
          <TextField
            name="contactEmail"
            type="email"
            label={t('contactEmail')}
            hint={t('contactEmailHint')}
            state={state}
            defaultValue={values.contactEmail}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <PhoneField name="phone" label={tr('phone')} state={state} defaultValue={values.phone} />
          <TextField
            name="dateOfBirth"
            type="date"
            label={tr('dateOfBirth')}
            state={state}
            required
            defaultValue={values.dateOfBirth}
          />
          <div
            onChange={(e) => {
              if (e.target instanceof HTMLSelectElement) setGender(e.target.value);
            }}
          >
            <SelectField
              name="gender"
              label={tr('gender')}
              state={state}
              required
              defaultValue={values.gender}
              placeholder="—"
              options={GENDERS.map((g) => ({ value: g, label: tg(g) }))}
            />
          </div>
        </div>
        <TextField
          name="nationality"
          label={tp('nationality')}
          hint={tp('nationalityHint')}
          state={state}
          defaultValue={values.nationality}
          maxLength={2}
        />
      </FormSection>
      <FormSection title={tp('sectionPlaying')}>
        <CheckboxGroup
          name="preferredDisciplines"
          legend={tr('preferredDisciplines')}
          state={state}
          defaultValues={values.preferredDisciplines ?? []}
          options={disciplinesForGender(DISCIPLINES, (gender || null) as Gender | null).map(
            (d) => ({
              value: d,
              label: td(d),
            }),
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="clubId"
            label={tp('club')}
            state={state}
            defaultValue={values.clubId}
            placeholder={tp('noClub')}
            options={options.clubs.map((c) => ({
              value: c.id,
              label: c.city ? `${c.name} (${c.city})` : c.name,
            }))}
          />
          <TextField
            name="federationId"
            label={tp('federationId')}
            state={state}
            defaultValue={values.federationId}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="levelSinglesId"
            label={tp('levelSingles')}
            state={state}
            defaultValue={values.levelSinglesId}
            placeholder={tp('noLevel')}
            options={levels}
          />
          <SelectField
            name="levelDoublesId"
            label={tp('levelDoubles')}
            state={state}
            defaultValue={values.levelDoublesId}
            placeholder={tp('noLevel')}
            options={levels}
          />
          <SelectField
            name="levelMixedId"
            label={tp('levelMixed')}
            state={state}
            defaultValue={values.levelMixedId}
            placeholder={tp('noLevel')}
            options={levels}
          />
        </div>
        <p className="text-sm text-muted-foreground">{tp('levelHint')}</p>
      </FormSection>
      {playerId ? (
        <SubmitButton size="lg">{ta('save')}</SubmitButton>
      ) : (
        <div className="flex flex-wrap gap-3">
          <SubmitButton size="lg">{ta('save')}</SubmitButton>
          <SubmitButton size="lg" variant="outline" name="next" value="another">
            {t('saveAndAddAnother')}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

/**
 * Merging can't be undone (D100): first both profiles side by side, then an explicit
 * confirmation. Nothing changes until "Merge" is pressed.
 */
export function MergePlayerForm({ locale, sourceId }: { locale: AppLocale; sourceId: string }) {
  const t = useTranslations('Admin.players');
  const tg = useTranslations('Genders');
  const te = useTranslations('Errors');
  const [state, action] = useActionState(
    mergePlayerAction.bind(null, locale, sourceId),
    initialFormState,
  );
  const [number, setNumber] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [checking, startCheck] = useTransition();
  const check = () =>
    startCheck(async () => {
      setError(null);
      const result = await mergePreviewAction(sourceId, number.trim().toUpperCase());
      if (result.ok) setPreview(result.preview);
      else
        setError(
          te.has(result.error as 'unexpected')
            ? te(result.error as 'unexpected')
            : te('unexpected'),
        );
    });

  if (!preview)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('mergeHelp')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1.5 text-sm font-medium">
            {t('mergeTarget')}
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  check();
                }
              }}
              maxLength={8}
              className="block h-10 w-40 rounded-md border border-input bg-background px-3 text-base uppercase sm:text-sm"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={check}
            disabled={checking || !number.trim()}
          >
            {t('mergeCheck')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );

  const rows: [string, (p: MergePreview['source']) => string][] = [
    [t('mergeFieldName'), (p) => p.name],
    [t('mergeFieldBorn'), (p) => p.dateOfBirth ?? '—'],
    [t('mergeFieldGender'), (p) => tg(p.gender)],
    [t('mergeFieldEmail'), (p) => p.email ?? '—'],
    [t('mergeFieldPhone'), (p) => p.phone ?? '—'],
    [t('mergeFieldClub'), (p) => p.club ?? '—'],
    [t('mergeFieldAccount'), (p) => (p.hasAccount ? t('yes') : t('no'))],
    [t('mergeFieldEntries'), (p) => String(p.entries)],
  ];
  return (
    <form action={action} className="space-y-4">
      <h3 className="font-semibold">{t('mergeCompareTitle')}</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-3 py-2" />
              <th scope="col" className="px-3 py-2">
                {t('mergeLeft', { number: preview.source.memberNumber })}
              </th>
              <th scope="col" className="px-3 py-2">
                {t('mergeRight', { number: preview.target.memberNumber })}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {label}
                </th>
                <td className="px-3 py-2">{value(preview.source)}</td>
                <td className="px-3 py-2 font-medium">{value(preview.target)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm">
        {t('mergeWhatHappens', {
          source: preview.source.memberNumber,
          target: preview.target.memberNumber,
        })}
      </p>
      <FormError state={state} />
      <input type="hidden" name="targetMemberNumber" value={preview.target.memberNumber} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        {t('mergeUnderstand')}
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="destructive" disabled={!understood}>
          {t('mergeConfirm', { number: preview.target.memberNumber })}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => setPreview(null)}>
          {t('mergeChange')}
        </Button>
      </div>
    </form>
  );
}

export function ImportPlayersForm() {
  const t = useTranslations('Admin.players');
  const te = useTranslations('Errors');
  const [state, action] = useActionState<ImportState, FormData>(
    importPlayersAction,
    initialFormState,
  );
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('importHelp', { columns: PLAYER_CSV_COLUMNS.join(', ') })}
        </p>
        <FormError state={state} />
        <div className="space-y-1.5">
          <label htmlFor="import-file" className="block text-sm font-medium">
            {t('file')}
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
        <SubmitButton>{t('importSubmit')}</SubmitButton>
      </form>
      {state.result && (
        <div className="space-y-3">
          <FormSuccess>
            {t('importResult', {
              created: state.result.created,
              updated: state.result.updated,
              skipped: state.result.skipped,
            })}
          </FormSuccess>
          {state.result.errors.length > 0 && (
            <section>
              <h2 className="font-semibold">{t('importErrors')}</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {state.result.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    {t('importLine', {
                      line: e.line,
                      message: `${e.field}: ${te.has(e.error as 'invalid') ? te(e.error as 'invalid', { min: 10, minutes: 15 }) : e.error}`,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {state.result.rows.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">{t('importLog')}</h2>
              <p className="text-sm text-muted-foreground">{t('importLogHelp')}</p>
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b bg-muted text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">{t('importLogLine')}</th>
                      <th className="px-3 py-2">{t('importLogName')}</th>
                      <th className="px-3 py-2">{t('importLogResult')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {state.result.rows.map((r) => (
                      <tr
                        key={r.line}
                        className={cn(
                          r.outcome === 'skipped' && 'bg-destructive/5',
                          (r.outcome === 'updated' || r.note === 'sharedEmail') && 'bg-brand/10',
                        )}
                      >
                        <td className="px-3 py-1.5 tabular-nums">{r.line}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">
                          {t(`importOutcome.${r.outcome}`, { memberNumber: r.memberNumber ?? '' })}
                          {r.note && (
                            <span className="block text-xs text-muted-foreground">
                              {t(`importNote.${r.note}`, { other: r.sharedWith ?? '' })}
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
