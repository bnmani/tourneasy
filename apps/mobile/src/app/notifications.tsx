import { router } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { Screen, TextLink } from '@/components/ui';

/** Notification centre arrives in Phase 4. Back navigation is kept so the bell works. */
export default function NotificationsScreen() {
  return (
    <Screen>
      <TextLink title="Back" onPress={() => router.back()} />
      <ComingSoon title="Notifications" phase="Phase 4" />
    </Screen>
  );
}
