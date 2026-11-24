import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/session';

/** Screens for signed-in people. Signed-out visitors go to Welcome. */
export default function AppLayout() {
  const { profile } = useSession();
  if (!profile) {
    return <Redirect href="/welcome" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
