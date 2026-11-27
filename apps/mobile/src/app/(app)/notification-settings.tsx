import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button, Card, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { fetchPreferences, savePreference, type Preferences } from '@/lib/me';
import { disablePush, enablePush, pushState, rememberPushOff, type PushState } from '@/lib/push';
import { font, useColors } from '@/theme';

// Same wording as the website's notifications page.
const emailLabels: Record<string, { title: string; hint: string }> = {
  TOURNAMENT_REMINDER: {
    title: 'Tournament reminder',
    hint: 'Two days before: venue and your first match.',
  },
  ENTRY_DEADLINE_REMINDER: {
    title: 'Entry deadline reminder',
    hint: 'When something is still open just before entries close: payment, partner, invitation.',
  },
  TOURNAMENT_RESULTS: {
    title: 'Results after a tournament',
    hint: 'Your matches and placings afterwards.',
  },
  ANNOUNCEMENT: {
    title: 'News from the organisers',
    hint: 'Messages from the organisers of tournaments you entered.',
  },
};

const pushLabels: Record<string, { title: string; hint: string }> = {
  MATCH_SCHEDULED: {
    title: 'My matches',
    hint: 'When your match goes on court, and when your schedule is out or changes.',
  },
  FOLLOWED_PLAYER_MATCH_SCHEDULED: {
    title: 'Players I follow',
    hint: 'When a player you follow goes on court.',
  },
  ANNOUNCEMENT: {
    title: 'News from the organisers',
    hint: 'News from tournaments you entered, and messages from the Tourneasy team.',
  },
};

/** Push on this phone, and which emails and pushes I get. Saved to my account. */
export default function NotificationSettingsScreen() {
  const colors = useColors();
  const t = useT();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload when coming back from iOS Settings, where push may have been allowed.
  useFocusEffect(
    useCallback(() => {
      fetchPreferences()
        .then(setPrefs)
        .catch(() => setError('Your notification settings could not be loaded.'));
      void pushState().then(setPhone);
    }, []),
  );

  async function toggle(channel: 'email' | 'push', type: string, enabled: boolean) {
    const before = prefs;
    const flip = (list: Preferences['email']) =>
      list.map((p) => (p.type === type ? { ...p, enabled } : p));
    setPrefs((p) => (p ? { ...p, [channel]: flip(p[channel]) } : p));
    try {
      setPrefs(await savePreference(channel, type, enabled));
    } catch (caught) {
      setPrefs(before);
      Alert.alert(
        t('Not saved'),
        caught instanceof Error ? caught.message : t('Something went wrong. Try again.'),
      );
    }
  }

  async function setPhonePush(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        await rememberPushOff(false);
        setPhone(await enablePush());
      } else {
        await rememberPushOff(true);
        await disablePush();
        setPhone('off');
      }
    } catch {
      Alert.alert(t('Not saved'), t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const rows = (
    channel: 'email' | 'push',
    labels: Record<string, { title: string; hint: string }>,
    disabled = false,
  ) => (
    <Card>
      {(prefs?.[channel] ?? []).map((pref, index, list) => {
        const label = labels[pref.type] ?? { title: pref.type, hint: '' };
        return (
          <View
            key={pref.type}
            style={[
              styles.row,
              index < list.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth * 2,
                borderBottomColor: colors.border,
              },
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.fg }]}>{t(label.title)}</Text>
              {label.hint ? <Hint>{t(label.hint)}</Hint> : null}
            </View>
            <Switch
              accessibilityLabel={t(label.title)}
              value={pref.enabled}
              disabled={disabled}
              onValueChange={(value) => void toggle(channel, pref.type, value)}
              trackColor={{ true: colors.primary, false: colors.border }}
              ios_backgroundColor={colors.border}
            />
          </View>
        );
      })}
    </Card>
  );

  return (
    <Screen scroll>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      <Heading>{t('Notifications')}</Heading>
      {error ? <Text style={{ color: colors.destructive }}>{t(error)}</Text> : null}
      {!prefs && !error ? <Hint>{t('Loading…')}</Hint> : null}

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('ON THIS PHONE')}</Text>
      <Card>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.fg }]}>{t('Push notifications')}</Text>
            <Hint>
              {phone === 'blocked'
                ? t('Turned off in iOS Settings. Allow notifications for Tourneasy there.')
                : t('Match calls and schedule changes on this phone.')}
            </Hint>
          </View>
          <Switch
            accessibilityLabel={t('Push notifications')}
            value={phone === 'on'}
            disabled={busy || phone === null}
            onValueChange={(on) => void setPhonePush(on)}
            trackColor={{ true: colors.primary, false: colors.border }}
            ios_backgroundColor={colors.border}
          />
        </View>
      </Card>
      {phone === 'blocked' ? (
        <Button
          title={t('Open iOS Settings')}
          variant="secondary"
          onPress={() => void enablePush().then(setPhone)}
        />
      ) : null}
      {prefs && prefs.push.length ? rows('push', pushLabels, phone !== 'on') : null}

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('EMAIL')}</Text>
      <Hint>{t('You can switch these emails off')}</Hint>
      {prefs ? rows('email', emailLabels) : null}

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('ALWAYS SENT')}</Text>
      <Hint>
        {t(
          'Entry confirmations, partner invitations, receipts, refunds, password and account messages, and your match times (also when they change).',
        )}
      </Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontFamily: font.semibold, letterSpacing: 0.5, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontFamily: font.medium },
  disabled: { opacity: 0.5 },
});
