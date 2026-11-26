import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Heading, Hint, Segmented } from '@/components/ui';
import { dateLocaleTag, useLocale, useT, type TranslateFn } from '@/lib/i18n';
import { disciplineOptions } from '@/lib/links';
import { courtName, fetchMyEntries, fetchMyMatches, type MyEntry, type MyMatch } from '@/lib/me';
import { pickLocale } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

type ScheduleView = 'matches' | 'entries';

/** My schedule: matches from published schedules, and the tournaments I entered. */
export default function ScheduleTab() {
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const dateTag = dateLocaleTag(locale);
  const [view, setView] = useState<ScheduleView>('matches');
  const [matches, setMatches] = useState<MyMatch[] | null>(null);
  const [entries, setEntries] = useState<MyEntry[] | null>(null);
  const [failed, setFailed] = useState<{ matches: boolean; entries: boolean }>({
    matches: false,
    entries: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Each list loads on its own, so one that fails doesn't hide the other.
  const load = useCallback(async () => {
    const [m, e] = await Promise.allSettled([fetchMyMatches(), fetchMyEntries()]);
    if (m.status === 'fulfilled') setMatches(m.value);
    if (e.status === 'fulfilled') setEntries(e.value);
    setFailed({ matches: m.status === 'rejected', entries: e.status === 'rejected' });
  }, []);

  // Reload whenever the tab opens, so a schedule published meanwhile shows up.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const upcomingEntries = (entries ?? []).filter((e) => !e.past);
  const error = failed[view]
    ? view === 'matches'
      ? 'Your matches could not be loaded. Pull down to try again.'
      : 'Your entries could not be loaded. Pull down to try again.'
    : null;
  const loading = (view === 'matches' ? matches : entries) === null && !error;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Heading>{t('Schedule')}</Heading>
        <Segmented<ScheduleView>
          options={[
            { value: 'matches', label: t('Matches') },
            { value: 'entries', label: t('Entries') },
          ]}
          value={view}
          onChange={setView}
        />
        {error ? <Text style={{ color: colors.destructive }}>{t(error)}</Text> : null}
        {loading ? <Hint>{t('Loading…')}</Hint> : null}

        {view === 'matches' && matches ? (
          matches.length === 0 ? (
            <Empty
              title={t('No matches planned yet')}
              text={t(
                'Your matches show here once a tournament you entered publishes its schedule.',
              )}
            />
          ) : (
            groupByDay(matches, dateTag, t).map(([day, dayMatches]) => (
              <View key={day} style={styles.section}>
                <Text style={[styles.day, { color: colors.fg }]}>{day}</Text>
                {dayMatches.map((match) => (
                  <MatchCard key={match.id} match={match} dateTag={dateTag} />
                ))}
              </View>
            ))
          )
        ) : null}

        {view === 'entries' && entries ? (
          upcomingEntries.length === 0 ? (
            <Empty
              title={t('No entries yet')}
              text={t('Tournaments you enter on the website show here.')}
            />
          ) : (
            upcomingEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} dateTag={dateTag} />
            ))
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { backgroundColor: colors.hero }]}>
      <Text style={[styles.emptyTitle, { color: colors.heroFg }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.heroMuted }]}>{text}</Text>
    </View>
  );
}

function MatchCard({ match, dateTag }: { match: MyMatch; dateTag: string }) {
  const colors = useColors();
  const t = useT();
  const time = match.startsAt
    ? new Date(match.startsAt).toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })
    : t('Time to follow');
  const court = courtName(match.court);
  const score = match.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join('  ');
  const aWon = !!match.winnerEntryId && match.winnerEntryId === match.aEntryId;
  const bWon = !!match.winnerEntryId && match.winnerEntryId === match.bEntryId;
  const status = statusLabel(match.status, t);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/tournaments/[slug]', params: { slug: match.tournament.slug } })
        }
        style={styles.card}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.time, { color: colors.primary }]}>
            {time}
            {court ? ` · ${t('Court {court}', { court })}` : ''}
          </Text>
          {status ? (
            <Text style={[styles.badge, { color: colors.primary, borderColor: colors.primary }]}>
              {status}
            </Text>
          ) : match.changed ? (
            <Text style={[styles.badge, { color: colors.muted, borderColor: colors.border }]}>
              {match.changed === 'new' ? t('New') : t('Changed')}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.player, { color: colors.fg }, aWon && styles.winner]}>{match.a}</Text>
        <Text style={[styles.player, { color: colors.fg }, bWon && styles.winner]}>{match.b}</Text>
        {score ? <Text style={[styles.score, { color: colors.fg }]}>{score}</Text> : null}
        <Hint>{[match.event, match.round, match.tournament.name].filter(Boolean).join(' · ')}</Hint>
      </Pressable>
    </Card>
  );
}

function EntryCard({ entry, dateTag }: { entry: MyEntry; dateTag: string }) {
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
    </Card>
  );
}

function statusLabel(status: MyMatch['status'], t: TranslateFn): string | null {
  switch (status) {
    case 'CALLED':
      return t('Called');
    case 'IN_PROGRESS':
      return t('Playing');
    case 'COMPLETED':
      return t('Played');
    case 'WALKOVER':
      return t('Walkover');
    case 'RETIRED':
      return t('Retired');
    default:
      return null;
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

/** Matches per day, in order; matches without a time go last under their own heading. */
function groupByDay(matches: MyMatch[], dateTag: string, t: TranslateFn): [string, MyMatch[]][] {
  const groups = new Map<string, MyMatch[]>();
  for (const match of matches) {
    const day = match.startsAt
      ? new Date(match.startsAt).toLocaleDateString(dateTag, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : t('Time to follow');
    groups.set(day, [...(groups.get(day) ?? []), match]);
  }
  return [...groups.entries()];
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 16 },
  section: { gap: 10 },
  day: { fontSize: 17, fontFamily: font.semibold },
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
  winner: { fontFamily: font.bold },
  score: { fontSize: 15, fontFamily: font.semibold },
  empty: { borderRadius: 18, padding: 18, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: font.display },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
