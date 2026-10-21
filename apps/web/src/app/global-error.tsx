'use client';

/**
 * Last-resort fallback when the root layout itself fails. No translations or styles are
 * available here, so it is plain and bilingual.
 */
export default function GlobalError() {
  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: '4rem 1rem',
          textAlign: 'center',
          color: '#0f1e33',
          background: '#f4f0e8',
        }}
      >
        <h1>Er ging iets mis · Something went wrong</h1>
        <p>Vernieuw de pagina om het opnieuw te proberen. · Please reload the page to try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 8,
            border: 0,
            background: '#2e4a67',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Pagina vernieuwen · Reload
        </button>
      </body>
    </html>
  );
}
