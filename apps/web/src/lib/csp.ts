/**
 * The Content-Security-Policy (D84): only our own origin may serve scripts, styles, images,
 * fonts and API calls; no plugins, framing or foreign form targets. Pages get it from
 * src/proxy.ts with a per-request nonce, so only scripts carrying it (Next.js adds it to its
 * own) and the scripts those load ('strict-dynamic', e.g. Stripe.js) run. Other responses get
 * it from next.config.ts without a nonce. Stripe: Stripe.js, its Payment Element frames and API.
 */
export function contentSecurityPolicy(options: { nonce?: string; dev: boolean }): string {
  const { nonce, dev } = options;
  const scripts = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`
    : "'self' https://js.stripe.com";
  return [
    "default-src 'self'",
    `script-src ${scripts}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com",
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "font-src 'self' data:",
    `connect-src 'self' https://api.stripe.com${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
