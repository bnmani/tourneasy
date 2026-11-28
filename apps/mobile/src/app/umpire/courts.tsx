import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  CourtBadge,
  UButton,
  UCard,
  UHeader,
  UNotice,
  UPill,
  UScreen,
  UText,
} from '@/components/umpire-ui';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useUmpireAuth } from '@/lib/use-umpire-auth';
import {
  claimCourt,
  fetchCourts,
  isUnauthorized,
  requestTakeover,
  type CourtItem,
} from '@/lib/umpire-api';
import { useUmpire } from '@/lib/umpire-session';

function matchParams(court: CourtItem) {
  const m = court.match!;
  return {
    matchId: m.id,
    courtId: court.id,
    courtNumber: String(court.number),
    matchNumber: String(m.matchNumber),
    round: String(m.round),
    status: m.status,
  };
}

export default function CourtsScreen() {
  const t = useT();
  const { token, toSignIn } = useUmpireAuth();
  const { signOut } = useUmpire();
  const [courts, setCourts] = useState<CourtItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!token) return;
    let current = true;
    fetchCourts(token)
      .then((list) => {
        if (!current) return;
        setCourts(list);
        setMessage(null);
      })
      .catch((e: unknown) => {
        if (!current) return;
        if (isUnauthorized(e)) toSignIn();
        else setMessage(t('Could not load the courts. Check your connection.'));
      });
    return () => {
      current = false;
    };
  }, [token, toSignIn, t, reloads]);

  const open = async (court: CourtItem) => {
    if (!token || !court.match || busy) return;
    setBusy(true);
    try {
      if (court.status === 'FREE') await claimCourt(token, court.id);
      router.push({ pathname: '/umpire/match/[matchId]', params: matchParams(court) });
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else if (e instanceof ApiError && e.status === 409) {
        setMessage(t('Someone else just took this court.'));
        load();
      } else setMessage(t('Could not take this court. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const takeOver = async (court: CourtItem) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const created = await requestTakeover(token, court.id);
      router.push({
        pathname: '/umpire/takeover',
        params: {
          mode: 'pending',
          requestId: created.id,
          courtId: court.id,
          courtNumber: String(court.number),
          holderName: court.holderName ?? '',
          expiresAt: created.expiresAt,
        },
      });
    } catch (e) {
      if (isUnauthorized(e)) toSignIn();
      else if (e instanceof ApiError && e.status === 409)
        setMessage(t('A take-over request for this court is already open.'));
      else setMessage(t('Could not send the take-over request. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UScreen scroll>
      <UHeader
        eyebrow={t('Umpire')}
        title={t('Pick your court')}
        sub={t('Tap the court you are standing at.')}
      />
      {message ? (
        <UNotice tone="warn">
          <UText>{message}</UText>
        </UNotice>
      ) : null}
      {courts === null && !message ? <UText muted>{t('Loading courts…')}</UText> : null}
      {courts?.map((court) => {
        const held = court.status === 'HELD';
        const mine = court.status === 'HELD_BY_ME';
        const tappable = !held && court.match !== null;
        const body = (
          <UCard strong={mine}>
            <View style={styles.row}>
              <CourtBadge number={court.number} />
              <View style={styles.text}>
                {held ? (
                  <UText bold>
                    {t('Being scored by {name}', { name: court.holderName ?? '' })}
                  </UText>
                ) : court.match ? (
                  <>
                    <UText bold>{t('Match #{number}', { number: court.match.matchNumber })}</UText>
                    <UText muted size={12}>
                      {t('Round {round}', { round: court.match.round })}
                    </UText>
                  </>
                ) : (
                  <UText bold>{t('Waiting for the desk')}</UText>
                )}
              </View>
              {mine ? <UPill label={t('Your court')} /> : null}
              {held ? (
                <UButton
                  title={t('Take over')}
                  small
                  onPress={() => void takeOver(court)}
                  busy={busy}
                />
              ) : null}
            </View>
          </UCard>
        );
        return tappable ? (
          <Pressable
            key={court.id}
            accessibilityRole="button"
            accessibilityLabel={t('Court {number}', { number: court.number })}
            onPress={() => void open(court)}
          >
            {body}
          </Pressable>
        ) : (
          <View key={court.id}>{body}</View>
        );
      })}
      <View style={styles.footer}>
        <UButton
          variant="text"
          title={t('Sign out')}
          onPress={() => {
            void signOut();
            router.replace('/umpire/sign-in');
          }}
        />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  footer: { marginTop: 'auto' },
});
