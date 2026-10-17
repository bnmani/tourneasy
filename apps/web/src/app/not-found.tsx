'use client';

import NextError from 'next/error';

// Fallback for requests outside any locale (the middleware normally adds one).
export default function GlobalNotFound() {
  return (
    <html lang="nl">
      <body>
        <NextError statusCode={404} />
      </body>
    </html>
  );
}
