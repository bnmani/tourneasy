import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { MenuSheet } from '@/components/MenuSheet';
import { Card, Hint, IconButton, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { font, useColors } from '@/theme';

/** Home. The match and tournament cards use demo data until the schedule API exists (Phase 2). */
export default function HomeScreen() {
  const colors = useColors();
  const { profile, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text style={[styles.date, { color: colors.muted }]}>{today}</Text>
          <Text style={[styles.hello, { color: colors.fg }]}>Hello, {profile?.firstName ?? 'there'}</Text>
        </View>
        <View style={styles.headerButtons}>
          <IconButton label="Notifications, 2 unread" onPress={() => router.push('/notifications')}>
            <Text style={[styles.badge, { color: colors.fg }]}>2</Text>
          </IconButton>
          <IconButton label="Menu" onPress={() => setMenuOpen(true)}>
            <Text style={[styles.dots, { color: colors.fg }]}>⋯</Text>
          </IconButton>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.hero }]}>
        <Text style={[styles.heroLabel, { color: colors.heroMuted }]}>YOUR NEXT MATCH</Text>
        <Text style={[styles.heroTitle, { color: colors.heroFg }]}>Open Doubles vs. J. de Boer / R. Smit</Text>
        <Text style={[styles.heroMeta, { color: colors.heroMuted }]}>Today 14:30 · Court 4 · Starts in 2 h 10 min</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.fg }]}>Live today</Text>
        <Card>
          <View style={styles.liveRow}>
            <View style={styles.liveText}>
              <Text style={[styles.liveName, { color: colors.fg }]}>Winter Open 2026</Text>
              <Hint>Hall A · 3 matches on court</Hint>
            </View>
            <Text style={[styles.live, { color: colors.primary }]}>LIVE</Text>
          </View>
        </Card>
      </View>

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={profile ? `${profile.firstName} ${profile.lastName} · Member ${profile.memberNumber}` : 'Menu'}
        items={[
          { label: 'Settings', onPress: () => router.push('/settings') },
          { label: 'Sign out', onPress: signOut, destructive: true },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { flex: 1, gap: 2 },
  date: { fontSize: 14 },
  hello: { fontSize: 32, fontFamily: font.display },
  headerButtons: { flexDirection: 'row', gap: 8 },
  badge: { fontSize: 15, fontFamily: font.semibold },
  dots: { fontSize: 20, fontFamily: font.bold },
  hero: { borderRadius: 18, padding: 18, gap: 8 },
  heroLabel: { fontSize: 13, fontFamily: font.semibold, letterSpacing: 0.5 },
  heroTitle: { fontSize: 22, fontFamily: font.display },
  heroMeta: { fontSize: 15 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontFamily: font.semibold },
  liveRow: { padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveText: { gap: 2 },
  liveName: { fontSize: 16, fontFamily: font.semibold },
  live: { fontSize: 13, fontFamily: font.semibold },
});
