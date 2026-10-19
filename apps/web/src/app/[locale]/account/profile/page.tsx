import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireActor } from '@/server/auth/web';
import { getMyAccount, getProfileOptions } from '@/server/services/profile-service';
import { ProfileForm } from './profile-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Profile' });
  return { title: t('title'), robots: { index: false } };
}

export default async function ProfilePage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account/profile`);
  const [account, options] = await Promise.all([getMyAccount(actor), getProfileOptions()]);
  const t = await getTranslations('Profile');
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('intro')}</p>
      </header>
      {account.profile && <ProfileForm account={account} options={options} />}
    </div>
  );
}
