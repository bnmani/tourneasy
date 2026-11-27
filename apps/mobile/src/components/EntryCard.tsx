import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Hint } from '@/components/ui';
import { formatCents, payShares, withdrawEntry } from '@/lib/entries';
import { useLocale, useT, type TranslateFn } from '@/lib/i18n';
import { disciplineOptions } from '@/lib/links';
import type { MyEntry } from '@/lib/me';
import { pickLocale } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

/**
 * One of my entries: dates, status, category and partner, with Pay and Withdraw when allowed.
 * Used on the Schedule tab and in Profile → My entries.
 */
export function EntryCard({
  entry,
  dateTag,
  onChanged,
}: {
  entry: MyEntry;
  dateTag: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const colors = useColors();
  const t = useT();
  const dates = formatRange(entry.tournament.startsOn, entry.tournament.endsOn, dateTag);
  const { locale } = useLocale();
  const category = categoryLabel(entry.event, locale, t);
  const partner = entry.partner
    ? t('With {name}', { name: entry.partner.name })
    : entry.pendingInvite
      ? t('Invite sent to {name}', { name: entry.pendingInvite.to })
      : entry.doubles
        ? t('No partner yet')
        : null;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/tournaments/[slug]', params: { slug: entry.tournament.slug } })
        }
        style={styles.card}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.time, { color: colors.primary }]}>{dates}</Text>
          <Text style={[styles.badge, { color: colors.primary, borderColor: colors.primary }]}>
            {entryStatus(entry, t)}
          </Text>
        </View>
        <Text style={[styles.player, { color: colors.fg }]}>{entry.tournament.name}</Text>
        <Hint>{[category, partner].filter(Boolean).join(' · ')}</Hint>
      </Pressable>
      {entry.canPay || entry.canWithdraw ? (
        <View style={styles.actions}>
          {entry.canPay && entry.paymentStatus === 'UNPAID' ? (
            <View style={styles.action}>
              <Button
                title={
                  busy
                    ? t('Opening…')
                    : entry.amountDueCents
                      ? t('Pay {amount}', { amount: formatCents(entry.amountDueCents, locale) })
                      : t('Pay')
                }
                disabled={busy}
                onPress={() => void pay()}
              />
            </View>
          ) : null}
          {entry.canWithdraw ? (
            <View style={styles.action}>
              <Button
                title={t('Withdraw')}
                variant="destructive"
                disabled={busy}
                onPress={withdraw}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );

  async function pay() {
    setBusy(true);
    try {
      const outcome = await payShares([entry.participantId]);
      if (outcome !== 'canceled') {
        Alert.alert(
          outcome === 'processing' ? t('Payment received') : t('Paid'),
          outcome === 'processing'
            ? t('Your bank is still confirming the payment. Your entry updates by itself.')
            : t('Thank you. You get a receipt by email.'),
        );
        onChanged();
      }
    } catch (caught) {
      Alert.alert(
        t('Payment not finished'),
        caught instanceof Error ? caught.message : t('Something went wrong. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    Alert.alert(
      t('Withdraw from {name}?', { name: entry.tournament.name }),
      t('Your place goes to the next player. Any refund follows the tournament’s refund rules.'),
      [
        { text: t('Keep my entry'), style: 'cancel' },
        {
          text: t('Withdraw'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await withdrawEntry(entry.id);
              onChanged();
            } catch (caught) {
              Alert.alert(
                t('Not withdrawn'),
                caught instanceof Error ? caught.message : t('Something went wrong. Try again.'),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }
}

function entryStatus(entry: MyEntry, t: TranslateFn): string {
  if (entry.status === 'WAITLISTED') {
    return entry.waitlistPosition
      ? t('Waiting list #{n}', { n: entry.waitlistPosition })
      : t('Waiting list');
  }
  if (entry.status === 'PENDING') return t('To pay');
  return t('Confirmed');
}

function categoryLabel(event: MyEntry['event'], locale: string, t: TranslateFn): string {
  const custom = pickLocale(event.name, locale);
  if (custom) return custom;
  const option = disciplineOptions.find((item) => item.code === event.discipline);
  return [
    option ? t(option.label) : event.discipline,
    event.ageCategory?.code,
    event.levelClass?.code,
  ]
    .filter(Boolean)
    .join(' ');
}

function formatRange(from: string, to: string, dateTag: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const start = new Date(from).toLocaleDateString(dateTag, opts);
  if (from.slice(0, 10) === to.slice(0, 10)) return start;
  return `${start} – ${new Date(to).toLocaleDateString(dateTag, opts)}`;
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 14, fontFamily: font.semibold },
  badge: {
    fontSize: 12,
    fontFamily: font.semibold,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  player: { fontSize: 16, fontFamily: font.medium },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  action: { flex: 1 },
});
