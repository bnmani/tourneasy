import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Button, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { font, useColors } from '@/theme';

export default function VerifyEmailScreen() {
  const colors = useColors();
  const t = useT();
  const { email = t('your email address') } = useLocalSearchParams<{ email?: string }>();

  // The email is set in bold, so the translated sentence is split around its placeholder.
  const [before, after = ''] = t(
    'We sent a link to {email}. Tap the link in the email to open Tourneasy and finish your account.',
    { email: '\u0001' },
  ).split('\u0001');

  function openMail() {
    Linking.openURL('message://').catch(() =>
      Alert.alert(t('Open your mail app'), t('Find the email from Tourneasy.')),
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('Email verification')}</Text>
        <Heading>{t('Check your email')}</Heading>
        <Body>
          {before}
          <Text style={{ color: colors.fg, fontFamily: font.semibold }}>{email}</Text>
          {after}
        </Body>
        <Hint>{t('The link is valid for 24 hours.')}</Hint>
        <View style={styles.actions}>
          <Button title={t('Open email app')} onPress={openMail} />
          {/* The website has no "send the link again" call for the app yet, so this
              offers the next real step: signing in with the new account. */}
          <Button
            title={t('Go to sign in')}
            variant="secondary"
            onPress={() => router.replace('/signin')}
          />
          <TextLink title={t('Change email address')} onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  eyebrow: { fontSize: 14, fontFamily: font.semibold },
  actions: { marginTop: 24, gap: 12 },
});
