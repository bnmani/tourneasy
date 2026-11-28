import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Field, Hint } from '@/components/ui';
import { Panel } from '@/components/Panel';
import { dateLocaleTag, useLocale, useT } from '@/lib/i18n';
import {
  fetchTournaments,
  formatFee,
  type TournamentSummary,
  type WhenFilter,
} from '@/lib/tournaments';
import { font, useColors } from '@/theme';

const FILTERS: { value: WhenFilter; label: string }[] = [
  { value: 'upcoming', label: 'Coming up' },
  { value: 'open', label: 'Entries open' },
  { value: 'past', label: 'Past' },
];

// Phase values the API can return, with the wording the website uses.
const PHASE_LABELS: Record<string, string> = {
  registrationOpen: 'Entries open',
  registrationClosed: 'Entries closed',
  inProgress: 'In progress',
  finished: 'Finished',
};

/** Searchable, filterable list of published tournaments. Works without an account. */
export function TournamentList() {
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const tag = dateLocaleTag(locale);

  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<WhenFilter>('upcoming');
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (term: string, filter: WhenFilter, cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchTournaments({ q: term, when: filter, cursor });
        setItems((current) => (cursor ? [...current, ...page.data] : page.data));
        setNextCursor(page.nextCursor);
      } catch {
        setError(t('Tournaments could not be loaded. Check your connection and try again.'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Typing or changing the filter waits a moment, then loads the first page again.
  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim(), when), 250);
    return () => clearTimeout(timer);
  }, [query, when, load]);

  const formatDates = (item: TournamentSummary) => {
    const from = new Date(`${item.startsOn}T12:00:00`);
    const to = new Date(`${item.endsOn}T12:00:00`);
    const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' });
    return item.startsOn === item.endsOn
      ? day.format(from)
      : `${day.format(from)} – ${day.format(to)}`;
  };

  return (
    <View style={styles.wrap}>
      <Field
        label={t('Search')}
        placeholder={t('Name of a tournament')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const active = f.value === when;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setWhen(f.value)}
              style={[
                styles.filter,
                {
                  borderColor: active ? colors.border : 'transparent',
                  backgroundColor: colors.card,
                  boxShadow: active ? colors.liftSmall : undefined,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? colors.fg : colors.muted,
                  fontFamily: font.semibold,
                  fontSize: 13,
                }}
              >
                {t(f.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Hint>{error}</Hint> : null}

      <FlatList
        data={items}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading && items.length === 0}
            onRefresh={() => void load(query.trim(), when)}
          />
        }
        onEndReached={() => {
          if (nextCursor && !loading) void load(query.trim(), when, nextCursor);
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? undefined : (
            <Body>
              {query.trim()
                ? t('No tournaments match your search.')
                : t('No tournaments to show yet.')}
            </Body>
          )
        }
        renderItem={({ item }) => {
          const fee = formatFee(
            item.feeFromCents,
            item.feeToCents,
            locale === 'nl' ? 'nl-NL' : 'en-GB',
          );
          const phase = PHASE_LABELS[item.phase];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => router.push(`/tournaments/${item.slug}`)}
            >
              <Panel>
                <Text style={[styles.name, { color: colors.fg }]}>{item.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 14 }}>{formatDates(item)}</Text>
                {item.venue ? (
                  <Text style={{ color: colors.muted, fontSize: 14 }}>
                    {item.venue.name}, {item.venue.city}
                  </Text>
                ) : null}
                <View style={styles.meta}>
                  {phase ? (
                    <Text style={[styles.tag, { color: colors.primary }]}>{t(phase)}</Text>
                  ) : null}
                  {fee ? <Text style={[styles.tag, { color: colors.fg }]}>{fee}</Text> : null}
                </View>
              </Panel>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  list: { gap: 12, paddingBottom: 24 },
  name: { fontSize: 17, fontFamily: font.bold },
  meta: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  tag: { fontSize: 13, fontFamily: font.semibold },
});
