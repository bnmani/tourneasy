import { Tabs } from 'expo-router';

import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const colors = useColors();
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Home') }} />
      <Tabs.Screen name="tournaments" options={{ title: t('Tournaments') }} />
      <Tabs.Screen name="schedule" options={{ title: t('Schedule') }} />
      <Tabs.Screen name="players" options={{ title: t('Players') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profile') }} />
    </Tabs>
  );
}
