'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, startTransition } from 'react';
import { FormError } from '@/components/forms/fields';
import { type FormState, initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';

/** Texts per list: accounts (users page) or players (players page). */
type Texts = 'Admin.usersBulk' | 'Admin.playersBulk';

const boxes = (formId: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`)].filter(
    (b) => !b.disabled,
  );

/** The checkbox for one row; it belongs to the bulk form above the table (D72). */
export function SelectRow({
  formId,
  texts,
  id,
  name,
  disabled,
}: {
  formId: string;
  texts: Texts;
  id: string;
  name: string;
  disabled: boolean;
}) {
  const t = useTranslations(texts);
  return (
    <input
      type="checkbox"
      name="ids"
      value={id}
      form={formId}
      disabled={disabled}
      aria-label={t('select', { name })}
      title={disabled ? t('protected') : undefined}
      className="size-5 accent-primary disabled:opacity-30"
    />
  );
}

/**
 * Select all on this page, the count, invitations (players) and removal (owners only, D80).
 * Removal asks for the owner's password in a popup; a wrong password keeps the selection.
 */
export function BulkRemove({
  formId,
  texts,
  remove,
  invite,
  returnTo,
}: {
  formId: string;
  texts: Texts;
  /** Owners only: without it there is no removal. */
  remove?: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Players list: also send account invitations to the selection (D76). */
  invite?: (formData: FormData) => Promise<void>;
  returnTo: string;
}) {
  const t = useTranslations(texts);
  const tc = useTranslations('Common');
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(
    remove ?? (async () => initialFormState),
    initialFormState,
  );
  useEffect(() => {
    const update = () => {
      const all = boxes(formId);
      setTotal(all.length);
      setCount(all.filter((b) => b.checked).length);
    };
    update();
    document.addEventListener('change', update);
    return () => document.removeEventListener('change', update);
  }, [formId]);
  const selectAll = (checked: boolean) => {
    for (const b of boxes(formId)) b.checked = checked;
    setCount(checked ? boxes(formId).length : 0);
  };
  const confirmRemove = () => {
    if (!form.current) return;
    const data = new FormData(form.current);
    const password = dialog.current?.querySelector<HTMLInputElement>('input[name="password"]');
    data.set('password', password?.value ?? '');
    // Dispatched by hand, so the selection isn't reset when the password is wrong.
    startTransition(() => dispatch(data));
  };
  const passwordError = !!state.fields?.password;

  return (
    <form id={formId} ref={form} className="space-y-3 rounded-lg border bg-card p-4 text-sm">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={total > 0 && count === total}
            onChange={(e) => selectAll(e.target.checked)}
            disabled={total === 0}
            className="size-5 accent-primary"
          />
          {t('selectPage')}
        </label>
        <span aria-live="polite" className="text-muted-foreground">
          {t('selected', { count })}
        </span>
      </div>
      {count > 0 && (invite || remove) && (
        <div className="flex flex-wrap items-center gap-3">
          {invite && (
            <>
              <Button type="submit" formAction={invite} variant="outline" size="sm">
                {t('invite', { count })}
              </Button>
              <span className="text-muted-foreground">{t('inviteHint')}</span>
            </>
          )}
          {remove && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                const field = dialog.current?.querySelector<HTMLInputElement>('input');
                if (field) field.value = '';
                dialog.current?.showModal();
              }}
            >
              {t('remove', { count })}
            </Button>
          )}
        </div>
      )}
      {remove && (
        <dialog
          ref={dialog}
          aria-labelledby={`${formId}-title`}
          className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"
        >
          <div className="space-y-4 p-5">
            <h2 id={`${formId}-title`} className="text-lg font-semibold">
              {t('dialogTitle', { count })}
            </h2>
            <p className="text-muted-foreground">{t('removeHint')}</p>
            <label className="block">
              <span className="block font-medium">{t('password')}</span>
              <input
                type="password"
                name="password"
                form=""
                autoComplete="current-password"
                aria-invalid={passwordError || undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmRemove();
                  }
                }}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              />
            </label>
            <FormError state={state} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
                {tc('cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={confirmRemove}
              >
                {t('confirm', { count })}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </form>
  );
}
