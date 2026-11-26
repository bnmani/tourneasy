import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSession } from '@/lib/session';
import { splashBackground } from '@/theme';

// Show the static logo briefly, then move on to Home or Welcome.
const SPLASH_MS = 1500;

/** Launch screen. Shows the brand logo for a moment, then moves to Home or Welcome depending on the session. */
export default function SplashScreen() {
  const { profile } = useSession();
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
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        testID="splash-logo"
        source={require('../../assets/brand/logo-teal.jpeg')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: splashBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: '80%', height: '60%' },
});
