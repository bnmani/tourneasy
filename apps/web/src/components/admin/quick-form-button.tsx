'use client';

import type { ReactNode } from 'react';

/** A small link-style button that posts a server action after a confirmation (D111). */
export function QuickFormButton({
  action,
  confirm,
  children,
}: {
  action: () => Promise<void>;
  confirm: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {' '}
      <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
        {children}
      </button>
    </form>
  );
}
