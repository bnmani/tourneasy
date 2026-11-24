import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Chip, Field, Heading, ProgressBar, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { preferredEventOptions } from '@/lib/links';
import { useSignUpDraft } from '@/lib/signup';
import { font, useColors } from '@/theme';

const genders = ['Female', 'Male', 'Other'];

/** Sign-up step 1 of 2: name, date of birth, gender and preferred events. */
export default function SignUpNameScreen() {
  const colors = useColors();
  const t = useT();
  const { stepOne, setStepOne } = useSignUpDraft();
  const [firstName, setFirstName] = useState(stepOne.firstName);
  const [prefix, setPrefix] = useState(stepOne.prefix);
  const [lastName, setLastName] = useState(stepOne.lastName);
  const [dateOfBirth, setDateOfBirth] = useState(stepOne.dateOfBirth);
  const [gender, setGender] = useState(stepOne.gender);
  const [events, setEvents] = useState<string[]>(stepOne.preferredEvents);

  const canContinue =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    dateOfBirth.trim() !== '' &&
    events.length > 0;

  function toggleEvent(event: string) {
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  }

  function pickGender() {
    Alert.alert(t('Gender'), undefined, [
      ...genders.map((option) => ({ text: t(option), onPress: () => setGender(option) })),
      { text: t('Cancel'), style: 'cancel' as const },
    ]);
  }

  function next() {
    setStepOne({ firstName, prefix, lastName, dateOfBirth, gender, preferredEvents: events });
    router.push('/signup/contact');
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <TextLink title={t('Back')} onPress={() => router.back()} />
          <Text style={{ color: colors.muted, fontSize: 14 }}>{t('Step 1 of 2')}</Text>
        </View>
        <ProgressBar fraction={0.5} />
        <ScrollView style={styles.fields} contentContainerStyle={styles.fieldsContent}>
          <Heading>{t('Create your account')}</Heading>
          <Field
            label={t('First name')}
            placeholder={t('As on your membership card')}
            value={firstName}
            onChangeText={setFirstName}
          />
          <Field
            label={t('Name prefix (optional)')}
            placeholder={t('e.g. van, de')}
            value={prefix}
            onChangeText={setPrefix}
          />
          <Field label={t('Last name')} value={lastName} onChangeText={setLastName} />
          <Field
            label={t('Date of birth')}
            placeholder={t('DD-MM-YYYY')}
            keyboardType="numbers-and-punctuation"
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            hint={t('Players under 16 need a parent or guardian to confirm the account.')}
          />
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.fg }]}>{t('Gender')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Gender, {value}', { value: gender ? t(gender) : t('Choose') })}
              onPress={pickGender}
              style={[
                styles.select,
                { backgroundColor: colors.card, borderColor: colors.inputBorder },
              ]}
            >
              <Text style={{ color: gender ? colors.fg : colors.muted, fontSize: 16 }}>
                {gender ? t(gender) : t('Choose')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
            </Pressable>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.fg }]}>{t('Preferred events')}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{t('Pick at least one.')}</Text>
            <View style={styles.chips}>
              {preferredEventOptions.map((event) => (
                <Chip
                  key={event}
                  label={t(event)}
                  selected={events.includes(event)}
                  onPress={() => toggleEvent(event)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
        <Button title={t('Continue')} disabled={!canContinue} onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 18 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fields: { flex: 1 },
  fieldsContent: { gap: 14, paddingBottom: 8 },
  field: { gap: 6 },
  label: { fontSize: 15, fontFamily: font.medium },
  select: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
