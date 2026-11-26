import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { demoAuth, demoProfile, SessionProvider, useSession } from '@/lib/session';

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider api={demoAuth}>{children}</SessionProvider>;
}

describe('session', () => {
  it('starts signed out', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.profile).toBeNull();
  });

  it('signs in with any non-empty details and signs out again', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.signIn('sam@example.com', 'secret'));
    expect(result.current.profile).toEqual(demoProfile);

    act(() => result.current.signOut());
    expect(result.current.profile).toBeNull();
  });

  it('refuses sign-in without a password', async () => {
    await expect(demoAuth.signIn('sam@example.com', '')).rejects.toThrow('Enter your email');
  });

  it('merges profile edits into the signed-in profile', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.signIn('sam@example.com', 'secret'));
    act(() => result.current.updateProfile({ mobile: '+31 6 99999999' }));
    expect(result.current.profile?.mobile).toBe('+31 6 99999999');
    expect(result.current.profile?.firstName).toBe('Sam');
  });
});
