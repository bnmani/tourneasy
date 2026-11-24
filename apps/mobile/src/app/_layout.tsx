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

import { LocaleProvider } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';
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
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="(auth)" />
          </Stack>
        </SessionProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
