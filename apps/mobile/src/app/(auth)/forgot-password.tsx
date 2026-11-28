import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Button, Field, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { apiSend } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /\S+@\S+\.\S+/.test(email);

  // Asks the website to email a reset link. The server answers 202 when it sent one.
  async function send() {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title={t('Back')} onPress={() => router.back()} />
        <Heading>{t('Reset your password')}</Heading>
        <Body>
          {t(
            'Enter the email address on your account. We send a link to set a new password. The link opens the Tourneasy website to finish.',
          )}
        </Body>
        <Field
          label={t('Email')}
          placeholder={t('name@example.com')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setSent(false);
            setError(null);
          }}
        />
        <Hint>
          {t('You can request a link up to 5 times an hour from one internet connection.')}
        </Hint>
        {sent ? (
          <Text style={{ color: colors.fg, fontSize: 15, lineHeight: 22 }}>
            {t('We sent a link to set a new password. Check your email.')}
          </Text>
        ) : null}
        {error ? (
          <Text style={{ color: colors.destructive, fontSize: 14, lineHeight: 20 }}>{error}</Text>
        ) : null}
        <View style={styles.spacer} />
        <Button
          title={busy ? t('Sending…') : t('Send reset link')}
          disabled={!valid || busy}
          onPress={send}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  spacer: { flex: 1 },
});
