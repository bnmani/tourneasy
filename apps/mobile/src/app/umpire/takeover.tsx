import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CourtBadge, UButton, UCard, UHeader, UPill, UScreen, UText } from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { answerTakeover, fetchCourts, isUnauthorized } from '@/lib/umpire-api';
import { useUmpireAuth } from '@/lib/use-umpire-auth';

type Params = {
  mode: 'pending' | 'answer';
  requestId: string;
  courtId?: string;
  courtNumber?: string;
  holderName?: string;
  requesterName?: string;
  expiresAt?: string;
};

const POLL_MS = 5000;

function secondsLeft(expiresAt: string | undefined): number {
  const end = expiresAt ? new Date(expiresAt).getTime() : 0;
  return Math.max(0, Math.round((end - Date.now()) / 1000));
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Two sides of a take-over. `pending`: I asked for a court and wait for the holder, who has two
 * minutes. `answer`: someone asked for my court and I accept or decline.
 */
export default function TakeoverScreen() {
  const params = useLocalSearchParams<Params>();
  return params.mode === 'answer' ? <AnswerView {...params} /> : <PendingView {...params} />;
}

function PendingView(params: Params) {
  const t = useT();
  const { token, toSignIn } = useUmpireAuth();
  const [left, setLeft] = useState(() => secondsLeft(params.expiresAt));

  useEffect(() => {
    const tick = setInterval(() => setLeft(secondsLeft(params.expiresAt)), 1000);
    return () => clearInterval(tick);
  }, [params.expiresAt]);

  // When the holder accepts, the court list shows the court as mine.
  useEffect(() => {
    if (!token) return;
    const poll = setInterval(() => {
      fetchCourts(token)
        .then((courts) => {
          const court = courts.find((c) => c.id === params.courtId);
          if (court?.status === 'HELD_BY_ME') router.replace('/umpire/courts');
        })
        .catch((e) => {
          if (isUnauthorized(e)) toSignIn();
        });
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [token, params.courtId, toSignIn]);

  const who = params.holderName || t('the umpire');
  return (
    <UScreen>
      <UHeader
        eyebrow={t('Umpire')}
        title={t('Waiting for {name}', { name: who })}
        sub={t('They have 2 minutes to accept your take-over.')}
      />
      <UCard strong>
        <View style={styles.row}>
          {params.courtNumber ? <CourtBadge number={Number(params.courtNumber)} /> : null}
          <View style={styles.flex} />
          <UPill label={left > 0 ? t('{time} left', { time: clock(left) }) : t('Time is up')} />
        </View>
      </UCard>
      <UText muted>
        {t('If they do not answer in time, the match desk decides who scores court {number}.', {
          number: params.courtNumber ?? '',
        })}
      </UText>
      <View style={styles.bottom}>
        <UButton title={t('Back to court list')} onPress={() => router.replace('/umpire/courts')} />
      </View>
    </UScreen>
  );
}

function AnswerView(params: Params) {
  const t = useT();
  const { token, toSignIn } = useUmpireAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (value: 'ACCEPT' | 'DECLINE') => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await answerTakeover(token, params.requestId, value);
      router.replace('/umpire/courts');
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else setError(t('Could not send your answer. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UScreen>
      <UHeader
        eyebrow={t('Umpire')}
        title={t('{name} wants court {number}', {
          name: params.requesterName || t('Another umpire'),
          number: params.courtNumber ?? '',
        })}
      />
      <UText muted>
        {t(
          'Court {number} stays with you until you accept. You have 2 minutes to answer. If there is no answer, the match desk decides.',
          { number: params.courtNumber ?? '' },
        )}
      </UText>
      {error ? <UText>{error}</UText> : null}
      <View style={styles.bottom}>
        <UButton title={t('Accept')} onPress={() => void answer('ACCEPT')} busy={busy} />
        <UButton title={t('Decline')} onPress={() => void answer('DECLINE')} busy={busy} />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  bottom: { marginTop: 'auto', gap: 12 },
});
