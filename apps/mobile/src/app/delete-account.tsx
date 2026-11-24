import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Button, Field, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useSession } from '@/lib/session';
import { font, useColors } from '@/theme';

export default function DeleteAccountScreen() {
  const colors = useColors();
  const { deleteAccount } = useSession();
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
      setError(caught instanceof Error ? caught.message : 'Could not delete the account. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title="Back" onPress={() => router.back()} />
        <Heading>Delete your account?</Heading>
        <Body>Your account is closed and you are signed out on every device.</Body>

        <View style={styles.list}>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>Removed:</Text> your name, email, date of birth, phone number and your account
            balance.
          </Text>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>Kept:</Text> your match and tournament history, under your member number, shown
            as &quot;Deleted player&quot; in draws and results.
          </Text>
          <Text style={[styles.item, { color: colors.fg }]}>
            <Text style={styles.bold}>Payment records:</Text> kept for 7 years, as the law requires.
          </Text>
        </View>

        <Hint>This cannot be undone. Download your data first if you want a copy.</Hint>

        <Field
          label="Enter your password to confirm"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={{ color: colors.destructive, fontSize: 14 }}>{error}</Text> : null}

        <View style={styles.spacer} />
        <Button
          title={busy ? 'Deleting…' : 'Delete my account'}
          variant="destructive"
          disabled={!password || busy}
          onPress={confirm}
        />
        <Button title="Keep my account" variant="secondary" onPress={() => router.back()} />
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
