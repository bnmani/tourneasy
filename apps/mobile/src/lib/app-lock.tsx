import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { font, useColors } from '@/theme';

const LOCK_KEY = 'tourneasy.appLock';

type AppLockValue = {
  enabled: boolean;
  /** Turns the lock on after a successful Face ID check. Returns an error message, or null. */
  enable(promptMessage: string): Promise<string | null>;
  disable(): Promise<void>;
};

const AppLockContext = createContext<AppLockValue>({
  enabled: false,
  enable: async () => null,
  disable: async () => {},
});

export function useAppLock(): AppLockValue {
  return useContext(AppLockContext);
}

/**
 * App lock: when on, the app asks for Face ID, Touch ID or the phone's passcode on start and
 * every time it comes back from the background. Stored on this phone only.
 */
export function AppLockProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const colors = useColors();
  const { profile } = useSession();
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const prompting = useRef(false);

  useEffect(() => {
    SecureStore.getItemAsync(LOCK_KEY)
      .catch(() => null)
      .then((value) => {
        setEnabled(value === '1');
        setLocked(value === '1');
        setChecked(true);
      });
  }, []);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('Unlock Tourneasy'),
      });
      if (result.success) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, [t]);

  // Lock again when the app goes to the background. The Face ID sheet itself makes the app
  // "inactive", not "background", so asking doesn't lock it again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && enabled) setLocked(true);
    });
    return () => subscription.remove();
  }, [enabled]);

  const active = enabled && locked && !!profile;

  // Ask straight away when the lock shows, and again each time the app returns from the
  // background. Closing the Face ID sheet only goes inactive → active, so Cancel doesn't
  // reopen it in a loop; the Unlock button asks again.
  useEffect(() => {
    if (!active) return;
    if (AppState.currentState === 'active') void unlock();
    let wasInBackground = AppState.currentState === 'background';
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') wasInBackground = true;
      if (state === 'active' && wasInBackground) {
        wasInBackground = false;
        void unlock();
      }
    });
    return () => subscription.remove();
  }, [active, unlock]);

  const enable = useCallback(async (promptMessage: string) => {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) {
      return 'Set up Face ID, Touch ID or a passcode in your phone’s Settings first.';
    }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    if (!result.success) {
      return result.error === 'user_cancel' || result.error === 'system_cancel'
        ? null
        : 'App lock could not be turned on. Try again.';
    }
    await SecureStore.setItemAsync(LOCK_KEY, '1');
    setEnabled(true);
    return null;
  }, []);

  const disable = useCallback(async () => {
    await SecureStore.deleteItemAsync(LOCK_KEY);
    setEnabled(false);
    setLocked(false);
  }, []);

  const value = useMemo(() => ({ enabled, enable, disable }), [enabled, enable, disable]);

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {/* Hide everything until the stored setting is read, so nothing shows before the lock. */}
      {!checked || active ? (
        <View style={[styles.cover, { backgroundColor: colors.bg }]}>
          {active ? (
            <>
              <StatusBar style={colors.dark ? 'light' : 'dark'} />
              <Image
                accessibilityLabel={t('Tourneasy logo')}
                source={require('../../assets/brand/logo-transparent.png')}
                style={[styles.logo, !colors.dark && { tintColor: colors.fg }]}
                resizeMode="contain"
              />
              <Text style={[styles.title, { color: colors.fg }]}>{t('Tourneasy is locked')}</Text>
              <View style={styles.button}>
                <Button title={t('Unlock')} onPress={() => void unlock()} />
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  logo: { width: 220, height: 147 },
  title: { fontSize: 22, fontFamily: font.display },
  button: { alignSelf: 'stretch', marginTop: 24 },
});
