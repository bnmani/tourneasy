import { formatDayRange } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ResendVerificationForm } from '@/components/account/resend-verification';
import { EntryForm } from '@/components/entry/entry-form';
import { InfoList, PageHero } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { pageLocale } from '@/lib/page';
import { getActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { getEntryOptions } from '@/server/services/registration-service';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Entry' });
  return { title: t('title'), robots: { index: false } };
}

export default async function EnterPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const here = `/${locale}/tournaments/${slug}/enter`;
  const actor = await getActor();
  if (!actor) redirect(`/${locale}/login?next=${encodeURIComponent(here)}`);

  let options: Awaited<ReturnType<typeof getEntryOptions>>;
  try {
    options = await getEntryOptions(actor, slug);
  } catch (error) {
    if (isAppError(error) && error.code === 'notFound') notFound();
    if (isAppError(error) && error.code === 'noPlayerProfile') {
      const te = await getTranslations('Errors');
      return <p className="mx-auto max-w-2xl px-4 py-16">{te('noPlayerProfile')}</p>;
    }
    throw error;
  }

  const t = await getTranslations('Entry');
  const tr = await getTranslations('Reasons');
  const tg = await getTranslations('Genders');
  const { tournament, player } = options;
  const dates = formatDayRange(
    tournament.startsOn.toISOString().slice(0, 10),
    tournament.endsOn.toISOString().slice(0, 10),
    locale,
    'long',
  );

  return (
    <>
      <PageHero eyebrow={t('title')} title={tournament.name} intro={dates}>
        <Link
          href={`/tournaments/${slug}`}
          className="text-sm font-semibold text-hero-foreground underline-offset-4 hover:underline"
        >
          ← {t('back')}
        </Link>
      </PageHero>
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:py-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {tournament.phase !== 'registrationOpen' ? (
            <p className="rounded-lg border bg-card p-6 text-muted-foreground">{t('notOpen')}</p>
          ) : !actor.emailVerified ? (
            <div className="space-y-4 rounded-lg border bg-card p-6">
              <p>{t('verifyFirst')}</p>
              <ResendVerificationForm />
            </div>
          ) : (
            <EntryForm
              locale={locale}
              slug={slug}
              maxEvents={tournament.maxEventsPerPlayer}
              enteredCount={options.enteredCount}
              phone={player.phone}
              events={options.events.map((e) => ({
                id: e.id,
                label: eventLabel(
                  {
                    discipline: e.discipline,
                    name: e.name,
                    ageCategory: e.ageCategory,
                    levelClass: e.level ? { code: e.level } : null,
                  },
                  locale,
                ),
                doubles: e.doubles,
                feeCents: e.feeCents,
                spots: e.maxEntries ? t('spots', { taken: e.taken, max: e.maxEntries }) : null,
                full: e.full,
                isOpen: e.isOpen,
                alreadyEntered: e.alreadyEntered,
                reasons: e.reasons.map((r) => tr(r)),
              }))}
            />
          )}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold">{t('yourDetails')}</h2>
            <InfoList
              items={[
                { label: t('name'), value: player.name },
                { label: t('memberNumber'), value: player.memberNumber },
                { label: t('email'), value: player.email },
                { label: t('gender'), value: tg(player.gender) },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              {t('detailsHint')}{' '}
              <Link
                href="/account/profile"
                className="text-accent-text underline underline-offset-4"
              >
                {t('editProfile')}
              </Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
