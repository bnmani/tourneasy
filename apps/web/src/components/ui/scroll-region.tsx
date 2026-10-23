import { cn } from '@/lib/utils';

/**
 * A wide block (table, bracket) that scrolls sideways on small screens. Focusable and named, so
 * keyboard users can scroll it with the arrow keys and screen readers announce what it is.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'overflow-x-auto rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
