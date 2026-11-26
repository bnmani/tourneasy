import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as SecureStore from 'expo-secure-store';

import { ApiError, apiGet, apiPost, apiSend } from '@/lib/api';

export type Profile = {
  memberNumber: string;
  firstName: string;
  prefix: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  mobile: string;
  preferredEvents: string[];
};

export type SignUpInput = Omit<Profile, 'memberNumber'> & {
  password: string;
  reminders: boolean;
};

/** The account API, as the screens use it. Wired to the website API later (SCOPE.md section 7). */
export interface AuthApi {
  signIn(identifier: string, password: string, code?: string): Promise<Profile>;
  signUp(input: SignUpInput): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  /** Signs back in from a stored login, or returns null when there is none. */
  restore?(): Promise<Profile | null>;
  /** Ends the login on the server and clears it from this phone. */
  signOut?(): Promise<void>;
}

export const demoProfile: Profile = {
  memberNumber: '100245',
  firstName: 'Sam',
  prefix: '',
  lastName: 'Jansen',
  dateOfBirth: '12-03-1998',
  email: 'sam.jansen@example.com',
  mobile: '+31 6 12345678',
  preferredEvents: ['Open singles', 'Open doubles'],
};

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 300));

/** Stand-in until the API client exists. It accepts any non-empty input. */
export const demoAuth: AuthApi = {
  async signIn(identifier, password) {
    await pause();
    if (!identifier.trim() || !password) {
      throw new Error('Enter your email or member number and your password.');
    }
    return demoProfile;
  },
  async signUp() {
    await pause();
  },
  async deleteAccount(password) {
    await pause();
    if (!password) {
      throw new Error('Enter your password to confirm.');
    }
  },
};

type TokenPair = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

type AccountResponse = {
  email: string;
  name: string;
  profile: null | {
    memberNumber: string;
    firstName: string;
    lastNamePrefix: string;
    lastName: string;
    dateOfBirth: string;
    phone: string;
    preferredDisciplines: string[];
  };
};

/** Access token for signed-in requests. Short-lived, so it's renewed from the stored refresh token. */
let accessToken: string | null = null;

const REFRESH_KEY = 'tourneasy.refreshToken';

function toProfile(account: AccountResponse): Profile {
  const p = account.profile!;
  return {
    memberNumber: p.memberNumber,
    firstName: p.firstName,
    prefix: p.lastNamePrefix,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    email: account.email,
    mobile: p.phone,
    preferredEvents: p.preferredDisciplines,
  };
}

/** Trades the stored refresh token for new tokens and loads the account. Null when the login is gone. */
async function renewSession(): Promise<AccountResponse | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const tokens = await apiSend<TokenPair>('POST', '/auth/refresh', { refreshToken });
    if (!tokens) return null;
    accessToken = tokens.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
    return await apiGet<AccountResponse>('/me', undefined, tokens.accessToken);
  } catch {
    // The stored login is no longer valid, so forget it.
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    return null;
  }
}

/** The sign-in token for later signed-in requests, or null when nobody is signed in. */
export function currentAccessToken(): string | null {
  return accessToken;
}

/** Sign-in against the Tourneasy API. Sign-up and account deletion still use the stand-in until they're wired. */
export const apiAuth: AuthApi = {
  async signIn(identifier, password, code) {
    if (!identifier.trim() || !password) {
      throw new Error('Enter your email or member number and your password.');
    }
    let tokens: TokenPair;
    try {
      tokens = await apiPost<TokenPair>('/auth/token', {
        identifier: identifier.trim(),
        password,
        ...(code ? { code } : {}),
        deviceName: 'Tourneasy app',
      });
    } catch (error) {
      // MFA_REQUIRED is handled by the session, which asks for the code.
      if (error instanceof ApiError && error.code === 'MFA_APP_REQUIRED') {
        throw new Error(
          'This account signs in with a passkey only. Add the authenticator app on the website first.',
        );
      }
      throw error;
    }
    const account = await apiGet<AccountResponse>('/me', undefined, tokens.accessToken);
    if (!account.profile) {
      throw new Error('This account has no player profile. The app is for players.');
    }
    accessToken = tokens.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
    const p = account.profile;
    return {
      memberNumber: p.memberNumber,
      firstName: p.firstName,
      prefix: p.lastNamePrefix,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      email: account.email,
      mobile: p.phone,
      preferredEvents: p.preferredDisciplines,
    };
  },
  signUp: demoAuth.signUp,

  async deleteAccount(password) {
    if (!password) {
      throw new Error('Enter your password to confirm.');
    }
    const account = await renewSession();
    if (!account || !accessToken) {
      throw new Error('Sign in again to continue.');
    }
    await apiSend('DELETE', '/me', { password, confirm: true }, accessToken);
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },

  async restore() {
    const account = await renewSession();
    if (!account?.profile) return null;
    return toProfile(account);
  },

  async signOut() {
    const token = accessToken;
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    if (token) {
      await apiSend('POST', '/auth/logout', undefined, token).catch(() => null);
    }
  },
};

type SessionValue = {
  profile: Profile | null;
  /** False until the stored login has been checked on launch. */
  ready: boolean;
  /** 'twoStep' means the account needs its authenticator code: call completeTwoStep next. */
  signIn: (identifier: string, password: string) => Promise<'signedIn' | 'twoStep'>;
  /** True while the app waits for the authenticator or recovery code. */
  pendingTwoStep: boolean;
  completeTwoStep: (code: string) => Promise<void>;
  cancelTwoStep: () => void;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
  deleteAccount: (password: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  children,
  api = apiAuth,
}: {
  children: ReactNode;
  api?: AuthApi;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  // Until the stored login has been checked, the app shows nothing, so nobody is sent to Welcome by mistake.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const restored = api.restore ? api.restore() : Promise.resolve(null);
    restored
      .catch(() => null)
      .then((found) => {
        if (active) {
          setProfile(found);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  // Credentials wait here, in memory only, while the two-step code is entered.
  const [pending, setPending] = useState<{ identifier: string; password: string } | null>(null);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      try {
        setProfile(await api.signIn(identifier, password));
        setPending(null);
        return 'signedIn' as const;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'MFA_REQUIRED') {
          setPending({ identifier: identifier.trim(), password });
          return 'twoStep' as const;
        }
        throw error;
      }
    },
    [api],
  );

  const completeTwoStep = useCallback(
    async (code: string) => {
      if (!pending) {
        throw new Error('Sign in again to continue.');
      }
      setProfile(await api.signIn(pending.identifier, pending.password, code.trim()));
      setPending(null);
    },
    [api, pending],
  );

  const cancelTwoStep = useCallback(() => setPending(null), []);

  const signUp = useCallback((input: SignUpInput) => api.signUp(input), [api]);

  const signOut = useCallback(() => {
    setProfile(null);
    void api.signOut?.();
  }, [api]);

  const deleteAccount = useCallback(
    async (password: string) => {
      await api.deleteAccount(password);
      setProfile(null);
    },
    [api],
  );

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      profile,
      ready,
      signIn,
      pendingTwoStep: pending !== null,
      completeTwoStep,
      cancelTwoStep,
      signUp,
      signOut,
      deleteAccount,
      updateProfile,
    }),
    [profile, ready, pending, signIn, completeTwoStep, cancelTwoStep, signUp, signOut, deleteAccount, updateProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
