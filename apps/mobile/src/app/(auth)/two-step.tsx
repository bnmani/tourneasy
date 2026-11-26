import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { Body, Button, Field, Heading, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useColors } from '@/theme';

/** Second step of sign-in: the code from the authenticator app, or a recovery code. */
export default function TwoStepScreen() {
  const colors = useColors();
  const t = useT();
  const { pendingTwoStep, completeTwoStep, cancelTwoStep } = useSession();

  const [code, setCode] = useState('');
  // Authenticator codes are digits, so the number pad opens by default. Recovery codes have letters.
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Someone who opens this screen without signing in first goes back to sign-in.
  if (!pendingTwoStep) {
    return <Redirect href="/signin" />;
  }

  async function submit() {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      // On success the session changes and the router moves to Home.
      await completeTwoStep(code);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t('Sign in failed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    cancelTwoStep();
    router.replace('/signin');
  }

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title={t('Back')} onPress={cancel} />
        <Heading>{t('Two-step login')}</Heading>
        <Body>
          {recovery
            ? t('Enter one of your recovery codes.')
            : t('Enter the 6-digit code from your authenticator app.')}
        </Body>
        <Field
          label={recovery ? t('Recovery code') : t('Code')}
          placeholder={recovery ? t('Recovery code') : t('123456')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="one-time-code"
          keyboardType={recovery ? 'default' : 'number-pad'}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          value={code}
          onChangeText={setCode}
        />
        <TextLink
          title={recovery ? t('Use the 6-digit code instead') : t('Use a recovery code instead')}
          onPress={() => {
            setRecovery((current) => !current);
            setCode('');
            setError(null);
          }}
        />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <View style={styles.spacer} />
        <Button
          title={busy ? t('Checking…') : t('Continue')}
          disabled={busy || code.trim().length === 0}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  error: { fontSize: 14, lineHeight: 20 },
  spacer: { flex: 1 },
});
