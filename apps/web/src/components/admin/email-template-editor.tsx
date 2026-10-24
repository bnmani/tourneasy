'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  emailTemplateAction,
  type EmailTemplateState,
} from '@/server/actions/email-template-actions';

type Text = {
  key: string;
  defaultText: string;
  text: string;
  changed: boolean;
  placeholders: string[];
  sharedWith: string[];
};

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[invalid=true]:border-destructive sm:text-sm';

/** Edit the texts of one email in one language, with preview and test send (D69). */
export function EmailTemplateEditor({
  kind,
  lang,
  texts,
}: {
  kind: string;
  lang: string;
  texts: Text[];
}) {
  const t = useTranslations('Admin.emailTemplates');
  const te = useTranslations('Errors');
  const [state, action, pending] = useActionState<EmailTemplateState, FormData>(
    emailTemplateAction.bind(null, kind, lang),
    {},
  );
  const value = (x: Text) => {
    const v = state.values?.[x.key];
    return typeof v === 'string' ? v : x.text;
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={action} className="space-y-5" noValidate>
        <FormError state={state} />
        {state.notice?.key === 'saved' && <FormSuccess>{t('saved')}</FormSuccess>}
        {state.notice?.key === 'testSent' && (
          <FormSuccess>{t('testSent', { to: state.notice.to ?? '' })}</FormSuccess>
        )}
        {texts.map((x) => {
          const id = `tpl-${x.key}`;
          const error = state.fields?.[x.key];
          const subject = x.key.endsWith('Subject') || x.key.endsWith('Button');
          return (
            <div key={`${x.key}-${state.values ? 'e' : 'd'}`} className="space-y-1.5">
              <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {t(`keys.${x.key}` as 'keys.greeting')}
                {x.changed && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-normal">
                    {t('changedBadge')}
                  </span>
                )}
              </label>
              {subject ? (
                <input
                  id={id}
                  name={x.key}
                  defaultValue={value(x)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-info${error ? ` ${id}-error` : ''}`}
                  className={cn(inputClass, 'h-11')}
                />
              ) : (
                <textarea
                  id={id}
                  name={x.key}
                  defaultValue={value(x)}
                  rows={Math.min(6, Math.max(2, Math.ceil(value(x).length / 70)))}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-info${error ? ` ${id}-error` : ''}`}
                  className={inputClass}
                />
              )}
              <p id={`${id}-info`} className="text-xs text-muted-foreground">
                {x.placeholders.length
                  ? t('placeholders', { list: x.placeholders.map((p) => `{${p}}`).join(', ') })
                  : t('noPlaceholders')}
                {x.sharedWith.length > 0 &&
                  ` ${t('shared', {
                    list: x.sharedWith.map((k) => t(`kinds.${k}` as 'kinds.common')).join(', '),
                  })}`}
              </p>
              {x.changed && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t('defaultLabel')}</summary>
                  <p className="mt-1 whitespace-pre-line">{x.defaultText}</p>
                </details>
              )}
              {error && (
                <p id={`${id}-error`} className="text-sm text-destructive">
                  {te(error as 'invalid', { min: 10, minutes: 15 })}
                </p>
              )}
            </div>
          );
        })}
        <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save" disabled={pending}>
            {t('save')}
          </Button>
          <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>
            {t('preview')}
          </Button>
          <Button type="submit" name="intent" value="test" variant="outline" disabled={pending}>
            {t('test')}
          </Button>
        </div>
      </form>
      <section aria-labelledby="preview-title" className="space-y-2">
        <h2 id="preview-title" className="text-lg font-semibold">
          {t('previewTitle')}
        </h2>
        {state.preview ? (
          <>
            <p className="text-sm">{t('previewSubject', { subject: state.preview.subject })}</p>
            <iframe
              title={t('previewTitle')}
              sandbox=""
              srcDoc={state.preview.html}
              className="h-[640px] w-full rounded-lg border bg-white"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('preview')} →</p>
        )}
      </section>
    </div>
  );
}
