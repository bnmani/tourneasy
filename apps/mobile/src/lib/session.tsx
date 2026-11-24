import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

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
  signIn(identifier: string, password: string): Promise<Profile>;
  signUp(input: SignUpInput): Promise<void>;
  deleteAccount(password: string): Promise<void>;
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

type SessionValue = {
  profile: Profile | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => void;
  deleteAccount: (password: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  children,
  api = demoAuth,
}: {
  children: ReactNode;
  api?: AuthApi;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setProfile(await api.signIn(identifier, password));
    },
    [api],
  );

  const signUp = useCallback((input: SignUpInput) => api.signUp(input), [api]);

  const signOut = useCallback(() => setProfile(null), []);

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
    () => ({ profile, signIn, signUp, signOut, deleteAccount, updateProfile }),
    [profile, signIn, signUp, signOut, deleteAccount, updateProfile],
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
