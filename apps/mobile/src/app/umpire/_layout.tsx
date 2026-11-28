import { Stack } from 'expo-router';

import { UmpireSessionProvider } from '@/lib/umpire-session';

export default function UmpireLayout() {
  return (
    <UmpireSessionProvider>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
    </UmpireSessionProvider>
  );
}
