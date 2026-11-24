import '@/lib/sentry';

import {
  useFonts as useInter,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_700Bold, useFonts as useFraunces } from '@expo-google-fonts/fraunces';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider, useSession } from '@/lib/session';
import { LocaleProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/theme';

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
          <Routes />
        </SessionProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}

/** Signed-out and signed-in screens are separate groups; the router moves the user when the session changes. */
function Routes() {
  const { profile } = useSession();
  const signedIn = profile !== null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="delete-account" />
          <Stack.Screen name="notifications" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="signin" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
