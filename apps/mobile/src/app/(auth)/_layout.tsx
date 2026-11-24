import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/session';

/** Welcome, sign-in and sign-up. People who are already signed in go to Home. */
export default function AuthLayout() {
  const { profile } = useSession();
  if (profile) {
    return <Redirect href="/(app)/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
