import { getTranslations } from 'next-intl/server';
import { PlayerForm } from '@/components/admin/player-forms';
import { PageHeader } from '@/components/admin/ui';
import { PlayerAddedNotice } from '@/components/admin/player-added-notice';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { getProfileOptions } from '@/server/services/profile-service';

export const metadata = { robots: { index: false } };

export default async function NewPlayerPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin.players');
  const query = await searchParams;
  const number = firstParam(query.number);
  return (
    <>
      <PageHeader title={t('new')} />
      <PlayerAddedNotice name={firstParam(query.added)} number={number} showAddAnother={false} />
      {/* A fresh, empty form after "save and add another". */}
      <PlayerForm
        key={number ?? 'new'}
        locale={locale}
        playerId={null}
        values={{}}
        options={await getProfileOptions()}
      />
    </>
  );
}
