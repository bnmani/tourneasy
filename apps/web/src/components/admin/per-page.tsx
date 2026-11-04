import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { PAGE_SIZES } from '@/server/lib/validation';

/** "25 50 75 100 per page" for the portal's lists (D112). `href` keeps the other filters. */
export async function PerPage({
  current,
  href,
  className,
}: {
  current: number;
  href: (size: number) => string;
  className?: string;
}) {
  const t = await getTranslations('Admin');
  return (
    <nav
      aria-label={t('perPageLabel')}
      className={cn('flex items-center gap-1 text-sm', className)}
    >
      {PAGE_SIZES.map((n) => (
        <Link
          key={n}
          href={href(n)}
          aria-current={current === n ? 'true' : undefined}
          className={cn(
            'rounded-md border px-2 py-1 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            current === n && 'border-primary bg-primary/5 font-medium',
          )}
        >
          {n}
        </Link>
      ))}
      <span className="pl-1 text-muted-foreground">{t('perPage')}</span>
    </nav>
  );
}
