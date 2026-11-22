import { StyleSheet, Text, View } from 'react-native';
import { defaultLocale, messages } from '@tourneasy/shared/i18n';

/**
 * Placeholder home screen for Phase 0. The real home comes in Phase 1
 * (sign-in and home, see apps/mobile/SCOPE.md section 8).
 */
export default function HomeScreen() {
  const copy = messages[defaultLocale];
  return (
    <View style={styles.container}>
      <Text style={styles.title} testID="home-title">
        {copy.Metadata.siteName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
});
