import { StyleSheet, Text, View } from 'react-native';

import { Body, Heading, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useColors } from '@/theme';

/** Placeholder for tabs that are built in a later phase (SCOPE.md section 8). */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  const colors = useColors();
  const t = useT();
  return (
    <Screen>
      <View style={styles.container}>
        <Heading>{t(title)}</Heading>
        <Body>{t('This part of the app is built in {phase}.', { phase: t(phase) })}</Body>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{t('Nothing to show yet.')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
});
