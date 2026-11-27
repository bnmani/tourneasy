import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useSession } from '@/lib/session';
import { useColors } from '@/theme';

// Show the logo briefly, then move on to Home or Welcome.
const SPLASH_MS = 1500;
// Same size as the native splash image, so the hand-over doesn't jump.
const LOGO_SIZE = 240;

/**
 * Launch screen. Shows the brand logo in the theme's colours for a moment, then moves to Home or
 * Welcome depending on the session.
 */
export default function SplashScreen() {
  const { profile } = useSession();
  const colors = useColors();
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(profileRef.current ? '/(app)/(tabs)' : '/welcome');
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Image
        testID="splash-logo"
        accessibilityLabel="Tourneasy"
        source={
          colors.dark
            ? require('../../assets/splash-logo-dark.png')
            : require('../../assets/splash-logo-light.png')
        }
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
