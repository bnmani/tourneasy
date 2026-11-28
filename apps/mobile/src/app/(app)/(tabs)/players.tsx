import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerRow } from '@/components/PlayerRow';
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
});
