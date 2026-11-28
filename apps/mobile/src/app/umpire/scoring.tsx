import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CourtBadge,
  UButton,
  UCard,
  UNotice,
  UPill,
  UScreen,
  UText,
  usePalette,
} from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { displayScore, type GameScore } from '@/lib/local-score';
import { clearCorrupt, dismissRejected } from '@/lib/score-queue';
import { readTapLog, recordTap } from '@/lib/seq';
import { useMatchSync } from '@/lib/use-match-sync';
import { useUmpireAuth } from '@/lib/use-umpire-auth';
import { font } from '@/theme';

type Params = { matchId: string; courtNumber?: string; matchNumber?: string; round?: string };

export default function ScoringScreen() {
  const t = useT();
  const p = usePalette();
  const params = useLocalSearchParams<Params>();
  const matchId = params.matchId;
  const { token, toSignIn } = useUmpireAuth();
  const sync = useMatchSync(matchId, token, toSignIn);
  const [games, setGames] = useState<GameScore[]>([]);
  const [serving, setServing] = useState<'A' | 'B' | null>(null);
  const [noted, setNoted] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const loadScore = useCallback(async () => {
    const shown = displayScore(await readTapLog(matchId));
    setGames(shown.games);
    setServing(shown.serving);
  }, [matchId]);

  useEffect(() => {
    let current = true;
    void readTapLog(matchId).then((log) => {
      if (!current) return;
      const shown = displayScore(log);
      setGames(shown.games);
      setServing(shown.serving);
    });
    return () => {
      current = false;
    };
  }, [matchId]);

  const tap = async (kind: 'A' | 'B' | 'UNDO') => {
    setSaveError(false);
    try {
      await recordTap(matchId, kind === 'UNDO' ? { kind: 'UNDO' } : { kind: 'POINT', side: kind });
    } catch {
      // The tap was not saved: say so, because nothing will be sent for it.
      setSaveError(true);
      return;
    }
    await loadScore();
    await sync.refresh();
    void sync.sync();
  };

  const finishDisabled = !sync.loaded || !sync.finishable || sync.waiting > 0;
  const current = games[games.length - 1] ?? [0, 0];
  const gameNumber = Math.max(games.length, 1);
  const offline = sync.problem === 'retry' && sync.waiting > 0;
  const carry = {
    matchId,
    courtNumber: params.courtNumber ?? '',
    matchNumber: params.matchNumber ?? '',
    round: params.round ?? '',
  };

  const sideRow = (side: 'A' | 'B') => {
    const index = side === 'A' ? 0 : 1;
    const other = side === 'A' ? 1 : 0;
    return (
      <View style={styles.sideRow}>
        <View style={styles.flex}>
          <UText bold>{t('Side {side}', { side })}</UText>
          {serving === side ? (
            <UText muted size={12} bold>
              {`● ${t('serving')}`}
            </UText>
          ) : null}
        </View>
        {(games.length ? games : [[0, 0] as GameScore]).map((g, i) => (
          <Text
            key={i}
            style={[
              styles.gameCell,
              {
                color: g[index] > g[other] ? p.fg : p.accent,
                fontFamily: g[index] > g[other] ? font.bold : font.medium,
              },
            ]}
          >
            {g[index]}
          </Text>
        ))}
      </View>
    );
  };

  return (
    <UScreen scroll>
      <UText muted bold size={17}>
        {t('Game {number} of 3', { number: gameNumber })}
      </UText>

      {offline ? (
        <UNotice>
          <View style={styles.between}>
            <UText>{`● ${t('Offline')}`}</UText>
            <UPill label={t('{count} waiting to sync', { count: sync.waiting })} />
          </View>
          <UText muted size={13}>
            {t(
              'Points keep working. They sync automatically when the signal returns. The final score waits until all points have synced.',
            )}
          </UText>
        </UNotice>
      ) : sync.waiting > 0 ? (
        <UNotice>
          <UPill label={t('{count} waiting to sync', { count: sync.waiting })} />
        </UNotice>
      ) : null}

      {sync.problem === 'contactDesk' ? (
        <UNotice tone="warn">
          <UText>{t('This tap cannot be synced, contact the desk.')}</UText>
          <UText muted size={13}>
            {t('It stays saved on this phone. Do not finish the match until the desk has looked.')}
          </UText>
        </UNotice>
      ) : null}

      {sync.rejected.length > 0 ? (
        <UNotice tone="warn">
          <UText>
            {sync.rejected.length === 1
              ? t('The desk did not accept {count} tap.', { count: sync.rejected.length })
              : t('The desk did not accept {count} taps.', { count: sync.rejected.length })}
          </UText>
          {sync.rejected.map((r) => (
            <UText key={r.event.id} muted size={13}>
              {t('Point {seq}: {reason}', { seq: r.event.seq, reason: r.reason })}
            </UText>
          ))}
          <UButton
            title={t('Dismiss')}
            small
            onPress={() => {
              void dismissRejected(matchId).then(() => sync.refresh());
            }}
          />
        </UNotice>
      ) : null}

      {sync.corrupt > 0 ? (
        <UNotice tone="warn">
          <UText>
            {sync.corrupt === 1
              ? t('{count} unreadable record on this phone.', { count: sync.corrupt })
              : t('{count} unreadable records on this phone.', { count: sync.corrupt })}
          </UText>
          <UText muted size={13}>
            {t(
              'Some points may be missing. Tell the match desk, then clear the record to continue.',
            )}
          </UText>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={t('I have noted it')}
            accessibilityState={{ checked: noted }}
            onPress={() => setNoted((v) => !v)}
            style={styles.check}
          >
            <UText>{`${noted ? '☑' : '☐'}  ${t('I have noted it')}`}</UText>
          </Pressable>
          <UButton
            title={t('Clear unreadable records')}
            small
            disabled={!noted}
            onPress={() => {
              void clearCorrupt(matchId).then(() => {
                setNoted(false);
                return sync.refresh();
              });
            }}
          />
        </UNotice>
      ) : null}

      {saveError ? (
        <UNotice tone="warn">
          <UText>{t('That tap was not saved. Tap again.')}</UText>
        </UNotice>
      ) : null}

      <UCard strong>
        <View style={styles.between}>
          {params.courtNumber ? <CourtBadge number={Number(params.courtNumber)} /> : <View />}
          <View style={styles.flex}>
            <UText bold size={14}>
              {t('Match #{number}', { number: params.matchNumber ?? '' })}
            </UText>
          </View>
          {offline ? (
            <UText muted size={12}>
              {t('Saved on this phone')}
            </UText>
          ) : (
            <UPill label={t('Live')} />
          )}
        </View>
        {sideRow('A')}
        <View style={[styles.rule, { backgroundColor: p.border }]} />
        {sideRow('B')}
      </UCard>

      <View style={styles.taps}>
        {(['A', 'B'] as const).map((side) => (
          <Pressable
            key={side}
            accessibilityRole="button"
            accessibilityLabel={t('Point for side {side}', { side })}
            onPress={() => void tap(side)}
            style={({ pressed }) => [
              styles.tap,
              { borderColor: p.border, backgroundColor: p.bg },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.tapName, { color: p.fg }]}>{t('Side {side}', { side })}</Text>
            <Text style={[styles.tapPlus, { color: p.fg }]}>+1</Text>
            <Text style={{ color: p.accent, fontSize: 12 }}>
              {`${current[side === 'A' ? 0 : 1]}`}
            </Text>
          </Pressable>
        ))}
      </View>

      <UButton
        title={t('Undo last point')}
        onPress={() => void tap('UNDO')}
        disabled={games.length === 0}
      />
      <UButton
        variant="text"
        title={t('Finish match')}
        disabled={finishDisabled}
        onPress={() => router.push({ pathname: '/umpire/finish', params: carry })}
      />
      {sync.waiting > 0 ? (
        <UText muted center size={13}>
          {t('Waiting to sync. You can finish when every point has synced.')}
        </UText>
      ) : null}
      <UButton
        variant="text"
        title={t('Phone not working? Use paper')}
        onPress={() => router.push({ pathname: '/umpire/paper', params: carry })}
      />
    </UScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gameCell: { width: 34, textAlign: 'center', fontSize: 17, fontVariant: ['tabular-nums'] },
  rule: { height: 1 },
  taps: { flexDirection: 'row', gap: 12, minHeight: 200 },
  tap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  tapName: { fontSize: 14, fontFamily: font.semibold, textAlign: 'center' },
  tapPlus: { fontSize: 34, fontFamily: font.bold },
  pressed: { opacity: 0.75 },
  check: { minHeight: 44, justifyContent: 'center' },
});
