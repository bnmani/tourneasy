import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmailTemplateEditor } from '@/components/admin/email-template-editor';
import { PageHeader } from '@/components/admin/ui';
import { FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { resetEmailTemplateAction } from '@/server/actions/email-template-actions';
import { requireRole } from '@/server/auth/web';
import { isEmailTemplateKind } from '@/server/email/catalogue';
import { getEmailTemplate, previewTournaments } from '@/server/services/email-template-service';

type Props = {
  params: Promise<{ locale: string; kind: string }>;
  searchParams: SearchParams;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { kind } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.emailTemplates' });
  return {
    title: isEmailTemplateKind(kind) ? t(`kinds.${kind}`) : t('title'),
    robots: { index: false },
  };
}

export const dynamic = 'force-dynamic';

/** Admin: the texts of one email in one language (D69). */
export default async function EmailTemplatePage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const { kind } = await params;
  const query = await searchParams;
  const lang = firstParam(query.lang) === 'en' ? 'en' : 'nl';
  if (!isEmailTemplateKind(kind)) notFound();
  const [texts, tournaments] = await Promise.all([
    getEmailTemplate(actor, kind, lang),
    previewTournaments(actor),
  ]);
  const t = await getTranslations('Admin.emailTemplates');
  const te = await getTranslations('Errors');
  const status = firstParam(query.status);
  return (
    <>
      <PageHeader
        title={t(`kinds.${kind}`)}
        intro={t(`when.${kind}`)}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/email/templates">← {t('back')}</Link>
          </Button>
        }
      />
      {status === 'resetDone' && <FormSuccess>{t('resetDone')}</FormSuccess>}
      {status && status !== 'resetDone' && (
        <p role="alert" className="text-sm text-destructive">
          {te.has(status as 'unexpected') ? te(status as 'unexpected') : te('unexpected')}
        </p>
      )}
      <nav aria-label={t('language')} className="flex gap-2">
        {(['nl', 'en'] as const).map((l) => (
          <Link
            key={l}
            href={`/admin/email/templates/${kind}?lang=${l}`}
            aria-current={l === lang ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              l === lang ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {l === 'nl' ? 'Nederlands' : 'English'}
          </Link>
        ))}
      </nav>
      <EmailTemplateEditor
        key={lang}
        kind={kind}
        lang={lang}
        texts={texts}
        tournaments={tournaments}
        newsHref={`/${locale}/admin/tournaments`}
      />
      {texts.some((x) => x.changed) && (
        <details className="rounded-lg border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-destructive">{t('reset')}</summary>
          <form
            action={resetEmailTemplateAction.bind(null, locale, kind, lang)}
            className="mt-2 space-y-2"
          >
            <p className="text-muted-foreground">{t('resetHint')}</p>
            <Button type="submit" size="sm" variant="destructive">
              {t('resetConfirm')}
            </Button>
          </form>
        </details>
      )}
    </>
  );
}
