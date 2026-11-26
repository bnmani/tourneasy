import { StyleSheet, Text, View } from 'react-native';

import { Body, Heading, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

/** Placeholder for a part of the app that isn't ready yet. `message` says what will be here. */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  const colors = useColors();
  const t = useT();
  return (
    <Screen>
      <View style={styles.container}>
        <Heading>{t(title)}</Heading>
        <Body>{t(message)}</Body>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{t('Coming in an update soon.')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
});
