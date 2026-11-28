import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
  const live = params.status === 'IN_PROGRESS';

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
      {message ? (
        <UNotice tone="warn">
          <UText>{message}</UText>
        </UNotice>
      ) : null}
      <View style={styles.actions}>
        {live ? (
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
