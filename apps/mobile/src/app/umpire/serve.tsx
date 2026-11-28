import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { UButton, UCard, UHeader, UScreen, UText, usePalette } from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { isUnauthorized, startMatch } from '@/lib/umpire-api';
import { useUmpireAuth } from '@/lib/use-umpire-auth';

type Params = { matchId: string; courtNumber?: string; matchNumber?: string; round?: string };

/** Who serves first. The choice goes to the website before scoring opens. */
export default function ServeScreen() {
  const t = useT();
  const p = usePalette();
  const params = useLocalSearchParams<Params>();
  const { token, toSignIn } = useUmpireAuth();
  const [serving, setServing] = useState<'A' | 'B'>('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await startMatch(token, params.matchId, serving);
      router.replace({
        pathname: '/umpire/scoring',
        params: {
          matchId: params.matchId,
          courtNumber: params.courtNumber ?? '',
          matchNumber: params.matchNumber ?? '',
          round: params.round ?? '',
        },
      });
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else setError(t('Could not start the match. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const option = (side: 'A' | 'B') => {
    const selected = serving === side;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={t('Side {side} serves first', { side })}
        accessibilityState={{ selected }}
        onPress={() => setServing(side)}
      >
        <UCard strong={selected}>
          <View style={styles.option}>
            <View style={styles.flex}>
              <UText muted bold size={12}>
                {selected ? t('SERVES FIRST') : t('RECEIVES FIRST')}
              </UText>
              <UText bold size={18}>
                {t('Side {side}', { side })}
              </UText>
            </View>
            <View style={[styles.radio, { borderColor: p.accent }]}>
              {selected ? <View style={[styles.dot, { backgroundColor: p.accent }]} /> : null}
            </View>
          </View>
        </UCard>
      </Pressable>
    );
  };

  return (
    <UScreen>
      <UHeader eyebrow={t('Set-up')} title={t('Who serves first?')} />
      <UText muted>
        {t('Tap the side that serves first. You can change it until the first point is scored.')}
      </UText>
      {option('A')}
      {option('B')}
      {error ? <UText muted>{error}</UText> : null}
      <View style={styles.bottom}>
        <UButton title={t('Start scoring')} onPress={() => void start()} busy={busy} />
        <UButton
          variant="text"
          title={t('Back to court list')}
          onPress={() => router.replace('/umpire/courts')}
        />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 4 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bottom: { marginTop: 'auto', gap: 4 },
});
