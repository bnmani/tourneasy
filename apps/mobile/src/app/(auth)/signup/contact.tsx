import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field, Heading, ProgressBar, Screen, TextLink } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useLocale, useT } from '@/lib/i18n';
import { passwordMinLength } from '@/lib/links';
import { useSession } from '@/lib/session';
import { ageFromIsoDate, isoFromDisplayDate, MINOR_AGE, useSignUpDraft } from '@/lib/signup';
import { font, useColors } from '@/theme';

/** Sign-up step 2 of 2: contact details, password and consent. */
export default function SignUpContactScreen() {
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const { stepOne } = useSignUpDraft();
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [terms, setTerms] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [guardianName, setGuardianName] = useState('');
  const [parentalConsent, setParentalConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Players under 16 need a parent or guardian, as on the website.
  const isoDate = isoFromDisplayDate(stepOne.dateOfBirth);
  const minor = isoDate !== null && ageFromIsoDate(isoDate) < MINOR_AGE;

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const digits = mobile.replace(/\D/g, '');
  const mobileOk = /^[+\d\s().-]+$/.test(mobile) && digits.length >= 8 && digits.length <= 15;
  const passwordOk = password.length >= passwordMinLength && password === repeat;
  const guardianOk = !minor || (guardianName.trim() !== '' && parentalConsent);
  const canSubmit = emailOk && mobileOk && passwordOk && terms && guardianOk && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signUp({
        ...stepOne,
        email,
        mobile,
        password,
        reminders,
        locale,
        guardianName: minor ? guardianName.trim() : undefined,
        parentalConsent: minor ? parentalConsent : undefined,
      });
      router.push({ pathname: '/verify-email', params: { email } });
    } catch (caught) {
      const message = caught instanceof Error ? t(caught.message) : t('Sign-up failed. Try again.');
      setError(message);
      // The keyboard can hide the message under the button, so show it as a pop-up too.
      if (caught instanceof ApiError && caught.code === 'EMAIL_TAKEN') {
        Alert.alert(t('You already have an account'), message, [
          { text: t('Sign in'), onPress: () => router.replace('/signin') },
          { text: t('Reset password'), onPress: () => router.push('/forgot-password') },
          { text: t('Cancel'), style: 'cancel' },
        ]);
      } else {
        Alert.alert(t('Sign-up failed'), message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <TextLink title={t('Back')} onPress={() => router.back()} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>{t('Step 2 of 2')}</Text>
        </View>
        <ProgressBar fraction={1} />
        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Heading>{t('How do we reach you?')}</Heading>
          <Field
            label={t('Email')}
            placeholder={t('name@example.com')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            hint={t('We send a link to check this address.')}
          />
          <Field
            label={t('Mobile number')}
            placeholder={t('+31 6 12345678')}
            keyboardType="phone-pad"
            value={mobile}
            onChangeText={setMobile}
            hint={t(
              'So organisers can reach you on the tournament day. Include the country code, or start with 0 for Dutch numbers.',
            )}
          />
          <Field
            label={t('Password')}
            placeholder={t('At least {min} characters', { min: passwordMinLength })}
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            hint={t('A short sentence works well.')}
          />
          <Field
            label={t('Repeat password')}
            secureTextEntry
            autoComplete="new-password"
            value={repeat}
            onChangeText={setRepeat}
          />
          <Consent checked={terms} onChange={setTerms}>
            {t('I accept the terms of use and privacy notice.')}
          </Consent>
          {minor ? (
            <>
              <Field
                label={t('Parent or guardian name')}
                value={guardianName}
                onChangeText={setGuardianName}
                hint={t('Players under {age} need a parent or guardian to confirm the account.', {
                  age: MINOR_AGE,
                })}
              />
              <Consent checked={parentalConsent} onChange={setParentalConsent}>
                {t('My parent or guardian agrees to this account.')}
              </Consent>
            </>
          ) : null}
          <Consent checked={reminders} onChange={setReminders}>
            {t(
              'Remind me about my matches. You can switch this off anytime in Notification settings.',
            )}
          </Consent>
          {error ? <Text style={{ color: colors.destructive, fontSize: 14 }}>{error}</Text> : null}
        </ScrollView>
        <Button
          title={busy ? t('Creating account…') : t('Create account')}
          disabled={!canSubmit}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}

function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={children}
      onPress={() => onChange(!checked)}
      style={[styles.consent, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: colors.primary,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked ? (
          <Text style={{ color: colors.primaryFg, fontSize: 14, fontFamily: font.bold }}>✓</Text>
        ) : null}
      </View>
      <Text style={[styles.consentText, { color: colors.fg }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fields: { flex: 1 },
  fieldsContent: { gap: 14, paddingBottom: 8 },
  consent: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
