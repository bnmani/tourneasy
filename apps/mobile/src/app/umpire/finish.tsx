import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { UButton, UCard, UScreen, UText, usePalette } from '@/components/umpire-ui';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { displayScore, type GameScore } from '@/lib/local-score';
import { readTapLog } from '@/lib/seq';
import { finishMatch, isUnauthorized } from '@/lib/umpire-api';
import { useMatchSync } from '@/lib/use-match-sync';
import { useUmpireAuth } from '@/lib/use-umpire-auth';

type Params = { matchId: string; courtNumber?: string; matchNumber?: string; round?: string };

/** The confirm popup. The scores go to the desk only when every tap has synced. */
export default function FinishScreen() {
  const t = useT();
  const p = usePalette();
  const params = useLocalSearchParams<Params>();
  const matchId = params.matchId;
  const { token, toSignIn } = useUmpireAuth();
  const sync = useMatchSync(matchId, token, toSignIn);
  const [games, setGames] = useState<GameScore[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void readTapLog(matchId).then((log) => setGames(displayScore(log).games));
  }, [matchId]);

  const blocked = !sync.loaded || !sync.finishable || sync.waiting > 0;

  const confirm = async () => {
    if (!token || blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await finishMatch(token, matchId);
      router.replace({
        pathname: '/umpire/waiting',
        params: {
          matchId,
          courtNumber: params.courtNumber ?? '',
          matchNumber: params.matchNumber ?? '',
          games: JSON.stringify(result.games ?? games),
        },
      });
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else if (e instanceof ApiError && e.status === 409)
        setError(t('The match is not decided yet. Go back and check the score.'));
      else setError(t('Could not send the scores. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UScreen scroll>
      <View style={styles.spacer} />
      <UText bold size={24}>
        {t('Are these scores final?')}
      </UText>
      <UCard>
        <UText muted size={13}>
          {t('Match #{number}', { number: params.matchNumber ?? '' })}
        </UText>
        {(['A', 'B'] as const).map((side, row) => (
          <View key={side} style={styles.line}>
            <View style={styles.flex}>
              <UText bold>{t('Side {side}', { side })}</UText>
            </View>
            {games.map((g, i) => (
              <UText key={i} bold={g[row] > g[1 - row]}>
                {String(g[row]).padStart(2, ' ')}
              </UText>
            ))}
          </View>
        ))}
      </UCard>
      {sync.waiting > 0 || sync.corrupt > 0 ? (
        <UText muted>{t('Waiting to sync. You can confirm when every point has synced.')}</UText>
      ) : null}
      <UText muted size={13}>
        {t(
          "After you confirm, the desk checks the scores. You can't change them yourself after that.",
        )}
      </UText>
      {error ? (
        <UText>
          <UText bold>{error}</UText>
        </UText>
      ) : null}
      <UButton
        title={t('Yes, scores are final')}
        onPress={() => void confirm()}
        disabled={blocked}
        busy={busy}
      />
      <UButton title={t('No, go back and fix')} onPress={() => router.back()} />
      <View style={[styles.handle, { backgroundColor: p.accent }]} />
    </UScreen>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 12 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  handle: { display: 'none' },
});
