import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/theme';

export type MenuItem = { label: string; onPress: () => void; destructive?: boolean };

/** Bottom sheet for secondary actions, used from Home and Profile so those screens stay clean. */
export function MenuSheet({
  visible,
  onClose,
  title,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: MenuItem[];
}) {
  const colors = useColors();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityLabel="Close menu" />
      <View accessibilityRole="menu" style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.muted }]}>{title}</Text>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={[styles.item, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[
                styles.itemText,
                { color: item.destructive ? colors.destructive : colors.fg, fontWeight: item.destructive ? '600' : '400' },
              ]}
            >
              {item.label}
            </Text>
            {item.destructive ? null : <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>}
          </Pressable>
        ))}
        <View style={styles.close}>
          <Button title="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 13, paddingVertical: 6, paddingHorizontal: 4 },
  item: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  itemText: { fontSize: 16 },
  chevron: { fontSize: 22 },
  close: { marginTop: 12 },
});
