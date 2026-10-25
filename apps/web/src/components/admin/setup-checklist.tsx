import { CheckCircle2, Circle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { SetupStep } from '@/server/services/progress-service';

/**
 * From a new tournament to a published schedule (D75): each step done or not, the next one
 * highlighted with a link to where it's done. Collapsed once everything is ready.
 */
export async function SetupChecklist({ steps, next }: { steps: SetupStep[]; next: string | null }) {
  const t = await getTranslations('Admin.setup');
  const done = steps.filter((s) => s.done).length;
  return (
    <details
      open={next !== null}
      className="rounded-lg border border-primary/30 bg-secondary/40 p-4 sm:p-5"
    >
      <summary className="cursor-pointer font-semibold">
        {t('title')} ·{' '}
        <span className="font-normal text-muted-foreground">
          {next ? t('progress', { done, total: steps.length }) : t('allDone')}
        </span>
      </summary>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const isNext = s.key === next;
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={cn(
                  'flex h-full items-start gap-2 rounded-md border bg-card p-2.5 text-sm hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  isNext && 'border-primary ring-1 ring-primary',
                  s.done && 'text-muted-foreground',
                )}
              >
                {s.done ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  />
                ) : (
                  <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  <span className="mr-1 tabular-nums">{i + 1}.</span>
                  {t(s.key as 'venue')}
                  {isNext && (
                    <span className="mt-0.5 block text-xs font-semibold text-primary">
                      {t('next')} →
                    </span>
                  )}
                  <span className="sr-only">{s.done ? ` (${t('done')})` : ''}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
