import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Table header that sorts by its column: the first click sorts ascending, the next one
 * descending. Plain links, so sorting works without JavaScript and the URL can be shared.
 */
export function SortHeader({
  column,
  label,
  current,
  dir,
  href,
}: {
  column: string;
  label: string;
  current: string;
  dir: 'asc' | 'desc';
  href: (column: string, dir: 'asc' | 'desc') => string;
}) {
  const active = current === column;
  const next = active && dir === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className="px-3 py-2"
    >
      <Link
        href={href(column, next)}
        className={cn(
          'inline-flex items-center gap-1 uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn('size-3.5', !active && 'opacity-50')} />
      </Link>
    </th>
  );
}
