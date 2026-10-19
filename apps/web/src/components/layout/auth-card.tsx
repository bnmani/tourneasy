import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
