import { useEffect } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { PUSH_TOKEN_KEY, REMINDERS_OFF_KEY, signedIn, useSession } from '@/lib/session';

/** Set once the app has asked for permission, so it never asks on its own again. */
const ASKED_KEY = 'tourneasy.pushAsked';

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushState = 'on' | 'off' | 'blocked';

/** Whether this phone can get pushes: on, not asked yet / off, or turned off in iOS Settings. */
export async function pushState(): Promise<PushState> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return (await SecureStore.getItemAsync(PUSH_TOKEN_KEY)) ? 'on' : 'off';
  return status === 'denied' ? 'blocked' : 'off';
}

/** Registers this phone's token with my account. Safe to call again; the website keeps one row. */
async function register(): Promise<boolean> {
  const { data } = await Notifications.getDevicePushTokenAsync();
  if (typeof data !== 'string' || !data) return false;
  await signedIn('POST', '/me/push-devices', { token: data, platform: 'ios' });
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, data);
  return true;
}

/**
 * Turns push on: asks iOS for permission if needed, then registers. Returns the new state;
 * 'blocked' means the player must allow it in iOS Settings (we open them).
 */
export async function enablePush(): Promise<PushState> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') {
    await SecureStore.setItemAsync(ASKED_KEY, '1');
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status === 'denied') {
    await Linking.openSettings();
    return 'blocked';
  }
  if (status !== 'granted') return 'off';
  return (await register()) ? 'on' : 'off';
}

/** Turns push off for this phone: the website forgets the token. */
export async function disablePush(): Promise<void> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (token) await signedIn('DELETE', `/me/push-devices/${token}`).catch(() => null);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

/** Opens what a notification points to, e.g. a tournament's live schedule. */
function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
}

/**
 * Lives in the root layout. After sign-in it registers the phone (asking for permission once,
 * the first time), keeps the token fresh, and opens the right screen when a notification is
 * tapped, also when that tap started the app.
 */
export function PushSetup() {
  const { profile } = useSession();
  const signedInAs = profile?.memberNumber ?? null;

  // A new account that unticked "remind me" at sign-up: switch reminders off now.
  const email = profile?.email.toLowerCase() ?? null;
  useEffect(() => {
    if (!email) return;
    void (async () => {
      if ((await SecureStore.getItemAsync(REMINDERS_OFF_KEY)) !== email) return;
      await signedIn('PATCH', '/me/notification-preferences', {
        TOURNAMENT_REMINDER: false,
        push: { MATCH_SCHEDULED: false },
      }).catch(() => null);
      await SecureStore.deleteItemAsync(REMINDERS_OFF_KEY);
    })();
  }, [email]);

  useEffect(() => {
    if (!signedInAs) return;
    void (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          // Unless the player turned push off in the app, keep this phone registered.
          if ((await SecureStore.getItemAsync(ASKED_KEY)) !== 'off') await register();
        } else if (status === 'undetermined' && !(await SecureStore.getItemAsync(ASKED_KEY))) {
          await enablePush();
        }
      } catch {
        // No network or no APNs on this device (simulator): try again next launch.
      }
    })();
  }, [signedInAs]);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(openFrom);
    const subscription = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => subscription.remove();
  }, []);

  return null;
}

/** Remembers that the player switched push off in the app, so sign-in doesn't turn it back on. */
export async function rememberPushOff(off: boolean): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, off ? 'off' : '1');
}
