import { getTranslations } from 'next-intl/server';
import { PlayerForm } from '@/components/admin/player-forms';
import { PageHeader } from '@/components/admin/ui';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { getProfileOptions } from '@/server/services/profile-service';

export const metadata = { robots: { index: false } };

export default async function NewPlayerPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin.players');
  return (
    <>
      <PageHeader title={t('new')} />
      <PlayerForm locale={locale} playerId={null} values={{}} options={await getProfileOptions()} />
    </>
  );
}
