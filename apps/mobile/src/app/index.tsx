import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

/**
 * Start: goes straight to Home or Welcome. The logo is the native launch screen (always dark, as
 * iOS draws it before the app can know the chosen theme), which stays up until that first screen
 * has drawn.
 */
export default function Start() {
  const { profile } = useSession();
  return <Redirect href={profile ? '/(app)/(tabs)' : '/welcome'} />;
}
