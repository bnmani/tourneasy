'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { removeUsersAction } from '@/server/actions/account-actions';

const FORM_ID = 'bulk-remove-users';
const boxes = () =>
  [
    ...document.querySelectorAll<HTMLInputElement>(`input[name="userIds"][form="${FORM_ID}"]`),
  ].filter((b) => !b.disabled);

/** The checkbox for one row; it belongs to the bulk form below the table (D72). */
export function SelectUser({
  id,
  name,
  disabled,
}: {
  id: string;
  name: string;
  disabled: boolean;
}) {
  const t = useTranslations('Admin.usersBulk');
  return (
    <input
      type="checkbox"
      name="userIds"
      value={id}
      form={FORM_ID}
      disabled={disabled}
      aria-label={t('select', { name })}
      title={disabled ? t('protected') : undefined}
      className="size-5 accent-primary disabled:opacity-30"
    />
  );
}

/** Select all on this page, the count, and removal confirmed with the admin's password. */
export function BulkRemoveUsers({ returnTo }: { returnTo: string }) {
  const t = useTranslations('Admin.usersBulk');
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const update = () => {
      const all = boxes();
      setTotal(all.length);
      setCount(all.filter((b) => b.checked).length);
    };
    update();
    document.addEventListener('change', update);
    return () => document.removeEventListener('change', update);
  }, []);
  const selectAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    setCount(checked ? boxes().length : 0);
  };
  return (
    <form
      id={FORM_ID}
      action={removeUsersAction}
      className="space-y-3 rounded-lg border bg-card p-4 text-sm"
    >
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
      {count > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-medium text-destructive">
            {t('remove', { count })}
          </summary>
          <p className="mt-2 text-muted-foreground">{t('removeHint')}</p>
          <label className="block">
            <span className="block font-medium">{t('password')}</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 h-10 w-72 max-w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
            />
          </label>
          <Button type="submit" variant="destructive" size="sm">
            {t('confirm', { count })}
          </Button>
        </details>
      )}
    </form>
  );
}
