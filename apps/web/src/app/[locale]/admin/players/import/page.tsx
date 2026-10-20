import { getTranslations } from 'next-intl/server';
import { ImportPlayersForm } from '@/components/admin/player-forms';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';

export const metadata = { robots: { index: false } };

export default async function ImportPlayersPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        title={t('players.importTitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/v1/admin/players/template" download>
                {t('players.template')}
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/players">{t('back')}</Link>
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
