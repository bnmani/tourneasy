import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Button, Card, Heading, Hint, Row, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { disciplineOptions } from '@/lib/links';
import { fetchPlayer, setFollowing, type PublicPlayer } from '@/lib/me';
import { useColors } from '@/theme';

/** A public player: club, disciplines, followers, and a button to follow them. */
export default function PlayerScreen() {
  const { member } = useLocalSearchParams<{ member: string }>();
  const colors = useColors();
  const t = useT();
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [following, setFollowingState] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPlayer(member)
      .then((result) => {
        if (!active || !result) return;
        setPlayer(result.player);
        setFollowingState(result.following);
        setIsSelf(result.isSelf);
      })
      .catch(() => {
        if (active) setError('This player could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [member]);

  async function toggle() {
    if (!player) return;
    const next = !following;
    setBusy(true);
    try {
      await setFollowing(player.memberNumber, next);
      setFollowingState(next);
      setPlayer({ ...player, followerCount: player.followerCount + (next ? 1 : -1) });
    } catch (caught) {
      Alert.alert(
        t('That didn’t work'),
        caught instanceof Error ? caught.message : t('Something went wrong. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  const disciplines = (player?.preferredDisciplines ?? [])
    .map((code) => disciplineOptions.find((option) => option.code === code)?.label ?? code)
    .map((label) => t(label))
    .join(', ');

  return (
    <Screen scroll>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      {error ? <Text style={{ color: colors.destructive }}>{t(error)}</Text> : null}
      {!player && !error ? <Hint>{t('Loading…')}</Hint> : null}
      {player ? (
        <>
          <View style={styles.title}>
            <Heading>{player.name}</Heading>
            <Body>{t('Member {number}', { number: player.memberNumber })}</Body>
          </View>
          <Card>
            <Row label={t('Club')} value={player.club?.name ?? t('No club')} />
            <Row label={t('Plays')} value={disciplines || t('Not given')} />
            <Row label={t('Followers')} value={String(Math.max(0, player.followerCount))} last />
          </Card>
          {isSelf ? (
            <Hint>{t('This is you. Others see this page when your profile is public.')}</Hint>
          ) : (
            <>
              <Button
                title={following ? t('Following ✓') : t('Follow')}
                variant={following ? 'secondary' : 'primary'}
                disabled={busy}
                onPress={toggle}
              />
              <Hint>
                {t(
                  'Follow a player to see them in your Players tab. Match alerts for followed players come with push notifications.',
                )}
              </Hint>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { gap: 4 },
});
