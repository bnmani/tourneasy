import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Card, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { fetchEmailPreferences, saveEmailPreferences, type EmailPreference } from '@/lib/me';
import { font, useColors } from '@/theme';

// Same wording as the website's notifications page.
const labels: Record<string, { title: string; hint: string }> = {
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

/** Which optional emails I get. Saved to my account, so the website shows the same. */
export default function NotificationSettingsScreen() {
  const colors = useColors();
  const t = useT();
  const [prefs, setPrefs] = useState<EmailPreference[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmailPreferences()
      .then(setPrefs)
      .catch(() => setError('Your email settings could not be loaded.'));
  }, []);

  async function toggle(type: string, enabled: boolean) {
    const before = prefs;
    // Show the change at once; put it back if the save fails.
    setPrefs((current) => current?.map((p) => (p.type === type ? { ...p, enabled } : p)) ?? null);
    try {
      setPrefs(await saveEmailPreferences({ [type]: enabled }));
    } catch (caught) {
      setPrefs(before);
      Alert.alert(
        t('Not saved'),
        caught instanceof Error ? caught.message : t('Something went wrong. Try again.'),
      );
    }
  }

  return (
    <Screen scroll>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      <Heading>{t('Notifications')}</Heading>

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('EMAIL')}</Text>
      <Hint>{t('You can switch these emails off')}</Hint>
      {error ? <Text style={{ color: colors.destructive }}>{t(error)}</Text> : null}
      {!prefs && !error ? <Hint>{t('Loading…')}</Hint> : null}
      {prefs ? (
        <Card>
          {prefs.map((pref, index) => {
            const label = labels[pref.type] ?? { title: pref.type, hint: '' };
            return (
              <View
                key={pref.type}
                style={[
                  styles.row,
                  index < prefs.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth * 2,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.fg }]}>{t(label.title)}</Text>
                  {label.hint ? <Hint>{t(label.hint)}</Hint> : null}
                </View>
                <Switch
                  accessibilityLabel={t(label.title)}
                  value={pref.enabled}
                  onValueChange={(value) => void toggle(pref.type, value)}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('ALWAYS SENT')}</Text>
      <Hint>
        {t(
          'Entry confirmations, partner invitations, receipts, refunds, password and account messages, and your match times (also when they change).',
        )}
      </Hint>

      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{t('ON THIS PHONE')}</Text>
      <Hint>
        {t(
          'Push notifications for match calls and schedule changes come in a later update. Until then, these arrive by email.',
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
});
