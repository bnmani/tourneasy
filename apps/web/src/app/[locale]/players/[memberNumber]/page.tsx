import { Heart, HeartOff, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { setFollowAction } from '@/server/actions/public-actions';
import { getActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { getPublicPlayer } from '@/server/services/public-service';

type Props = {
  params: Promise<{ locale: string; memberNumber: string }>;
  searchParams: SearchParams;
};

const load = cache(async (memberNumber: string) => {
  try {
    return await getPublicPlayer(decodeURIComponent(memberNumber), await getActor());
  } catch (error) {
    if (isAppError(error) && error.code === 'notFound') return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Omit<Props, 'searchParams'>): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { memberNumber } = await params;
  const data = await load(memberNumber);
  if (!data) return { robots: { index: false } };
  return pageMetadata({
    locale,
    path: `/players/${data.player.memberNumber}`,
    title: data.player.name,
    noindex: true,
  });
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { memberNumber } = await params;
  const data = await load(memberNumber);
  if (!data) notFound();
  const { player: p, following, isSelf } = data;
  const signedIn = !!(await getActor());
  const status = firstParam((await searchParams).status);
  const t = await getTranslations('Players');
  const td = await getTranslations('Disciplines');

  return (
    <>
      <PageHero
        eyebrow={p.memberNumber}
        title={p.name}
        intro={
          <>
            {p.club ? (
              <Link href={`/clubs/${p.club.slug}`} className="underline-offset-4 hover:underline">
                {p.club.name}
              </Link>
            ) : (
              t('noClub')
            )}
            <span className="mt-1 flex items-center gap-1.5 text-base">
              <Users aria-hidden="true" className="size-4" />
              {t('followers', { count: p.followerCount })}
            </span>
          </>
        }
      >
        {isSelf ? (
          <p className="text-hero-muted">
            {t('self')}{' '}
            <Link href="/account/profile" className="font-semibold text-hero-foreground underline">
              {t('editProfile')}
            </Link>
          </p>
        ) : signedIn ? (
          <form action={setFollowAction.bind(null, locale, p.memberNumber, !following)}>
            <Button
              type="submit"
              className={
                following
                  ? 'border border-current bg-transparent text-hero-foreground hover:bg-hero-foreground/10'
                  : 'bg-brand text-brand-foreground hover:bg-brand/90'
              }
            >
              {following ? <HeartOff aria-hidden="true" /> : <Heart aria-hidden="true" />}
              {following ? t('unfollow') : t('follow')}
            </Button>
          </form>
        ) : (
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Link
              href={`/login?next=${encodeURIComponent(`/${locale}/players/${p.memberNumber}`)}`}
            >
              <Heart aria-hidden="true" />
              {t('loginToFollow')}
            </Link>
          </Button>
        )}
      </PageHero>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-10">
        {status === 'followed' && <FormSuccess>{t('followed', { name: p.name })}</FormSuccess>}
        {status === 'unfollowed' && <FormSuccess>{t('unfollowed', { name: p.name })}</FormSuccess>}
        {status && !['followed', 'unfollowed'].includes(status) && (
          <FormError state={{ error: status }} />
        )}
        {following && !status && <p className="text-sm text-muted-foreground">{t('following')}</p>}

        {p.preferredDisciplines.length > 0 && (
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold">{t('preferred')}</h2>
            <p className="mt-2">{p.preferredDisciplines.map((d) => td(d)).join(', ')}</p>
          </section>
        )}
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-heading text-lg font-semibold">{t('history')}</h2>
          <p className="mt-2 text-muted-foreground">{t('historyNote')}</p>
        </section>
      </div>
    </>
  );
}
