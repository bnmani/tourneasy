import { useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Heading, Row, Screen, Segmented, TextLink } from '@/components/ui';
import { links } from '@/lib/links';
import { useColors, useTheme, type ThemePreference } from '@/theme';

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const languageOptions = [
  { value: 'en' as const, label: 'English' },
  { value: 'nl' as const, label: 'Nederlands' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { preference, setPreference } = useTheme();
  // Language stays on this screen until the translations are wired (SCOPE.md section 2).
  const [language, setLanguage] = useState<'en' | 'nl'>('en');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <TextLink title="Back" onPress={() => router.back()} />
        <Heading>Settings</Heading>

        <Section title="LANGUAGE">
          <Segmented options={languageOptions} value={language} onChange={setLanguage} />
        </Section>

        <Section title="THEME">
          <Segmented options={themeOptions} value={preference} onChange={setPreference} />
        </Section>

        <Section title="SECURITY">
          <Card>
            <Row
              label="App lock"
              value="Off. Use Face ID, fingerprint or passcode"
              onPress={() => Alert.alert('Coming soon', 'App lock arrives in a later update.')}
              last
            />
          </Card>
        </Section>

        <Section title="PRIVACY">
          <Card>
            <Row
              label="Notification settings"
              onPress={() => Alert.alert('Coming soon', 'Notification settings arrive in Phase 4.')}
            />
            <Row
              label="Download my data"
              onPress={() => Alert.alert('Coming soon', 'Data download arrives in a later update.')}
              last
            />
          </Card>
        </Section>

        <Section title="LEGAL">
          <Card>
            <Row label="Terms of use" onPress={() => Linking.openURL(links.terms)} />
            <Row label="Privacy policy" onPress={() => Linking.openURL(links.privacy)} last />
          </Card>
        </Section>

        <View style={styles.danger}>
          <Button title="Delete account" variant="destructive" onPress={() => router.push('/delete-account')} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>Tourneasy</Text>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  danger: { marginTop: 8 },
});
