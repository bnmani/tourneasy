import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { useUmpire } from '@/lib/umpire-session';

/**
 * The session token for API calls, plus `toSignIn` for a 401. Without a session the screen goes
 * to sign-in. Taps saved on the phone stay saved when the umpire signs in again.
 */
export function useUmpireAuth() {
  const { session, ready, signOut } = useUmpire();

  useEffect(() => {
    if (ready && !session) router.replace('/umpire/sign-in');
  }, [ready, session]);

  const toSignIn = useCallback(() => {
    void signOut();
    router.replace('/umpire/sign-in');
  }, [signOut]);

  return { token: session?.token ?? null, toSignIn };
}
