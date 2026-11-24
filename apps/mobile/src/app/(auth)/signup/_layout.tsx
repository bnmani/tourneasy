import { Stack } from 'expo-router';

import { SignUpDraftProvider } from '@/lib/signup';

export default function SignUpLayout() {
  return (
    <SignUpDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SignUpDraftProvider>
  );
}
