import '@/lib/sentry';

import type { ReactNode } from 'react';
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

import { LocaleProvider } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider } from '@/theme';

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
          <StatusBar style="auto" />
          <WhenSessionReady>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="tournaments" />
            </Stack>
          </WhenSessionReady>
        </SessionProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
