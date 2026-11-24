import { router } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Notification centre arrives in Phase 4. Back navigation is kept so the bell works. */
export default function NotificationsScreen() {
  const t = useT();
  return (
    <Screen>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      <ComingSoon title="Notifications" phase="Phase 4" />
    </Screen>
  );
}
