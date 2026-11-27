import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Hint } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { PublicPlayer } from '@/lib/me';
import { font, useColors } from '@/theme';

/** A player with initials, club and member number; opens their page. Players tab and Profile. */
export function PlayerRow({ player }: { player: PublicPlayer }) {
  const colors = useColors();
  const t = useT();
  const initials = player.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .filter((c) => c === c.toUpperCase())
    .slice(0, 2)
    .join('');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={player.name}
      onPress={() =>
        router.push({ pathname: '/player/[member]', params: { member: player.memberNumber } })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, boxShadow: colors.liftSmall },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.initials, { color: colors.primaryFg }]}>{initials}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.fg }]}>{player.name}</Text>
        <Hint>
          {[player.club?.name, t('Member {number}', { number: player.memberNumber })]
            .filter(Boolean)
            .join(' · ')}
        </Hint>
      </View>
      <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 15, fontFamily: font.semibold },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontFamily: font.semibold },
  chevron: { fontSize: 22 },
});
