import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Chip, Field, Heading, ProgressBar, Screen, TextLink } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { disciplinesFor } from '@/lib/links';
import { isoFromDisplayDate, useSignUpDraft } from '@/lib/signup';
import { font, useColors } from '@/theme';

const genders = [
  { code: 'MALE', label: 'Male' },
  { code: 'FEMALE', label: 'Female' },
];

function genderLabel(code: string): string {
  return genders.find((option) => option.code === code)?.label ?? code;
}

/** Sign-up step 1 of 2: name, date of birth, gender and preferred disciplines. */
export default function SignUpNameScreen() {
  const colors = useColors();
  const t = useT();
  const { stepOne, setStepOne } = useSignUpDraft();
  const [firstName, setFirstName] = useState(stepOne.firstName);
  const [prefix, setPrefix] = useState(stepOne.prefix);
  const [lastName, setLastName] = useState(stepOne.lastName);
  const [dateOfBirth, setDateOfBirth] = useState(stepOne.dateOfBirth);
  const [gender, setGender] = useState(stepOne.gender);
  const [disciplines, setDisciplines] = useState<string[]>(stepOne.preferredDisciplines);

  const canContinue =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    isoFromDisplayDate(dateOfBirth) !== null &&
    disciplines.length > 0;

  function toggleDiscipline(code: string) {
    setDisciplines((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function pickGender() {
    Alert.alert(t('Gender'), undefined, [
      ...genders.map((option) => ({
        text: t(option.label),
        onPress: () => {
          setGender(option.code);
          // Drop any discipline that doesn't fit the new gender.
          const allowed = disciplinesFor(option.code).map((d) => d.code as string);
          setDisciplines((current) => current.filter((code) => allowed.includes(code)));
        },
      })),
      { text: t('Cancel'), style: 'cancel' as const },
    ]);
  }

  function next() {
    setStepOne({
      firstName,
      prefix,
      lastName,
      dateOfBirth,
      gender,
      preferredDisciplines: disciplines,
    });
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
        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Heading>{t('Create your account')}</Heading>
          <Field label={t('First name')} value={firstName} onChangeText={setFirstName} />
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
              accessibilityLabel={t('Gender, {value}', {
                value: gender ? t(genderLabel(gender)) : t('Choose'),
              })}
              onPress={pickGender}
              style={[
                styles.select,
                { backgroundColor: colors.card, borderColor: colors.inputBorder },
              ]}
            >
              <Text style={{ color: gender ? colors.fg : colors.muted, fontSize: 16 }}>
                {gender ? t(genderLabel(gender)) : t('Choose')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
            </Pressable>
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.fg }]}>{t('Preferred disciplines')}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{t('Pick at least one.')}</Text>
            <View style={styles.chips}>
              {disciplinesFor(gender).map((option) => (
                <Chip
                  key={option.code}
                  label={t(option.label)}
                  selected={disciplines.includes(option.code)}
                  onPress={() => toggleDiscipline(option.code)}
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
