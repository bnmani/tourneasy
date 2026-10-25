import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export type Crumb = { label: string; href?: string };

/** Where you are in the portal; every step but the current one is a link. */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
