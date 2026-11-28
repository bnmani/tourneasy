import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiPost } from '@/lib/api';
import { getDeviceId } from '@/lib/device';

export type UmpireSession = { token: string; umpireId: string; expiresAt: string };

// The session token is kept in AsyncStorage only: never in a URL, a log or a route parameter.
const KEY = 'umpire-session';

type SignInResponse = { umpireId: string; sessionToken: string; expiresAt: string };

type UmpireValue = {
  session: UmpireSession | null;
  /** False until the stored session has been read. */
  ready: boolean;
  signInWithPin: (pin: string) => Promise<void>;
  /** The QR token goes into the request body and nowhere else. */
  signInWithQr: (qrToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const UmpireContext = createContext<UmpireValue | null>(null);

function usable(value: unknown): value is UmpireSession {
  const s = value as Partial<UmpireSession> | null;
  return (
    !!s &&
    typeof s.token === 'string' &&
    typeof s.umpireId === 'string' &&
    typeof s.expiresAt === 'string' &&
    new Date(s.expiresAt).getTime() > Date.now()
  );
}

export function UmpireSessionProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** A ready-made session, for tests. */
  initial?: UmpireSession;
}) {
  const [session, setSession] = useState<UmpireSession | null>(initial ?? null);
  const [ready, setReady] = useState(initial !== undefined);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (!cancelled && usable(parsed)) setSession(parsed);
      } catch {
        // An unreadable stored session means signing in again.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const finishSignIn = useCallback(async (body: Record<string, string>) => {
    const deviceId = await getDeviceId();
    const result = await apiPost<SignInResponse>('/api/v1/umpire/sign-in', { ...body, deviceId });
    const next: UmpireSession = {
      token: result.sessionToken,
      umpireId: result.umpireId,
      expiresAt: result.expiresAt,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signInWithPin = useCallback((pin: string) => finishSignIn({ pin }), [finishSignIn]);
  const signInWithQr = useCallback((qrToken: string) => finishSignIn({ qrToken }), [finishSignIn]);

  const signOut = useCallback(async () => {
    setSession(null);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // Nothing to do: the in-memory session is already gone.
    }
  }, []);

  const value = useMemo<UmpireValue>(
    () => ({ session, ready, signInWithPin, signInWithQr, signOut }),
    [session, ready, signInWithPin, signInWithQr, signOut],
  );
  return <UmpireContext.Provider value={value}>{children}</UmpireContext.Provider>;
}

export function useUmpire(): UmpireValue {
  const value = useContext(UmpireContext);
  if (!value) throw new Error('useUmpire must be used inside UmpireSessionProvider');
  return value;
}
