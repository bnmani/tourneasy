import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Button, Card, Field, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  enterTournament,
  fetchEntryOptions,
  formatCents,
  payShares,
  reasonText,
  type EntryOption,
  type EntryOptions,
} from '@/lib/entries';
import { useLocale, useT, type TranslateFn } from '@/lib/i18n';
import { disciplineOptions, links } from '@/lib/links';
import { pickLocale } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

type Pick = { partner: string; lookingForPartner: boolean };

/**
 * Entering a tournament: choose categories, a partner for doubles (member number or email, or
 * "looking for a partner"), accept the terms, then pay with Stripe when the tournament takes
 * payment online. Same rules and checks as the website.
 */
export default function EnterScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const [options, setOptions] = useState<EntryOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'confirmed' | 'paid' | 'unpaid' | 'waitlisted' | null>(null);

  useEffect(() => {
    fetchEntryOptions(slug)
      .then(setOptions)
      .catch((error) =>
        setLoadError(
          error instanceof Error ? error.message : 'The categories could not be loaded.',
        ),
      );
  }, [slug]);

  const chosen = useMemo(
    () => (options?.events ?? []).filter((e) => picked[e.id]),
    [options, picked],
  );
  const max = options?.tournament.maxEventsPerPlayer ?? null;
  const room = max === null ? Infinity : max - (options?.enteredCount ?? 0);
  const total = chosen.reduce((sum, e) => sum + e.feeCents, 0);
  const missingPartner = chosen.some(
    (e) => e.doubles && !picked[e.id]!.partner.trim() && !picked[e.id]!.lookingForPartner,
  );

  function toggle(event: EntryOption) {
    setPicked((current) => {
      const next = { ...current };
      if (next[event.id]) delete next[event.id];
      else if (Object.keys(next).length < room)
        next[event.id] = { partner: '', lookingForPartner: false };
      else
        Alert.alert(
          t('Too many categories'),
          t('You can enter at most {max} categories in this tournament.', { max: max ?? 0 }),
        );
      return next;
    });
  }

  async function submit() {
    if (!options) return;
    setBusy(true);
    try {
      const result = await enterTournament(
        slug,
        chosen.map((e) => ({
          eventId: e.id,
          partner: picked[e.id]!.lookingForPartner ? undefined : picked[e.id]!.partner,
          lookingForPartner: picked[e.id]!.lookingForPartner,
        })),
      );
      const toPay = result.registrations
        .filter((r) => r.status === 'PENDING' && r.participantId && r.paymentStatus === 'UNPAID')
        .map((r) => r.participantId!);
      if (toPay.length && options.tournament.payOnline) {
        const outcome = await payShares(toPay).catch((error: unknown) => {
          Alert.alert(
            t('Payment not finished'),
            error instanceof Error ? error.message : t('Something went wrong. Try again.'),
          );
          return 'canceled' as const;
        });
        setDone(outcome === 'canceled' ? 'unpaid' : 'paid');
      } else if (result.registrations.every((r) => r.status === 'WAITLISTED')) {
        setDone('waitlisted');
      } else {
        setDone(toPay.length ? 'unpaid' : 'confirmed');
      }
    } catch (error) {
      Alert.alert(t('Not entered'), errorText(error, t));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const text = {
      confirmed: t('You are entered. You get a confirmation by email.'),
      paid: t('You are entered and paid. You get a confirmation by email.'),
      unpaid: t(
        'You are entered. Your place is held for a short time: pay from the Schedule tab under Entries.',
      ),
      waitlisted: t(
        'The category is full, so you are on the waiting list. We email you if a place opens.',
      ),
    }[done];
    return (
      <Screen scroll>
        <Heading>{done === 'waitlisted' ? t('On the waiting list') : t('Entered')}</Heading>
        <Body>{text}</Body>
        <Button
          title={t('See my entries')}
          onPress={() =>
            router.replace({ pathname: '/(app)/(tabs)/schedule', params: { view: 'entries' } })
          }
        />
        <TextLink title={t('Back to the tournament')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      <Heading>{t('Enter')}</Heading>
      {options ? <Body>{options.tournament.name}</Body> : null}
      {loadError ? <Text style={{ color: colors.destructive }}>{t(loadError)}</Text> : null}
      {!options && !loadError ? <Hint>{t('Loading…')}</Hint> : null}

      {options ? (
        <>
          <Text style={[styles.section, { color: colors.muted }]}>{t('CATEGORIES')}</Text>
          {max !== null ? (
            <Hint>
              {t('You can enter {count} more of up to {max} categories.', {
                count: Math.max(0, room),
                max,
              })}
            </Hint>
          ) : null}
          {options.events.map((event) => {
            const blocked = event.alreadyEntered || !event.isOpen || event.reasons.length > 0;
            const choice = picked[event.id];
            const note = event.alreadyEntered
              ? t('Already entered')
              : !event.isOpen
                ? t('Closed')
                : event.reasons.length
                  ? event.reasons
                      .map((r) => t(reasonText[r] ?? 'You can’t play in this category'))
                      .join(' · ')
                  : event.full
                    ? t('Full: you join the waiting list')
                    : event.maxEntries
                      ? t('{left} places left', { left: event.maxEntries - event.taken })
                      : null;
            return (
              <Card key={event.id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!choice, disabled: blocked }}
                  disabled={blocked}
                  onPress={() => toggle(event)}
                  style={[styles.event, blocked && styles.blocked]}
                >
                  <View
                    style={[
                      styles.box,
                      { borderColor: colors.inputBorder },
                      choice && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    {choice ? <Text style={{ color: colors.primaryFg }}>✓</Text> : null}
                  </View>
                  <View style={styles.eventText}>
                    <Text style={[styles.eventName, { color: colors.fg }]}>
                      {categoryName(event, locale, t)}
                    </Text>
                    {note ? <Hint>{note}</Hint> : null}
                  </View>
                  <Text style={[styles.fee, { color: colors.fg }]}>
                    {formatCents(event.feeCents, locale)}
                  </Text>
                </Pressable>
                {choice && event.doubles ? (
                  <View style={styles.partner}>
                    {!choice.lookingForPartner ? (
                      <Field
                        label={t('Partner')}
                        placeholder={t('Member number or email')}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={choice.partner}
                        onChangeText={(partner) =>
                          setPicked((c) => ({ ...c, [event.id]: { ...c[event.id]!, partner } }))
                        }
                        hint={t('We send your partner an invitation to confirm.')}
                      />
                    ) : null}
                    <View style={styles.switchRow}>
                      <Text style={{ color: colors.fg, flex: 1 }}>
                        {t('I’m looking for a partner')}
                      </Text>
                      <Switch
                        value={choice.lookingForPartner}
                        onValueChange={(lookingForPartner) =>
                          setPicked((c) => ({
                            ...c,
                            [event.id]: { ...c[event.id]!, lookingForPartner },
                          }))
                        }
                        trackColor={{ true: colors.primary, false: colors.border }}
                        ios_backgroundColor={colors.border}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}

          {chosen.length ? (
            <View style={styles.totalRow}>
              <Text style={[styles.total, { color: colors.fg }]}>{t('Total')}</Text>
              <Text style={[styles.total, { color: colors.fg }]}>{formatCents(total, locale)}</Text>
            </View>
          ) : null}
          {chosen.length > 1 ? (
            <Hint>{t('A discount for more categories, if any, is taken off when you pay.')}</Hint>
          ) : null}

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted((a) => !a)}
            style={styles.terms}
          >
            <View
              style={[
                styles.box,
                { borderColor: colors.inputBorder },
                accepted && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              {accepted ? <Text style={{ color: colors.primaryFg }}>✓</Text> : null}
            </View>
            <Text style={{ color: colors.fg, flex: 1, lineHeight: 21 }}>
              {t('I accept the tournament terms, including the withdrawal and refund rules.')}{' '}
              <Text
                style={{ color: colors.primary, fontFamily: font.semibold }}
                onPress={() => Linking.openURL(links.terms)}
              >
                {t('Read the terms')}
              </Text>
            </Text>
          </Pressable>

          <Button
            title={
              busy
                ? t('Sending…')
                : options.tournament.payOnline && total > 0
                  ? t('Enter and pay')
                  : t('Enter')
            }
            disabled={busy || chosen.length === 0 || !accepted || missingPartner}
            onPress={submit}
          />
          {missingPartner ? (
            <Hint>
              {t('Add a partner for each doubles category, or say you’re looking for one.')}
            </Hint>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function categoryName(event: EntryOption, locale: string, t: TranslateFn): string {
  const custom = pickLocale(event.name, locale);
  if (custom) return custom;
  const option = disciplineOptions.find((o) => o.code === event.discipline);
  return [option ? t(option.label) : event.discipline, event.ageCategory?.code, event.level]
    .filter(Boolean)
    .join(' ');
}

/** The website's message, or for a partner problem something the player can act on. */
function errorText(error: unknown, t: TranslateFn): string {
  if (error instanceof ApiError) {
    const reasons = Object.values(error.fields);
    if (reasons.includes('partnerNotFound'))
      return t('We couldn’t find that partner. Check the member number or email.');
    if (reasons.includes('partnerIneligible'))
      return t('Your partner can’t play in this category (gender, age or level).');
    return error.message;
  }
  return error instanceof Error ? error.message : t('Something went wrong. Try again.');
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontFamily: font.semibold, letterSpacing: 0.5, marginTop: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  blocked: { opacity: 0.5 },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventText: { flex: 1, gap: 2 },
  eventName: { fontSize: 16, fontFamily: font.medium },
  fee: { fontSize: 15, fontFamily: font.semibold },
  partner: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  total: { fontSize: 17, fontFamily: font.semibold },
  terms: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
