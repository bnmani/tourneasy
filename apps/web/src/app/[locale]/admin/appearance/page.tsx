import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { DEFAULT_SITE_THEME, SITE_THEMES } from '@tourneasy/shared/schemas';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { setSiteThemeAction } from '@/server/actions/admin-actions';
import { requireRole } from '@/server/auth/web';
import { getSiteTheme } from '@/server/services/site-settings-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'navAppearance');
}

export default async function AppearancePage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'OWNER');
  const status = firstParam((await searchParams).status);
  const current = await getSiteTheme();
  const t = await getTranslations('Admin.appearance');
  const tt = await getTranslations('SiteThemes');

  return (
    <>
      <PageHeader title={t('title')} intro={t('intro')} />
      <StatusNotice status={status} />
      <ul className="grid gap-4 md:grid-cols-2">
        {SITE_THEMES.map((theme) => {
          const active = theme === current;
          return (
            <li
              key={theme}
              className={cn(
                'overflow-hidden rounded-lg border bg-card',
                active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
            >
              {/* A live miniature: the theme's own tokens apply inside data-theme. */}
              <div data-theme={theme} aria-hidden="true" className="bg-background text-foreground">
                <div className="bg-hero px-5 py-6 text-hero-foreground">
                  <p className="text-xs font-semibold tracking-widest text-hero-highlight uppercase">
                    Tourneasy
                  </p>
                  <p className="mt-2 font-heading text-2xl leading-tight font-semibold">
                    {t('sampleTitle')}{' '}
                    <span className="text-hero-highlight italic">{t('sampleHighlight')}</span>
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground">
                      {t('sampleCta')}
                    </span>
                    <span className="rounded-md border border-current px-3 py-1.5 text-sm font-semibold">
                      {t('sampleLive')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="rounded-md border bg-card px-3 py-2 text-sm text-card-foreground">
                    <span className="mr-2 rounded-full bg-live px-2 py-0.5 text-xs font-bold text-live-foreground">
                      LIVE
                    </span>
                    21 – 18
                  </div>
                  <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                    {t('sampleButton')}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
                <div>
                  <p className="font-semibold">
                    {tt(`${theme}.name`)}
                    {theme === DEFAULT_SITE_THEME && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({t('default')})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{tt(`${theme}.description`)}</p>
                </div>
                {active ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    <Check aria-hidden="true" className="size-4" />
                    {t('active')}
                  </span>
                ) : (
                  <form action={setSiteThemeAction.bind(null, locale)}>
                    <input type="hidden" name="theme" value={theme} />
                    <Button type="submit" variant="outline" size="sm">
                      {t('use')}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
