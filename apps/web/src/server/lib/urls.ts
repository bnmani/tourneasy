import type { AppLocale } from '@tourneasy/shared/i18n';

/** Absolute URL for links in emails, e.g. appUrl('nl', '/verify-email?token=…'). */
export function appUrl(locale: AppLocale, path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/${locale}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute URL without a locale, e.g. for images in emails: siteUrl('/api/v1/…'). */
export function siteUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Only allow same-site relative redirect targets ("/account"), never "//evil.com" or URLs. */
export function safeRedirectPath(target: unknown, fallback: string): string {
  if (typeof target !== 'string') return fallback;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\'))
    return fallback;
  return target;
}
