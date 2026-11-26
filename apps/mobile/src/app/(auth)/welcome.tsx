import { Image, StyleSheet, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { font, splashBackground } from '@/theme';

// Logo artwork is 1381 x 1299 px. Shown 256 px wide, it is 241 px tall.
const LOGO_WIDTH = 256;
const LOGO_HEIGHT = 241;
// Band is a fixed height, so moving or resizing the logo never moves the text below it.
const BAND_HEIGHT = 300;
// Offsets from the approved mockup.
const LOGO_OFFSET_Y = -51;
const TEXT_OFFSET_Y = -72;

// The welcome screen is always shown on the logo's teal, with light text, in either theme.
const TEXT = '#f3fafb';
const MUTED = '#afdde5';

export default function WelcomeScreen() {
  const t = useT();
  const focused = useIsFocused();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      {/* Light status bar text on the brand teal, only while this screen is showing. */}
      {focused ? <StatusBar style="light" /> : null}
      <View style={styles.container}>
        <View style={styles.band}>
          <Image
            accessibilityLabel={t('Tourneasy logo')}
            source={require('../../../assets/brand/logo-teal.jpeg')}
            style={[styles.logo, { transform: [{ translateY: LOGO_OFFSET_Y }] }]}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.copy, { transform: [{ translateY: TEXT_OFFSET_Y }] }]}>
          <Text style={styles.eyebrow}>{t('Welcome')}</Text>
          <Text style={styles.heading}>{t('Enter tournaments and follow your matches')}</Text>
          <Text style={styles.body}>
            {t(
              'Find a badminton tournament near you, see your schedule on court, and get a message when you are called.',
            )}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button title={t('Sign in')} onDark onPress={() => router.push('/signin')} />
          <Button
            title={t('Create an account')}
            variant="secondary"
            onDark
            onPress={() => router.push('/signup/name')}
          />
          <TextLink
            title={t('Browse tournaments without an account')}
            onDark
            onPress={() => router.push('/tournaments')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: splashBackground },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 24 },
  band: {
    height: BAND_HEIGHT,
    marginHorizontal: -24,
    backgroundColor: splashBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  copy: { gap: 12 },
  eyebrow: { fontSize: 14, fontFamily: font.semibold, color: MUTED },
  heading: { fontSize: 30, lineHeight: 35, fontFamily: font.display, color: TEXT },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: MUTED },
  actions: { flex: 1, justifyContent: 'flex-end', gap: 12 },
});
