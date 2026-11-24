import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Button, Field, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { font, useColors } from '@/theme';

export default function DeleteAccountScreen() {
  const colors = useColors();
  const { deleteAccount } = useSession();
  const t = useT();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      // On success the session ends and the router moves to Welcome.
      await deleteAccount(password);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Could not delete the account. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title={t('Back')} onPress={() => router.back()} />
        <Heading>{t('Delete your account?')}</Heading>
        <Body>{t('Your account is closed and you are signed out on every device.')}</Body>

        <View style={styles.list}>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>{t('Removed:')}</Text> {t('your name, email, date of birth, phone number and your account balance.')}
          </Text>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>{t('Kept:')}</Text> {t('your match and tournament history, under your member number, shown as "Deleted player" in draws and results.')}
          </Text>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>{t('Payment records:')}</Text> {t('kept for 7 years, as the law requires.')}
          </Text>
        </View>

        <Hint>{t('This cannot be undone. Download your data first if you want a copy.')}</Hint>

        <Field
          label={t('Enter your password to confirm')}
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={{ color: colors.destructive, fontSize: 14 }}>{error}</Text> : null}

        <View style={styles.spacer} />
        <Button
          title={busy ? t('Deleting…') : t('Delete my account')}
          variant="destructive"
          disabled={!password || busy}
          onPress={confirm}
        />
        <Button title={t('Keep my account')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14 },
  list: { gap: 10 },
  item: { fontSize: 15, lineHeight: 22 },
  bold: { fontFamily: font.semibold },
  spacer: { flex: 1 },
});
