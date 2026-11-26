import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { font, useColors } from '@/theme';

// The transparent logo artwork is 800 x 536 px.
const LOGO_ASPECT = 800 / 536;

/**
 * Welcome, as in the approved mock-up: the logo with the wordmark and tagline, the welcome
 * text right under it, and the buttons at the bottom.
 */
export default function WelcomeScreen() {
  const t = useT();
  const colors = useColors();
  // 70% of the content width, as in the mock-up.
  const logoWidth = Math.min(300, (useWindowDimensions().width - 48) * 0.7);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <Image
            accessibilityLabel={t('Tourneasy logo')}
            source={require('../../../assets/brand/logo-transparent.png')}
            // In the light theme the logo is drawn in the text colour.
            style={{
              width: logoWidth,
              height: logoWidth / LOGO_ASPECT,
              tintColor: colors.dark ? undefined : colors.fg,
            }}
            resizeMode="contain"
          />
          <Text style={[styles.wordmark, { color: colors.fg }]}>TOURNEASY</Text>
          <Text style={[styles.tagline, { color: colors.muted }]}>{t('Tournament made easy')}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>{t('Welcome')}</Text>
          <Text style={[styles.heading, { color: colors.fg }]}>
            {t('Enter tournaments and follow your matches')}
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {t(
              'Find a badminton tournament near you, see your schedule on court, and get a message when you are called.',
            )}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button title={t('Sign in')} onPress={() => router.push('/signin')} />
          <Button
            title={t('Create an account')}
            variant="secondary"
            onPress={() => router.push('/signup/name')}
          />
          <TextLink
            title={t('Browse tournaments without an account')}
            center
            onPress={() => router.push('/tournaments')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 16, gap: 20 },
  brand: { alignItems: 'center', paddingTop: 12 },
  wordmark: { fontSize: 30, fontFamily: font.display, letterSpacing: 4.2, marginTop: -4 },
  tagline: {
    fontSize: 12,
    fontFamily: font.regular,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  copy: { gap: 10 },
  eyebrow: {
    fontSize: 13,
    fontFamily: font.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heading: { fontSize: 30, lineHeight: 35, fontFamily: font.display },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular },
  actions: { flex: 1, justifyContent: 'flex-end', gap: 16 },
});
