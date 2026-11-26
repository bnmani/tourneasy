import { useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Heading, Row, Screen, Segmented, TextLink } from '@/components/ui';
import { useAppLock } from '@/lib/app-lock';
import { useLocale, useT } from '@/lib/i18n';
import { shareMyData } from '@/lib/me';
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

  const lock = useAppLock();
  const [exporting, setExporting] = useState(false);

  async function downloadData() {
    if (exporting) return;
    setExporting(true);
    try {
      await shareMyData();
    } catch (caught) {
      Alert.alert(
        t('Download my data'),
        caught instanceof Error ? t(caught.message) : t('Something went wrong. Try again.'),
      );
    } finally {
      setExporting(false);
    }
  }

  async function toggleLock(on: boolean) {
    if (!on) {
      await lock.disable();
      return;
    }
    const problem = await lock.enable(t('Turn on app lock'));
    if (problem) {
      Alert.alert(t('App lock'), t(problem));
    }
  }

  const themeOptions = [
    { value: 'light' as const, label: t('Light') },
    { value: 'dark' as const, label: t('Dark') },
    { value: 'system' as const, label: t('System') },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchTitle, { color: colors.fg }]}>{t('App lock')}</Text>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                  {t('Ask for Face ID, Touch ID or your passcode when the app opens.')}
                </Text>
              </View>
              <Switch
                accessibilityLabel={t('App lock')}
                value={lock.enabled}
                onValueChange={(on) => void toggleLock(on)}
                trackColor={{ true: colors.primary, false: colors.border }}
                ios_backgroundColor={colors.border}
              />
            </View>
          </Card>
        </Section>

        <Section title={t('PRIVACY')}>
          <Card>
            <Row
              label={t('Notification settings')}
              onPress={() => router.push('/notification-settings')}
            />
            <Row
              label={t('Download my data')}
              hint={exporting ? t('Preparing your file…') : undefined}
              onPress={() => void downloadData()}
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
          <Button
            title={t('Delete account')}
            variant="destructive"
            onPress={() => router.push('/delete-account')}
          />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 16, fontFamily: font.medium },
});
