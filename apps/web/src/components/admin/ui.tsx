import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1 text-muted-foreground">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const SUCCESS = new Set([
  'saved',
  'created',
  'archived',
  'deleted',
  'merged',
  'organiserAdded',
  'organiserInvited',
]);

/** Shows the outcome of the last action from ?status=… (success text or error key). */
export async function StatusNotice({
  status,
  params,
}: {
  status?: string;
  params?: Record<string, string>;
}) {
  if (!status) return null;
  const t = await getTranslations('Admin');
  const te = await getTranslations('Errors');
  if (SUCCESS.has(status)) {
    const key = `status.${status}` as 'status.saved';
    return (
      <p
        role="status"
        className="rounded-md border border-primary/30 bg-secondary px-4 py-3 text-sm text-secondary-foreground"
      >
        {t(key, params)}
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {te.has(status as 'invalid')
        ? te(status as 'invalid', { minutes: 15, min: 10 })
        : te('unexpected')}
    </p>
  );
}

export async function Pagination({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const t = await getTranslations('Admin');
  return (
    <nav aria-label={t('pageOf', { page, pages })} className="flex items-center gap-3">
      {page > 1 && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>{t('previous')}</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">{t('pageOf', { page, pages })}</span>
      {page < pages && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>{t('next')}</Link>
        </Button>
      )}
    </nav>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'muted';
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded px-2 py-0.5 text-xs font-semibold',
        tone === 'primary' && 'bg-primary text-primary-foreground',
        tone === 'neutral' && 'bg-secondary text-secondary-foreground',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/** Search box + optional extra filters, submitted as GET (bookmarkable). */
export function FilterBar({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form
      role="search"
      action={action}
      className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {children}
    </form>
  );
}

export const filterInputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:w-auto sm:min-w-48 sm:text-sm';
