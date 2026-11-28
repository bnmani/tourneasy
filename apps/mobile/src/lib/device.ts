import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const KEY = 'device-id';
let creating: Promise<string> | null = null;

/** The id of this phone: generated once, then read from storage. It is not a secret. */
export function getDeviceId(): Promise<string> {
  if (creating) return creating;
  creating = (async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY);
      if (stored) return stored;
      const fresh = randomUUID();
      await AsyncStorage.setItem(KEY, fresh);
      return fresh;
    } finally {
      creating = null;
    }
  })();
  return creating;
}
