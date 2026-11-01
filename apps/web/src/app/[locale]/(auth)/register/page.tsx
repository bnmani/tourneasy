import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/layout/auth-card';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getActor, homeFor } from '@/server/auth/web';
import { safeRedirectPath } from '@/server/lib/urls';
import { invitedAddress } from '@/server/services/registration-service';
import { RegisterForm } from './register-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.register' });
  return { title: t('title') };
}

export default async function RegisterPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  // Where to continue after sign-up, e.g. the entry form of a tournament (D45).
  const next = safeRedirectPath(firstParam((await searchParams).next), '') || undefined;
  const actor = await getActor();
  if (actor) redirect(next ?? homeFor(actor, locale));

  // Coming from an invitation link: fill in the address it was sent to (D101).
  const token = /^\/(?:nl|en)\/invites\/([A-Za-z0-9_-]{20,})$/.exec(next ?? '')?.[1];
  const invitedEmail = token ? await invitedAddress(token) : null;
  const t = await getTranslations('Auth.register');
  return (
    <AuthCard title={t('title')} subtitle={t('subtitle')}>
      <RegisterForm locale={locale} next={next} invitedEmail={invitedEmail ?? undefined} />
    </AuthCard>
  );
}
