import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CONTACT_EMAIL } from '@/lib/site';
import { pricingEnabled } from '@/server/services/pricing-service';
import { Logo } from './logo';

// On the dark band the badge is drawn light (and the shuttle dark), like the logo sheet.
const invertedMark = {
  '--primary': 'var(--hero-foreground)',
  '--primary-foreground': 'var(--hero)',
} as CSSProperties;

export async function SiteFooter() {
  const t = await getTranslations('Footer');
  // Only while the owner has switched pricing on (D87).
  const pricing = await pricingEnabled();

  return (
    <footer className="bg-hero text-sm text-hero-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-hero-foreground" style={invertedMark}>
          {/* The logo carries the tagline, "Tournament made easy". */}
          <Logo />
        </div>
        <ul className="flex flex-wrap gap-4">
          {pricing && (
            <li>
              <Link href="/pricing" className="underline-offset-4 hover:underline">
                {t('pricing')}
              </Link>
            </li>
          )}
          <li>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              {t('privacy')}
            </Link>
          </li>
          <li>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              {t('terms')}
            </Link>
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-4 hover:underline">
              {t('contact')}
            </a>
          </li>
        </ul>
        {/* Year passed as a string so it isn't formatted as "2.026" in Dutch. */}
        <p>{t('copyright', { year: String(new Date().getFullYear()) })}</p>
      </div>
    </footer>
  );
}
