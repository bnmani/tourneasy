'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TYPING_DELAY_MS = 300;

/**
 * Search/filter form that updates the results while you type (debounced) or pick a filter.
 * Results always restart at page 1. Without JavaScript it is a plain GET form, so the
 * submit button in `children` still works.
 */
export function FilterBar({
  action,
  children,
  className,
}: {
  action: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastUrl = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply() {
    clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (key !== 'page' && typeof value === 'string' && value.trim() !== '')
        params.append(key, value.trim());
    }
    const url = params.size > 0 ? `${action}?${params}` : action;
    if (url === lastUrl.current) return;
    lastUrl.current = url;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement && ['search', 'text', 'email'].includes(target.type);
    clearTimeout(timer.current);
    if (typing) timer.current = setTimeout(apply, TYPING_DELAY_MS);
    else apply();
  }

  return (
    <form
      ref={formRef}
      role="search"
      action={action}
      onChange={onChange}
      onSubmit={(event) => {
        event.preventDefault();
        lastUrl.current = null;
        apply();
      }}
      aria-busy={pending}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 transition-opacity sm:flex-row sm:flex-wrap sm:items-end',
        pending && 'opacity-80',
        className,
      )}
    >
      {children}
    </form>
  );
}
