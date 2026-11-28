import { Screen, Heading } from '@/components/ui';
import { TournamentList } from '@/components/TournamentList';
import { useT } from '@/lib/i18n';
import { StyleSheet, View } from 'react-native';

/** Tournaments tab for signed-in players: the same public list, with the account's tabs around it. */
export default function TournamentsTab() {
  const t = useT();
  return (
    <Screen>
      <View style={styles.container}>
        <Heading>{t('Tournaments')}</Heading>
        <TournamentList />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
});
