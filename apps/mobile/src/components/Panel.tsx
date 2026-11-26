import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

/** A bordered box with inner padding, for text content such as tournament cards. */
export function Panel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 4 },
});
