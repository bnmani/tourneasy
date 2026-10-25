import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { ImportPlayersForm } from '@/components/admin/player-forms';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'players.importTitle');
}

export default async function ImportPlayersPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        crumbs={[
          { label: t('navPlayers'), href: '/admin/players' },
          { label: t('players.importTitle') },
        ]}
        title={t('players.importTitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/v1/admin/players/template" download>
                {t('players.template')}
              </a>
            </Button>
          </>
        }
      />
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <ImportPlayersForm />
      </div>
    </>
  );
}
