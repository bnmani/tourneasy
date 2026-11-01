'use client';

import { Button } from '@/components/ui/button';

/** Import page: undo a player import, after a confirmation (D100). */
export function UndoImportButton({
  action,
  label,
  confirm,
}: {
  /** Bound server action. */
  action: () => Promise<void>;
  label: string;
  confirm: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <Button type="submit" size="sm" variant="outline">
        {label}
      </Button>
    </form>
  );
}
