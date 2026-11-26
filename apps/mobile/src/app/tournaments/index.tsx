import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Heading, Screen } from '@/components/ui';
import { TournamentList } from '@/components/TournamentList';
import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

/** Public list of tournaments. Anyone can open it, with or without an account. */
export default function PublicTournamentsScreen() {
  const colors = useColors();
  const t = useT();
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
              {t('Back')}
            </Text>
          </Pressable>
        </View>
        <Heading>{t('Tournaments')}</Heading>
        <TournamentList />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  header: { flexDirection: 'row' },
});
