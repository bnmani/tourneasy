import type { ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Heading, Row, Screen, Segmented, TextLink } from '@/components/ui';
import { useLocale, useT } from '@/lib/i18n';
import { links } from '@/lib/links';
import { font, useColors, useTheme } from '@/theme';

const languageOptions = [
  { value: 'en' as const, label: 'English' },
  { value: 'nl' as const, label: 'Nederlands' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const t = useT();
  const { preference, setPreference } = useTheme();
  const { locale, setLocale } = useLocale();

  const themeOptions = [
    { value: 'light' as const, label: t('Light') },
    { value: 'dark' as const, label: t('Dark') },
    { value: 'system' as const, label: t('System') },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <TextLink title={t('Back')} onPress={() => router.back()} />
        <Heading>{t('Settings')}</Heading>

        <Section title={t('LANGUAGE')}>
          <Segmented options={languageOptions} value={locale} onChange={setLocale} />
        </Section>

        <Section title={t('THEME')}>
          <Segmented options={themeOptions} value={preference} onChange={setPreference} />
        </Section>

        <Section title={t('SECURITY')}>
          <Card>
            <Row
              label={t('App lock')}
              value={t('Off. Use Face ID, fingerprint or passcode')}
              onPress={() => Alert.alert(t('Coming soon'), t('App lock arrives in a later update.'))}
              last
            />
          </Card>
        </Section>

        <Section title={t('PRIVACY')}>
          <Card>
            <Row
              label={t('Notification settings')}
              onPress={() => Alert.alert(t('Coming soon'), t('Notification settings arrive in Phase 4.'))}
            />
            <Row
              label={t('Download my data')}
              onPress={() => Alert.alert(t('Coming soon'), t('Data download arrives in a later update.'))}
              last
            />
          </Card>
        </Section>

        <Section title={t('LEGAL')}>
          <Card>
            <Row label={t('Terms of use')} onPress={() => Linking.openURL(links.terms)} />
            <Row label={t('Privacy policy')} onPress={() => Linking.openURL(links.privacy)} last />
          </Card>
        </Section>

        <View style={styles.danger}>
          <Button title={t('Delete account')} variant="destructive" onPress={() => router.push('/delete-account')} />
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
  sectionTitle: { fontSize: 13, fontFamily: font.semibold, letterSpacing: 0.5 },
  danger: { marginTop: 8 },
});
