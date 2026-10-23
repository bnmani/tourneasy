import 'server-only';
import type { FormState } from '@/components/forms/form-state';
import { isAppError } from '../lib/errors';

const SECRET_FIELDS = new Set([
  'password',
  'passwordRepeat',
  'currentPassword',
  'newPassword',
  'newPasswordRepeat',
  'token',
]);

/** FormData → plain object. Checkboxes become booleans, multi-value fields arrays. */
export function formToObject(
  formData: FormData,
  options: { booleans?: string[]; arrays?: string[] } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION')) continue;
    out[key] = options.arrays?.includes(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const key of options.booleans ?? []) out[key] = formData.get(key) === 'on';
  for (const key of options.arrays ?? []) out[key] ??= [];
  return out;
}

/** Submitted values to refill the form, without secrets. */
function echo(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION') || SECRET_FIELDS.has(key)) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === 'string');
    values[key] = all.length > 1 ? all : (all[0] ?? '');
  }
  return values;
}

/** Turns a thrown error into form state; unexpected errors are logged, not shown. */
export function toFormState(error: unknown, formData: FormData): FormState {
  const values = echo(formData);
  if (!isAppError(error)) {
    console.error('[action] unexpected error', error);
    return { error: 'unexpected', values };
  }
  const fields = error.details.fields as Record<string, string> | undefined;
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(error.details)) {
    if (typeof v === 'string' || typeof v === 'number') params[k] = v;
  }
  return {
    fields,
    error: error.code === 'validation' ? undefined : error.code,
    errorParams: params,
    values,
  };
}
