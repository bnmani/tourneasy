import { formatDayRange } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { pageLocale } from '@/lib/page';
import { respondInviteAction } from '@/server/actions/registration-actions';
import { getActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { getInvite } from '@/server/services/registration-service';

type Props = { params: Promise<{ locale: string; token: string }> };

// Invitation links are personal: keep them out of search engines and referrers.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Invite' });
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export default async function InvitePage({ params }: Props) {
  const locale = await pageLocale(params);
  const { token } = await params;
  const t = await getTranslations('Invite');
  const actor = await getActor();

  let invite: Awaited<ReturnType<typeof getInvite>> | null = null;
  try {
    invite = await getInvite({ token }, actor);
  } catch (error) {
    if (!isAppError(error) || error.code !== 'inviteInvalid') throw error;
  }

  if (!invite || invite.status !== 'PENDING') {
    return (
      <>
        <PageHero title={t('title')} />
        <p className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">{t('expired')}</p>
      </>
    );
  }

  const here = `/${locale}/invites/${token}`;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const dates = formatDayRange(
    day(invite.tournament.startsOn),
    day(invite.tournament.endsOn),
    locale,
    'long',
  );
  const event = eventLabel(
    {
      discipline: invite.event.discipline,
      name: invite.event.name,
      ageCategory: invite.event.ageCategory,
      levelClass: invite.event.levelClass,
    },
    locale,
  );

  return (
    <>
      <PageHero eyebrow={t('title')} title={invite.tournament.name} intro={dates} />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <p className="text-lg">
          {t('body', { from: invite.from, event, tournament: invite.tournament.name, dates })}
        </p>
        {!actor ? (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <p className="text-muted-foreground">{t('loginHint')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(here)}`}>{t('login')}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/register?next=${encodeURIComponent(here)}`}>{t('register')}</Link>
              </Button>
            </div>
          </div>
        ) : invite.forMe ? (
          <div className="flex flex-wrap gap-3">
            <form action={respondInviteAction.bind(null, locale, { token }, true)}>
              <Button type="submit" size="lg">
                {t('accept')}
              </Button>
            </form>
            <form action={respondInviteAction.bind(null, locale, { token }, false)}>
              <Button type="submit" size="lg" variant="outline">
                {t('decline')}
              </Button>
            </form>
          </div>
        ) : (
          <p className="rounded-lg border bg-card p-5 text-muted-foreground">{t('notForYou')}</p>
        )}
        <p>
          <Link
            href={`/tournaments/${invite.tournament.slug}`}
            className="text-accent-text underline underline-offset-4"
          >
            {invite.tournament.name}
          </Link>
        </p>
      </div>
    </>
  );
}
