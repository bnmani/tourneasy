import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Button, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useColors } from '@/theme';

export default function VerifyEmailScreen() {
  const colors = useColors();
  const { email = 'your email address' } = useLocalSearchParams<{ email?: string }>();

  function openMail() {
    Linking.openURL('message://').catch(() => Alert.alert('Open your mail app', 'Find the email from Tourneasy.'));
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>Email verification</Text>
        <Heading>Check your email</Heading>
        <Body>
          We sent a link to <Text style={{ color: colors.fg, fontWeight: '600' }}>{email}</Text>. Tap the link in the
          email to open Tourneasy and finish your account.
        </Body>
        <Hint>The link is valid for 24 hours.</Hint>
        <View style={styles.actions}>
          <Button title="Open email app" onPress={openMail} />
          <Button
            title="Resend the email"
            variant="secondary"
            onPress={() => Alert.alert('Email sent', 'We sent the link again.')}
          />
          <TextLink title="Change email address" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  eyebrow: { fontSize: 14, fontWeight: '600' },
  actions: { marginTop: 24, gap: 12 },
});
