import type { ReactNode } from 'react';

// The real root layout (with <html>) lives in app/[locale]/layout.tsx.
// This pass-through exists because app/not-found.tsx needs a parent layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
