import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Button, Field, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(email);

  return (
    <Screen>
      <View style={styles.container}>
        <TextLink title={t('Back')} onPress={() => router.back()} />
        <Heading>{t('Reset your password')}</Heading>
        <Body>
          {t('Enter the email address on your account. We send a link to set a new password. The link opens the Tourneasy website to finish.')}
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
          }}
        />
        <Hint>{t('You can request a link up to 5 times an hour from one internet connection.')}</Hint>
        {sent ? (
          <Text style={{ color: colors.fg, fontSize: 15, lineHeight: 22 }}>
            {t('If an account exists for this email, we sent a link.')}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        <Button title={t('Send reset link')} disabled={!valid} onPress={() => setSent(true)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  spacer: { flex: 1 },
});
