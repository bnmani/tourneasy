import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { acceptOrganiserInviteAction } from '@/server/actions/admin-actions';
import { getActor } from '@/server/auth/web';
import { prisma } from '@tourneasy/db';
import {
  acceptedOrganiserInvite,
  organiserInviteByToken,
} from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; token: string }> };

// Invitation links are personal: keep them out of search engines and referrers.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'OrganiserInvite' });
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/** Where an organiser invitation link leads (D102). */
export default async function OrganiserInvitePage({ params }: Props) {
  const locale = await pageLocale(params);
  const { token } = await params;
  const t = await getTranslations('OrganiserInvite');
  const [invite, actor] = await Promise.all([organiserInviteByToken(token), getActor()]);

  const myEmail = actor
    ? (
        await prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true } })
      )?.email.toLowerCase()
    : null;

  if (!invite) {
    // Used already, by the person now looking at it (e.g. just after signing up): say so.
    const done = await acceptedOrganiserInvite(token);
    const mine = !!done && done.email === myEmail;
    return (
      <>
        <PageHero
          title={mine ? done!.tournament : t('title')}
          eyebrow={mine ? t('title') : undefined}
        />
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
          <p className={mine ? 'text-lg' : 'text-muted-foreground'}>
            {mine ? t('done', { tournament: done!.tournament }) : t('expired')}
          </p>
          {mine && (
            <Button asChild size="lg">
              <Link href="/admin">{t('toPortal')}</Link>
            </Button>
          )}
        </div>
      </>
    );
  }

  const here = `/${locale}/organiser-invites/${token}`;

  return (
    <>
      <PageHero eyebrow={t('title')} title={invite.tournament} />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <p className="text-lg">
          {invite.inviter
            ? t('body', { inviter: invite.inviter, tournament: invite.tournament })
            : t('bodyAnon', { tournament: invite.tournament })}
        </p>
        {!actor ? (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <p className="text-muted-foreground">{t('loginHint')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/register?next=${encodeURIComponent(here)}`}>{t('register')}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/login?next=${encodeURIComponent(here)}`}>{t('login')}</Link>
              </Button>
            </div>
          </div>
        ) : myEmail === invite.email ? (
          <form action={acceptOrganiserInviteAction.bind(null, locale, token)}>
            <Button type="submit" size="lg">
              {t('accept')}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg border bg-card p-5 text-muted-foreground">{t('notForYou')}</p>
        )}
      </div>
    </>
  );
}
