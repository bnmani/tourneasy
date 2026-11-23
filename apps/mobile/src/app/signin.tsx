import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field, Heading, Screen, TextLink } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useColors } from '@/theme';

export default function SignInScreen() {
  const colors = useColors();
  const { signIn } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // On success the session changes and the router moves to Home.
      await signIn(identifier, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title="Back" onPress={() => router.back()} />
        <Heading>Sign in</Heading>
        <Field
          label="Email or member number"
          placeholder="name@example.com or 100245"
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <Field
          label="Password"
          placeholder="Your password"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
        <TextLink title="Forgot password?" onPress={() => router.push('/forgot-password')} />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <View style={styles.spacer} />
        <Button title={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={submit} />
        <View style={styles.footer}>
          <Text style={{ color: colors.muted, fontSize: 15 }}>New to Tourneasy? </Text>
          <TextLink title="Create an account" onPress={() => router.replace('/signup/name')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  error: { fontSize: 14, lineHeight: 20 },
  spacer: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
