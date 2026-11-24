import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { splashBackground } from '@/theme';

/** Launch screen. Shows the logo, then moves to Home or Welcome depending on the session. */
export default function SplashScreen() {
  const { profile } = useSession();
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(profile ? '/(tabs)' : '/welcome');
    }, 1600);
    return () => clearTimeout(timer);
  }, [profile]);

  return (
    <View style={styles.container}>
      <Image
        accessibilityLabel={t('Tourneasy logo')}
        source={require('../../assets/brand/logo.jpg')}
        style={styles.logo}
      />
      <Text style={styles.tagline}>{t('Tournament Made Easy')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logo: { width: 295, height: 145, borderRadius: 28 },
  tagline: { fontSize: 16, color: '#afdde5', marginTop: -10 },
});
