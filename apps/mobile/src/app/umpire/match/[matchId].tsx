import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CourtBadge,
  UButton,
  UCard,
  UHeader,
  UNotice,
  UScreen,
  UText,
} from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { loadMatchState, type MatchState } from '@/lib/match-state';
import { isUnauthorized, releaseCourt } from '@/lib/umpire-api';
import { useUmpireAuth } from '@/lib/use-umpire-auth';

type Params = {
  matchId: string;
  courtId?: string;
  courtNumber?: string;
  matchNumber?: string;
  round?: string;
  status?: string;
};

/** The match the desk put on this court. Starting leads to the serve choice. */
export default function MatchScreen() {
  const t = useT();
  const params = useLocalSearchParams<Params>();
  const { token, toSignIn } = useUmpireAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Read the server's state now, so the seq counter is lifted before any tap.
  const [state, setState] = useState<MatchState | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!token) return;
    loadMatchState(params.matchId, token)
      .then(setState)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [token, params.matchId]);
  const status = state?.status ?? params.status;
  // Only an IN_PROGRESS match is scored here. The serve choice is offered when it has no stored
  // start server and no events; once it has either, it is scoring.
  const inProgress = status === 'IN_PROGRESS';
  // Scheduled or called: the desk has not started it yet, so there is nothing to start here.
  const waitingForDesk = status === 'SCHEDULED' || status === 'CALLED';
  const needsServe =
    inProgress &&
    state != null &&
    (state.umpireStartServer ?? null) === null &&
    state.lastSeq === 0;
  // An IN_PROGRESS match waits for the server's answer; if that fails, scoring is the safe default.
  const ready = inProgress && loaded;
  const live = !needsServe;

  const carry = {
    matchId: params.matchId,
    courtNumber: params.courtNumber ?? '',
    matchNumber: params.matchNumber ?? '',
    round: params.round ?? '',
  };

  const changeCourt = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      if (params.courtId) await releaseCourt(token, params.courtId);
      router.replace('/umpire/courts');
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else setMessage(t('Could not give up this court. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UScreen>
      <UHeader
        eyebrow={t('Umpire')}
        title={t('Your match')}
        sub={t('Only the match the desk put on your court is shown.')}
      />
      <UCard strong>
        <View style={styles.top}>
          {params.courtNumber ? <CourtBadge number={Number(params.courtNumber)} /> : null}
          <View style={styles.info}>
            <UText bold>{t('Match #{number}', { number: params.matchNumber ?? '' })}</UText>
            <UText muted size={13}>
              {t('Round {round}', { round: params.round ?? '' })}
            </UText>
          </View>
        </View>
        <UText muted size={13}>
          {t('Players are announced by the desk. Score the sides as side A and side B.')}
        </UText>
      </UCard>
      {waitingForDesk ? (
        <UNotice>
          <UText>{t('This match is waiting for the desk to start it.')}</UText>
        </UNotice>
      ) : null}
      {message ? (
        <UNotice tone="warn">
          <UText>{message}</UText>
        </UNotice>
      ) : null}
      <View style={styles.actions}>
        {!ready ? null : live ? (
          <UButton
            title={t('Continue scoring')}
            onPress={() => router.replace({ pathname: '/umpire/scoring', params: carry })}
          />
        ) : (
          <UButton
            title={t('Start match')}
            onPress={() => router.push({ pathname: '/umpire/serve', params: carry })}
          />
        )}
        <UButton title={t('Change court')} onPress={() => void changeCourt()} busy={busy} />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  info: { flex: 1, gap: 3 },
  actions: { marginTop: 'auto', gap: 12 },
});
