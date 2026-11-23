import { StyleSheet, Text, View } from 'react-native';

import { Body, Heading, Screen } from '@/components/ui';
import { useColors } from '@/theme';

/** Placeholder for tabs that are built in a later phase (SCOPE.md section 8). */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  const colors = useColors();
  return (
    <Screen>
      <View style={styles.container}>
        <Heading>{title}</Heading>
        <Body>This part of the app is built in {phase}.</Body>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Nothing to show yet.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
});
