import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { unsubscribe } from '@/server/services/notification-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  return { title: t('unsubscribeTitle'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Link from an optional email (D62): switches that kind off, no login needed. */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  await pageLocale(params);
  const q = await searchParams;
  const type = firstParam(q.t) ?? '';
  const ok = await unsubscribe(firstParam(q.u) ?? '', type, firstParam(q.s) ?? '');
  const t = await getTranslations('Notifications');
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <div className="space-y-4 rounded-lg border bg-card p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-bold">{t('unsubscribeTitle')}</h1>
        <p role="status">
          {ok
            ? t('unsubscribed', { kind: t(`type.${type}` as 'type.ANNOUNCEMENT') })
            : t('unsubscribeInvalid')}
        </p>
        <Button asChild variant="outline">
          <Link href="/account/notifications">{t('manage')}</Link>
        </Button>
      </div>
    </div>
  );
}
