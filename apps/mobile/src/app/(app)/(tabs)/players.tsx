import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heading, Hint } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fetchFollowing, type PublicPlayer } from '@/lib/me';
import { font, useColors } from '@/theme';

/** Find players with a public profile, and see the ones I follow. */
export default function PlayersTab() {
  const colors = useColors();
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicPlayer[] | null>(null);
  const [following, setFollowing] = useState<PublicPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searching = query.trim().length >= 2;

  // The followed list can change on a player page, so reload it whenever the tab opens.
  useFocusEffect(
    useCallback(() => {
      fetchFollowing()
        .then(setFollowing)
        .catch(() => setFollowing([]));
    }, []),
  );

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (!searching) return;
    let active = true;
    const timer = setTimeout(() => {
      apiGet<{ data: PublicPlayer[] }>('/players', { q: query.trim(), limit: 30 })
        .then((page) => {
          if (active) {
            setResults(page.data);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError('Players could not be loaded.');
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, searching]);

  const list = searching ? results : following;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <FlatList
        data={list ?? []}
        keyExtractor={(player) => player.memberNumber}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Heading>{t('Players')}</Heading>
            <TextInput
              accessibilityLabel={t('Search players')}
              placeholder={t('Name, club or member number')}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={[
                styles.search,
                { backgroundColor: colors.card, borderColor: colors.inputBorder, color: colors.fg },
              ]}
            />
            <Text style={[styles.sectionTitle, { color: colors.fg }]}>
              {searching ? t('Results') : t('Following')}
            </Text>
            {error && searching ? (
              <Text style={{ color: colors.destructive }}>{t(error)}</Text>
            ) : null}
            {list === null ? <Hint>{t('Loading…')}</Hint> : null}
            {list && list.length === 0 ? (
              <Hint>
                {searching
                  ? t('No players found. Only players with a public profile can be found.')
                  : t('You don’t follow anyone yet. Search for a player and tap Follow.')}
              </Hint>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <PlayerRow player={item} />}
      />
    </SafeAreaView>
  );
}

function PlayerRow({ player }: { player: PublicPlayer }) {
  const colors = useColors();
  const t = useT();
  const initials = player.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .filter((c) => c === c.toUpperCase())
    .slice(0, 2)
    .join('');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={player.name}
      onPress={() =>
        router.push({ pathname: '/player/[member]', params: { member: player.memberNumber } })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, boxShadow: colors.liftSmall },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.initials, { color: colors.primaryFg }]}>{initials}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.fg }]}>{player.name}</Text>
        <Hint>
          {[player.club?.name, t('Member {number}', { number: player.memberNumber })]
            .filter(Boolean)
            .join(' · ')}
        </Hint>
      </View>
      <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 10 },
  header: { gap: 14, marginBottom: 4 },
  search: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  sectionTitle: { fontSize: 17, fontFamily: font.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 15, fontFamily: font.semibold },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontFamily: font.semibold },
  chevron: { fontSize: 22 },
});
