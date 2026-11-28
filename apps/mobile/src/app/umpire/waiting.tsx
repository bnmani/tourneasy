import { router, useLocalSearchParams } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';

import { UButton, UCard, UPill, UScreen, UText, usePalette } from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { font } from '@/theme';

function parseGames(raw: string | undefined): [number, number][] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(value) ? (value as [number, number][]) : [];
  } catch {
    return [];
  }
}

/** The scores are with the desk. The umpire can no longer change them. */
export default function WaitingScreen() {
  const t = useT();
  const p = usePalette();
  const params = useLocalSearchParams<{
    matchNumber?: string;
    courtNumber?: string;
    games?: string;
  }>();
  const games = parseGames(params.games);
  return (
    <UScreen>
      <View style={styles.center}>
        <View style={[styles.check, { backgroundColor: p.accent }]}>
          <Text style={[styles.tick, { color: p.bg }]}>✓</Text>
        </View>
        <Text style={[styles.title, { color: p.fg }]}>{t('Scores sent to the desk')}</Text>
      </View>
      <UCard>
        <UText muted size={13}>
          {t('Match #{number}', { number: params.matchNumber ?? '' })}
        </UText>
        {(['A', 'B'] as const).map((side, row) => (
          <View key={side} style={styles.line}>
            <UText bold={games.filter((g) => g[row] > g[1 - row]).length > games.length / 2}>
              {t('Side {side}', { side })}
            </UText>
            <UText>{games.map((g) => g[row]).join(' · ')}</UText>
          </View>
        ))}
        <UPill tone="outline" label={t('Waiting for desk')} />
      </UCard>
      <UText muted>
        {t(
          "You can't change this score now. If the desk finds a mistake, they will fix it and let you know.",
        )}
      </UText>
      <View style={styles.bottom}>
        <UButton title={t('Back to court list')} onPress={() => router.replace('/umpire/courts')} />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 20, gap: 14 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontSize: 30, fontFamily: font.bold },
  title: { fontSize: 24, fontFamily: font.display, textAlign: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { marginTop: 'auto' },
});
