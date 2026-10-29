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

/**
 * Only allow same-site relative redirect targets ("/account"), never "//evil.com" or URLs.
 * Browsers drop tabs and line breaks and read a backslash as "/", so "/\t/evil.com" would become
 * "//evil.com": such characters are refused, and the result is read back as a URL to be sure.
 */
export function safeRedirectPath(target: unknown, fallback: string): string {
  if (typeof target !== 'string' || target.length > 2000) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
  try {
    const url = new URL(target, 'http://same.invalid');
    if (url.origin !== 'http://same.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
