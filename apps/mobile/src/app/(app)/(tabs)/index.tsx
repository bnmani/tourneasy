import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { MenuSheet } from '@/components/MenuSheet';
import { Button, Card, Hint, IconButton, Screen } from '@/components/ui';
import { dateLocaleTag, useLocale, useT } from '@/lib/i18n';
import { courtName, fetchMyMatches, type MyMatch } from '@/lib/me';
import { fetchInbox } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { fetchTournaments, type TournamentSummary } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

/** Home: a greeting, where matches will appear, and the next tournaments from the website. */
export default function HomeScreen() {
  const colors = useColors();
  const { profile, signOut } = useSession();
  const t = useT();
  const { locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [upcoming, setUpcoming] = useState<TournamentSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextMatch, setNextMatch] = useState<MyMatch | null>(null);
  const [unread, setUnread] = useState(0);
  const dateTag = dateLocaleTag(locale);
  const today = new Date().toLocaleDateString(dateTag, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  useEffect(() => {
    let active = true;
    fetchTournaments({ when: 'upcoming', limit: 3 })
      .then((page) => {
        if (active) setUpcoming(page.data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // The next match still to play and the bell's count, refreshed whenever Home opens.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchMyMatches()
        .then((matches) => {
          const next = matches.find((m) =>
            ['SCHEDULED', 'CALLED', 'IN_PROGRESS'].includes(m.status),
          );
          if (active) setNextMatch(next ?? null);
        })
        .catch(() => null);
      fetchInbox()
        .then((inbox) => {
          if (active) setUnread(inbox.unread);
        })
        .catch(() => null);
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text style={[styles.date, { color: colors.muted }]}>{today}</Text>
          <Text style={[styles.hello, { color: colors.fg }]}>
            {t('Hello, {name}', { name: profile?.firstName ?? t('there') })}
          </Text>
        </View>
        <View style={styles.actions}>
          <View>
            <IconButton
              label={
                unread > 0 ? t('Notifications, {count} new', { count: unread }) : t('Notifications')
              }
              onPress={() => router.push('/notifications')}
            >
              {/* The icon is a native view that would take the tap; let it reach the button. */}
              <View pointerEvents="none">
                <SymbolView name="bell" size={20} tintColor={colors.fg} />
              </View>
            </IconButton>
            {unread > 0 ? (
              <View
                testID="bell-badge"
                pointerEvents="none"
                style={[styles.badge, { backgroundColor: colors.fg, borderColor: colors.bg }]}
              >
                <Text style={[styles.badgeText, { color: colors.bg }]}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            ) : null}
          </View>
          <IconButton label={t('Menu')} onPress={() => setMenuOpen(true)}>
            <Text style={[styles.dots, { color: colors.fg }]}>⋯</Text>
          </IconButton>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/(app)/(tabs)/schedule')}
        style={[
          styles.hero,
          { backgroundColor: colors.hero, borderColor: colors.border, boxShadow: colors.lift },
        ]}
      >
        <Text style={[styles.heroLabel, { color: colors.heroMuted }]}>
          {nextMatch ? t('NEXT MATCH') : t('YOUR MATCHES')}
        </Text>
        {nextMatch ? (
          <>
            <Text style={[styles.heroTitle, { color: colors.heroFg }]}>
              {`${nextMatch.a}\n${t('vs')} ${nextMatch.b}`}
            </Text>
            <Text style={[styles.heroMeta, { color: colors.heroMuted }]}>
              {[
                nextMatch.startsAt
                  ? new Date(nextMatch.startsAt).toLocaleString(dateTag, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null,
                courtName(nextMatch.court)
                  ? t('Court {court}', { court: courtName(nextMatch.court)! })
                  : null,
                nextMatch.event,
                nextMatch.tournament.name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.heroTitle, { color: colors.heroFg }]}>
              {t('No matches planned yet')}
            </Text>
            <Text style={[styles.heroMeta, { color: colors.heroMuted }]}>
              {t('Your matches show here once a tournament you entered publishes its schedule.')}
            </Text>
          </>
        )}
      </Pressable>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.fg }]}>{t('Coming up')}</Text>
        {failed ? <Hint>{t('Tournaments could not be loaded.')}</Hint> : null}
        {!upcoming && !failed ? <Hint>{t('Loading…')}</Hint> : null}
        {upcoming && upcoming.length === 0 ? <Hint>{t('No tournaments to show yet.')}</Hint> : null}
        {(upcoming ?? []).map((tournament) => (
          <Card key={tournament.slug}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tournament.name}
              onPress={() =>
                router.push({ pathname: '/tournaments/[slug]', params: { slug: tournament.slug } })
              }
              style={styles.row}
            >
              <Text style={[styles.rowName, { color: colors.fg }]}>{tournament.name}</Text>
              <Hint>
                {new Date(tournament.startsOn).toLocaleDateString(dateTag, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {tournament.venue ? ` · ${tournament.venue.city}` : ''}
              </Hint>
            </Pressable>
          </Card>
        ))}
        <Button
          title={t('See all tournaments')}
          variant="secondary"
          onPress={() => router.navigate('/(app)/(tabs)/tournaments')}
        />
      </View>

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={
          profile
            ? t('{name} · Member {number}', {
                name: `${profile.firstName} ${profile.lastName}`,
                number: profile.memberNumber,
              })
            : t('Menu')
        }
        items={[
          { label: 'Settings', onPress: () => router.push('/settings') },
          { label: 'Sign out', onPress: signOut, destructive: true },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { flex: 1, gap: 2 },
  date: { fontSize: 14 },
  hello: { fontSize: 32, fontFamily: font.display },
  actions: { flexDirection: 'row', gap: 10 },
  dots: { fontSize: 20, fontFamily: font.bold },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontFamily: font.bold },
  hero: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 8 },
  heroLabel: { fontSize: 13, fontFamily: font.semibold, letterSpacing: 0.5 },
  heroTitle: { fontSize: 22, fontFamily: font.display },
  heroMeta: { fontSize: 15, lineHeight: 21 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontFamily: font.semibold },
  row: { padding: 14, gap: 2 },
  rowName: { fontSize: 16, fontFamily: font.semibold },
});
