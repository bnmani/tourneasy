'use client';

import { createContext, useContext, useState } from 'react';
import { Button } from '@/components/ui/button';

type Option = { id: string; label: string };

const OptionsContext = createContext<Option[]>([]);

/**
 * The matches a match can be swapped with, sent once for the whole page (D124). Every card used
 * to carry its own copy of the list: with 160 matches that was 25,000 options, about 10 MB.
 */
export function SwapOptionsProvider({
  options,
  children,
}: {
  options: Option[];
  children: React.ReactNode;
}) {
  return <OptionsContext.Provider value={options}>{children}</OptionsContext.Provider>;
}

/** "Swap with …": the list is only drawn when this is opened. */
export function SwapMatch({
  itemId,
  action,
  labels,
  selectClassName,
}: {
  itemId: string;
  /** Bound server action: takes the form with the other match in `other`. */
  action: (formData: FormData) => void | Promise<void>;
  labels: { summary: string; button: string };
  selectClassName: string;
}) {
  const options = useContext(OptionsContext);
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-primary">{labels.summary}</summary>
      {open && (
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
          <select name="other" aria-label={labels.summary} className={selectClassName}>
            {options
              .filter((o) => o.id !== itemId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            {labels.button}
          </Button>
        </form>
      )}
    </details>
  );
}
