import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryCard } from '@/components/EntryCard';
import { MatchCard } from '@/components/MatchCard';
import { Heading, Hint, Segmented } from '@/components/ui';
import { dateLocaleTag, useLocale, useT, type TranslateFn } from '@/lib/i18n';
import {
  fetchFollowing,
  fetchMyEntries,
  fetchMyMatches,
  fetchPlayerMatches,
  type MyEntry,
  type MyMatch,
} from '@/lib/me';
import { font, useColors } from '@/theme';

type ScheduleView = 'matches' | 'entries';

/** Matches of players I follow, and how many I follow (the section shows only when > 0). */
type FollowedMatches = { following: number; matches: MyMatch[] };

/**
 * Coming matches of everyone I follow, from each player's public match list, without the ones
 * I play in myself. One player that fails to load doesn't hide the others.
 */
async function fetchFollowedMatches(locale: string, mine: Set<string>): Promise<FollowedMatches> {
  const players = await fetchFollowing();
  const lists = await Promise.allSettled(
    players.map((p) => fetchPlayerMatches(p.memberNumber, locale)),
  );
  const byId = new Map<string, MyMatch>();
  for (const list of lists) {
    if (list.status !== 'fulfilled') continue;
    for (const m of list.value) {
      if (mine.has(m.id) || byId.has(m.id)) continue;
      byId.set(m.id, {
        ...m,
        number: null,
        aEntryId: null,
        bEntryId: null,
        winnerEntryId: null,
        sets: [],
        changed: null,
      });
    }
  }
  const time = (m: MyMatch) => (m.startsAt ? Date.parse(m.startsAt) : Number.POSITIVE_INFINITY);
  return {
    following: players.length,
    matches: [...byId.values()].sort((a, b) => time(a) - time(b)),
  };
}

/**
 * My schedule: my matches from published schedules, those of players I follow, and the
 * tournaments I entered. Opens on Entries when linked with `view=entries` (e.g. "See my
 * entries" after entering).
 */
export default function ScheduleTab() {
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const dateTag = dateLocaleTag(locale);
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ScheduleView>(params.view === 'entries' ? 'entries' : 'matches');
  const [matches, setMatches] = useState<MyMatch[] | null>(null);
  const [entries, setEntries] = useState<MyEntry[] | null>(null);
  const [followed, setFollowed] = useState<FollowedMatches | null>(null);
  const [failed, setFailed] = useState<{ matches: boolean; entries: boolean }>({
    matches: false,
    entries: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  // The tab may already be open on Matches when a link asks for Entries: switch on a new link,
  // then clear it so the next "See my entries" counts as new again.
  const [linked, setLinked] = useState(params.view);
  if (params.view !== linked) {
    setLinked(params.view);
    if (params.view === 'entries') setView('entries');
  }
  useEffect(() => {
    if (params.view) router.setParams({ view: undefined });
  }, [params.view]);

  // Each list loads on its own, so one that fails doesn't hide the other.
  const load = useCallback(async () => {
    const [m, e] = await Promise.allSettled([fetchMyMatches(), fetchMyEntries()]);
    if (m.status === 'fulfilled') setMatches(m.value);
    if (e.status === 'fulfilled') setEntries(e.value);
    setFailed({ matches: m.status === 'rejected', entries: e.status === 'rejected' });
    // Followed players' matches are extra: if they fail, the section just stays away.
    const mine = new Set(m.status === 'fulfilled' ? m.value.map((x) => x.id) : []);
    try {
      setFollowed(await fetchFollowedMatches(locale, mine));
    } catch {
      setFollowed(null);
    }
  }, [locale]);

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
        <View style={styles.title}>
          <Heading>{t('My schedule')}</Heading>
          <Hint>{t('Your matches and entries. Matches appear once a schedule is published.')}</Hint>
        </View>
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
          <View style={styles.block}>
            {followed && followed.following > 0 ? (
              <Text style={[styles.blockTitle, { color: colors.fg }]}>{t('My matches')}</Text>
            ) : null}
            {matches.length === 0 ? (
              <Empty
                title={t('No matches planned yet')}
                text={t(
                  'Your matches show here once a tournament you entered publishes its schedule.',
                )}
              />
            ) : (
              <MatchDays matches={matches} dateTag={dateTag} t={t} />
            )}
          </View>
        ) : null}

        {view === 'matches' && followed && followed.following > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.fg }]}>{t('Players I follow')}</Text>
            {followed.matches.length === 0 ? (
              <Hint>{t('No matches planned yet for the players you follow.')}</Hint>
            ) : (
              <MatchDays matches={followed.matches} dateTag={dateTag} t={t} />
            )}
          </View>
        ) : null}

        {view === 'entries' && entries ? (
          upcomingEntries.length === 0 ? (
            <Empty title={t('No entries yet')} text={t('Tournaments you enter show here.')} />
          ) : (
            upcomingEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                dateTag={dateTag}
                onChanged={() => void load()}
              />
            ))
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Matches per day; tapping one opens that tournament's full schedule. */
function MatchDays({
  matches,
  dateTag,
  t,
}: {
  matches: MyMatch[];
  dateTag: string;
  t: TranslateFn;
}) {
  const colors = useColors();
  return groupByDay(matches, dateTag, t).map(([day, dayMatches]) => (
    <View key={day} style={styles.section}>
      <Text style={[styles.day, { color: colors.fg }]}>{day}</Text>
      {dayMatches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          dateTag={dateTag}
          subtitle={match.tournament.name}
          onPress={() =>
            router.push({
              pathname: '/tournaments/[slug]/schedule',
              params: { slug: match.tournament.slug, name: match.tournament.name },
            })
          }
        />
      ))}
    </View>
  ));
}

function Empty({ title, text }: { title: string; text: string }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: colors.hero, borderColor: colors.border, boxShadow: colors.lift },
      ]}
    >
      <Text style={[styles.emptyTitle, { color: colors.heroFg }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.heroMuted }]}>{text}</Text>
    </View>
  );
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
  title: { gap: 4 },
  block: { gap: 12 },
  blockTitle: { fontSize: 20, fontFamily: font.semibold },
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
  empty: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: font.display },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
