'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FormState } from './form-state';

const ERROR_PARAMS = { min: 10, minutes: 15 };

const inputClass =
  'block h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[invalid=true]:border-destructive sm:text-sm';

function valueOf(state: FormState, name: string): string | undefined {
  const v = state.values?.[name];
  return Array.isArray(v) ? v[0] : v;
}

export function FormError({ state }: { state: FormState }) {
  const t = useTranslations('Errors');
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {t(state.error as 'unexpected', { ...ERROR_PARAMS, ...state.errorParams })}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-primary/30 bg-secondary px-4 py-3 text-sm text-secondary-foreground"
    >
      {children}
    </p>
  );
}

type FieldProps = {
  name: string;
  label: string;
  state: FormState;
  hint?: string;
  required?: boolean;
  children?: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
};

/** Label + control + hint + error, wired up with aria-describedby for screen readers. */
export function Field({ name, label, state, hint, required, children }: FieldProps) {
  const t = useTranslations('Errors');
  const tc = useTranslations('Common');
  const id = `field-${name}`;
  const error = state.fields?.[name];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {' '}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> ({tc('optional')})</span>
        )}
      </label>
      {children?.({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {t(error as 'invalid', ERROR_PARAMS)}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<FieldProps, 'children'> & {
  type?: 'text' | 'email' | 'password' | 'tel' | 'date' | 'search';
  autoComplete?: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
};

export function TextField({
  type = 'text',
  autoComplete,
  defaultValue,
  minLength,
  maxLength,
  inputMode,
  ...field
}: TextFieldProps) {
  // Never echo passwords back into the form.
  const value =
    type === 'password' ? undefined : (valueOf(field.state, field.name) ?? defaultValue);
  return (
    // key: remount with the echoed value after a failed submit (defaultValue is read once).
    <Field key={value} {...field}>
      {(a11y) => (
        <input
          {...a11y}
          name={field.name}
          type={type}
          required={field.required}
          autoComplete={autoComplete}
          defaultValue={value}
          minLength={minLength}
          maxLength={maxLength}
          inputMode={inputMode}
          className={inputClass}
        />
      )}
    </Field>
  );
}

export function SelectField({
  options,
  defaultValue,
  placeholder,
  ...field
}: Omit<FieldProps, 'children'> & {
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const value = valueOf(field.state, field.name) ?? defaultValue ?? '';
  return (
    <Field key={value} {...field}>
      {(a11y) => (
        <select
          {...a11y}
          name={field.name}
          required={field.required}
          defaultValue={value}
          className={inputClass}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  state,
  defaultChecked,
  required,
}: {
  name: string;
  label: ReactNode;
  state: FormState;
  defaultChecked?: boolean;
  required?: boolean;
}) {
  const t = useTranslations('Errors');
  const id = `field-${name}`;
  const error = state.fields?.[name];
  const submitted = state.values ? state.values[name] === 'on' : undefined;
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          required={required}
          defaultChecked={submitted ?? defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 rounded border-input accent-primary"
        />
        <label htmlFor={id} className="text-sm leading-6">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="pl-8 text-sm text-destructive">
          {t(error as 'invalid', ERROR_PARAMS)}
        </p>
      )}
    </div>
  );
}

export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  state,
  defaultValues = [],
}: {
  name: string;
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  state: FormState;
  defaultValues?: string[];
}) {
  const submitted = state.values?.[name];
  const selected = new Set(
    state.values
      ? Array.isArray(submitted)
        ? submitted
        : submitted
          ? [submitted]
          : []
      : defaultValues,
  );
  return (
    <fieldset className="space-y-2" aria-describedby={hint ? `field-${name}-hint` : undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && (
        <p id={`field-${name}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={selected.has(o.value)}
              className="size-5 accent-primary"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn('w-full sm:w-auto', className)}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
