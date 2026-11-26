import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

// SF Symbols: outline when not selected, filled when selected, like the iOS system apps.
function tabIcon(name: SFSymbol, filled: SFSymbol) {
  function TabIcon({
    color,
    focused,
    size,
  }: {
    color: ColorValue;
    focused: boolean;
    size: number;
  }) {
    return <SymbolView name={focused ? filled : name} tintColor={color} size={size} />;
  }
  return TabIcon;
}

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
      <Tabs.Screen
        name="index"
        options={{ title: t('Home'), tabBarIcon: tabIcon('house', 'house.fill') }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{ title: t('Tournaments'), tabBarIcon: tabIcon('trophy', 'trophy.fill') }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: t('Schedule'), tabBarIcon: tabIcon('calendar', 'calendar') }}
      />
      <Tabs.Screen
        name="players"
        options={{ title: t('Players'), tabBarIcon: tabIcon('person.2', 'person.2.fill') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('Profile'),
          tabBarIcon: tabIcon('person.crop.circle', 'person.crop.circle.fill'),
        }}
      />
    </Tabs>
  );
}
