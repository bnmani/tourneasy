import '@/lib/sentry';

import { useEffect, type ReactNode } from 'react';
import {
  useFonts as useInter,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_700Bold, useFonts as useFraunces } from '@expo-google-fonts/fraunces';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Linking, View } from 'react-native';
import { handleURLCallback } from '@stripe/stripe-react-native';

import { AppLockProvider } from '@/lib/app-lock';
import { PushSetup } from '@/lib/push';
import { LocaleProvider } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useColors } from '@/theme';

/** Status bar text that stays readable in the app's chosen theme (not only the phone's). */
function ThemedStatusBar() {
  const colors = useColors();
  return <StatusBar style={colors.dark ? 'light' : 'dark'} />;
}

// Keep the native launch screen up until the first screen has drawn. Otherwise it goes as soon as
// React starts, and the phone shows an empty black window while fonts and the login load.
void SplashScreen.preventAutoHideAsync();

/**
 * The screen stack, with the theme's background behind every screen so transitions never flash.
 * Its first layout hands over from the native launch screen.
 */
function ThemedStack({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={() => SplashScreen.hide()}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {children}
      </Stack>
    </View>
  );
}

/** Hands links back from a bank page (iDEAL) to Stripe's payment sheet. */
function StripeLinks() {
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('stripe-redirect')) void handleURLCallback(url);
    });
    return () => subscription.remove();
  }, []);
  return null;
}

/** Shows nothing until the stored login is checked, so no screen flashes before the right one. */
function WhenSessionReady({ children }: { children: ReactNode }) {
  const { ready } = useSession();
  return ready ? <>{children}</> : null;
}

export default function RootLayout() {
  const [interLoaded] = useInter({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [frauncesLoaded] = useFraunces({ Fraunces_700Bold });

  // Wait for the fonts so no screen flashes in the system font.
  if (!interLoaded || !frauncesLoaded) {
    return null;
  }

  return (
    <LocaleProvider>
      <ThemeProvider>
        <SessionProvider>
          <ThemedStatusBar />
          <StripeLinks />
          <PushSetup />
          <AppLockProvider>
            <WhenSessionReady>
              <ThemedStack>
                <Stack.Screen name="index" />
                <Stack.Screen name="(app)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="tournaments" />
              </ThemedStack>
            </WhenSessionReady>
          </AppLockProvider>
        </SessionProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
