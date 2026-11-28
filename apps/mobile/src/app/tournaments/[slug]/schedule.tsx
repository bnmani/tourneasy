import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchCard } from '@/components/MatchCard';
import { Heading, Hint, Segmented, TextLink } from '@/components/ui';
import { dateLocaleTag, useLocale, useT } from '@/lib/i18n';
import { fetchMyMatches } from '@/lib/me';
import {
  fetchTournamentSchedule,
  isComing,
  isLive,
  isPlayed,
  matchesSearch,
  type ScheduleMatch,
  type TournamentSchedule,
} from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { font, useColors } from '@/theme';

type Tab = 'now' | 'coming' | 'played';

/** How often the schedule reloads while it's on screen. */
const REFRESH_MS = 30_000;

/**
 * The whole published schedule of a tournament, live: what's on court now and up next, what's
 * still to play by day, and what was played with scores. Search by name, club, court or
 * category; signed-in players can show only their own matches.
 */
export default function TournamentScheduleScreen() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const dateTag = dateLocaleTag(locale);
  const { profile } = useSession();

  const [schedule, setSchedule] = useState<TournamentSchedule | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('now');
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const chosenTab = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchTournamentSchedule(slug, locale);
      setSchedule(next);
      // Open on "Coming up" when nothing is on court, but never override the player's choice.
      if (!chosenTab.current) {
        const every = [...next.items, ...next.unplanned];
        setTab(every.some(isLive) ? 'now' : every.some(isComing) ? 'coming' : 'played');
      }
      setError(false);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    }
  }, [slug, locale]);

  // Load now and every 30 seconds while this screen is showing.
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  // My own matches in this tournament, to mark them and to filter on.
  useEffect(() => {
    if (!profile) return;
    let active = true;
    fetchMyMatches()
      .then((matches) => {
        if (active) {
          setMine(new Set(matches.filter((m) => m.tournament.slug === slug).map((m) => m.id)));
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [profile, slug]);

  const all = useMemo(
    () => [...(schedule?.items ?? []), ...(schedule?.unplanned ?? [])],
    [schedule],
  );
  const visible = useMemo(
    () => all.filter((m) => matchesSearch(m, query) && (!onlyMine || mine.has(m.id))),
    [all, query, onlyMine, mine],
  );
  const live = visible.filter(isLive);
  const coming = visible.filter(isComing);
  const played = visible.filter(isPlayed).reverse();

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const card = (m: ScheduleMatch) => (
    <MatchCard key={m.id} match={m} dateTag={dateTag} mine={mine.has(m.id)} />
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <TextLink title={t('Back')} onPress={() => router.back()} />
        <View style={styles.title}>
          <Heading>{t('Schedule')}</Heading>
          {name ? <Text style={[styles.subtitle, { color: colors.muted }]}>{name}</Text> : null}
        </View>

        {error && !schedule ? (
          <Text style={{ color: colors.destructive }}>
            {t('The schedule could not be loaded. Pull down to try again.')}
          </Text>
        ) : null}
        {!schedule && !error ? <Hint>{t('Loading…')}</Hint> : null}

        {schedule && !schedule.published ? (
          <View
            style={[
              styles.empty,
              { backgroundColor: colors.hero, borderColor: colors.border, boxShadow: colors.lift },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.heroFg }]}>
              {t('No schedule yet')}
            </Text>
            <Text style={[styles.emptyText, { color: colors.heroMuted }]}>
              {t('The organiser hasn’t published the schedule. Check back closer to the day.')}
            </Text>
          </View>
        ) : null}

        {schedule?.published ? (
          <>
            <Segmented<Tab>
              options={[
                {
                  value: 'now',
                  label: `${t('Now')} ${live.length ? `(${live.length})` : ''}`.trim(),
                },
                { value: 'coming', label: t('Coming up') },
                { value: 'played', label: t('Played') },
              ]}
              value={tab}
              onChange={(value) => {
                chosenTab.current = true;
                setTab(value);
              }}
            />
            <TextInput
              accessibilityLabel={t('Search the schedule')}
              placeholder={t('Name, club, court or category')}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={[
                styles.search,
                { backgroundColor: colors.card, borderColor: colors.inputBorder, color: colors.fg },
              ]}
            />
            {profile && mine.size > 0 ? (
              <View style={styles.mineRow}>
                <Text style={[styles.mineLabel, { color: colors.fg }]}>{t('Only my matches')}</Text>
                <Switch
                  accessibilityLabel={t('Only my matches')}
                  value={onlyMine}
                  onValueChange={setOnlyMine}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  ios_backgroundColor={colors.border}
                />
              </View>
            ) : null}
            {updatedAt ? (
              <Hint>
                {t('Updated {time} · refreshes by itself', {
                  time: updatedAt.toLocaleTimeString(dateTag, {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </Hint>
            ) : null}

            {tab === 'now' ? (
              <>
                <Text style={[styles.section, { color: colors.fg }]}>{t('On court')}</Text>
                {live.length === 0 ? <Hint>{t('No matches on court right now.')}</Hint> : null}
                {live.map(card)}
                <Text style={[styles.section, { color: colors.fg }]}>{t('Up next')}</Text>
                {coming.length === 0 ? <Hint>{t('Nothing left to play.')}</Hint> : null}
                {coming.slice(0, 8).map(card)}
              </>
            ) : null}

            {tab === 'coming' ? (
              coming.length === 0 ? (
                <Hint>{t('Nothing left to play.')}</Hint>
              ) : (
                byDay(coming, dateTag, t('Time to follow')).map(([day, matches]) => (
                  <View key={day} style={styles.group}>
                    <Text style={[styles.section, { color: colors.fg }]}>{day}</Text>
                    {matches.map(card)}
                  </View>
                ))
              )
            ) : null}

            {tab === 'played' ? (
              played.length === 0 ? (
                <Hint>{t('No results yet.')}</Hint>
              ) : (
                played.map(card)
              )
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Matches per day in order; those without a time go last under `laterLabel`. */
function byDay(
  matches: ScheduleMatch[],
  dateTag: string,
  laterLabel: string,
): [string, ScheduleMatch[]][] {
  const groups = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const day = m.startsAt
      ? new Date(m.startsAt).toLocaleDateString(dateTag, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : laterLabel;
    groups.set(day, [...(groups.get(day) ?? []), m]);
  }
  return [...groups.entries()];
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 12 },
  title: { gap: 2 },
  subtitle: { fontSize: 15 },
  search: {
    minHeight: 46,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  mineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mineLabel: { fontSize: 15, fontFamily: font.medium },
  section: { fontSize: 17, fontFamily: font.semibold, marginTop: 6 },
  group: { gap: 10 },
  empty: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: font.display },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
