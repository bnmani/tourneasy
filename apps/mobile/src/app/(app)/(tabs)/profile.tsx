import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { MenuSheet } from '@/components/MenuSheet';
import { Button, Card, Chip, Field, Hint, IconButton, Row, Screen } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { disciplineOptions, disciplinesFor } from '@/lib/links';
import { useSession, type LevelRef, type Profile } from '@/lib/session';
import { font, useColors } from '@/theme';

type EditField =
  | 'name'
  | 'gender'
  | 'nationality'
  | 'mobile'
  | 'federationId'
  | 'club'
  | 'levelSingles'
  | 'levelDoubles'
  | 'levelMixed'
  | 'disciplines'
  | 'emergency'
  | 'locale'
  | 'publicProfile'
  | null;
type TabName = 'Details' | 'My entries' | 'Followed';

type ClubOption = { id: string; name: string; city: string | null };
type LevelOption = { id: string; code: string };

const genderOptions = [
  { code: 'MALE', label: 'Male' },
  { code: 'FEMALE', label: 'Female' },
] as const;

const languageOptions = [
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'English' },
] as const;

/** Profile. One field is edited at a time; tapping a row opens it in place. Saves go to the website. */
export default function ProfileScreen() {
  const colors = useColors();
  const { profile, signOut, updateProfile } = useSession();
  const t = useT();
  const [tab, setTab] = useState<TabName>('Details');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<EditField>(null);

  if (!profile) {
    return null;
  }

  async function save(patch: Partial<Profile>) {
    try {
      await updateProfile(patch);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Try again in a moment.');
      // Name the rejected fields, so a validation error says what to fix.
      const fields = error instanceof ApiError ? Object.keys(error.fields) : [];
      Alert.alert(
        t('Could not save'),
        fields.length > 0 ? `${message}\n(${fields.join(', ')})` : message,
      );
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.fg }]}>{t('Profile')}</Text>
          <IconButton label={t('Menu')} onPress={() => setMenuOpen(true)}>
            <Text style={[styles.dots, { color: colors.fg }]}>⋯</Text>
          </IconButton>
        </View>

        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.initials, { color: colors.primaryFg }]}>
              {profile.firstName[0] ?? ''}
              {profile.lastName[0] ?? ''}
            </Text>
          </View>
          <View>
            <Text style={[styles.name, { color: colors.fg }]}>
              {profile.firstName} {profile.lastName}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {t('Member {number} · Player', { number: profile.memberNumber })}
            </Text>
          </View>
        </View>

        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(['Details', 'My entries', 'Followed'] as TabName[]).map((name) => {
            const selected = tab === name;
            return (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(name)}
                style={[styles.tab, selected && { borderBottomColor: colors.primary }]}
              >
                <Text style={[styles.tabText, { color: selected ? colors.primary : colors.muted }]}>
                  {t(name)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab !== 'Details' ? (
          <Text style={{ color: colors.muted, fontSize: 15, paddingTop: 16 }}>
            {tab === 'My entries'
              ? t('Your tournament entries will show here soon.')
              : t('Players you follow will show here soon.')}
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <DetailsCard
              profile={profile}
              editing={editing}
              setEditing={setEditing}
              onSave={save}
            />
          </ScrollView>
        )}
      </View>

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('{name} · Member {number}', {
          name: `${profile.firstName} ${profile.lastName}`,
          number: profile.memberNumber,
        })}
        items={[
          { label: 'Settings', onPress: () => router.push('/settings') },
          { label: 'Sign out', onPress: signOut, destructive: true },
        ]}
      />
    </Screen>
  );
}

function DetailsCard({
  profile,
  editing,
  setEditing,
  onSave,
}: {
  profile: Profile;
  editing: EditField;
  setEditing: (field: EditField) => void;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const colors = useColors();
  const t = useT();
  const close = () => setEditing(null);
  const levelLabel = (level: LevelRef) => level?.code ?? t('Unknown');
  const disciplineLabels = profile.preferredDisciplines
    .map((code) => disciplineOptions.find((option) => option.code === code))
    .filter((option) => option !== undefined)
    .map((option) => t(option.label));

  return (
    <View style={styles.details}>
      <Card>
        {editing === 'name' ? (
          <NameEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Name')}
            value={`${profile.firstName} ${profile.lastName}`}
            onPress={() => setEditing('name')}
          />
        )}
        <Row
          label={t('Date of birth')}
          value={displayDate(profile.dateOfBirth)}
          locked
          hint={t("Set at sign-up and can't be changed")}
        />
        {editing === 'gender' ? (
          <GenderEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Gender')}
            value={
              profile.gender
                ? t(genderOptions.find((option) => option.code === profile.gender)?.label ?? '')
                : t('Not set')
            }
            onPress={() => setEditing('gender')}
          />
        )}
        {editing === 'nationality' ? (
          <NationalityEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Nationality (country code)')}
            value={profile.nationality || t('Not set')}
            onPress={() => setEditing('nationality')}
          />
        )}
        <Row
          label={t('Email')}
          value={profile.email}
          locked
          hint={t('Change your email on the website for now.')}
        />
        {editing === 'mobile' ? (
          <MobileEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Mobile number')}
            value={profile.mobile}
            onPress={() => setEditing('mobile')}
          />
        )}
        {editing === 'federationId' ? (
          <FederationEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Badminton Nederland member ID')}
            value={profile.federationId || t('Not set')}
            onPress={() => setEditing('federationId')}
          />
        )}
        {editing === 'club' ? (
          <ClubEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Club')}
            value={profile.club?.name ?? t('No club')}
            onPress={() => setEditing('club')}
          />
        )}
        {editing === 'levelSingles' ? (
          <LevelEdit
            field="levelSingles"
            label={t('Singles level')}
            profile={profile}
            onCancel={close}
            onSave={onSave}
          />
        ) : (
          <Row
            label={t('Singles level')}
            value={levelLabel(profile.levelSingles)}
            onPress={() => setEditing('levelSingles')}
          />
        )}
        {editing === 'levelDoubles' ? (
          <LevelEdit
            field="levelDoubles"
            label={t('Doubles level')}
            profile={profile}
            onCancel={close}
            onSave={onSave}
          />
        ) : (
          <Row
            label={t('Doubles level')}
            value={levelLabel(profile.levelDoubles)}
            onPress={() => setEditing('levelDoubles')}
          />
        )}
        {editing === 'levelMixed' ? (
          <LevelEdit
            field="levelMixed"
            label={t('Mixed level')}
            profile={profile}
            onCancel={close}
            onSave={onSave}
          />
        ) : (
          <Row
            label={t('Mixed level')}
            value={levelLabel(profile.levelMixed)}
            onPress={() => setEditing('levelMixed')}
          />
        )}
        {editing === 'disciplines' ? (
          <DisciplinesEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Preferred disciplines')}
            value={disciplineLabels.join(', ') || t('Not set')}
            onPress={() => setEditing('disciplines')}
          />
        )}
        {editing === 'emergency' ? (
          <EmergencyEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Emergency contact')}
            value={
              profile.emergencyName
                ? `${profile.emergencyName}${profile.emergencyPhone ? ` · ${profile.emergencyPhone}` : ''}`
                : t('Not set')
            }
            onPress={() => setEditing('emergency')}
          />
        )}
        {editing === 'locale' ? (
          <LocaleEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Language for emails')}
            value={profile.locale === 'nl' ? 'Nederlands' : 'English'}
            onPress={() => setEditing('locale')}
          />
        )}
        {editing === 'publicProfile' ? (
          <PublicEdit profile={profile} onCancel={close} onSave={onSave} />
        ) : (
          <Row
            label={t('Show my name and club in public player lists')}
            value={profile.publicProfile ? t('Shown') : t('Hidden')}
            onPress={() => setEditing('publicProfile')}
            last
          />
        )}
      </Card>
      <Text style={{ color: colors.muted, fontSize: 13, paddingHorizontal: 4 }}>
        {t('Tap a field to edit it. Date of birth is locked.')}
      </Text>
    </View>
  );
}

function EditActions({
  onCancel,
  onSave,
  saveDisabled = false,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
}) {
  const t = useT();
  return (
    <View style={styles.editActions}>
      <View style={styles.editAction}>
        <Button title={t('Cancel')} variant="secondary" onPress={onCancel} />
      </View>
      <View style={styles.editAction}>
        <Button title={t('Save')} disabled={saveDisabled} onPress={onSave} />
      </View>
    </View>
  );
}

function EditBlock({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.editBlock, { borderBottomColor: colors.border }]}>{children}</View>;
}

type EditProps = {
  profile: Profile;
  onCancel: () => void;
  onSave: (patch: Partial<Profile>) => Promise<void>;
};

function NameEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [prefix, setPrefix] = useState(profile.prefix);
  const [lastName, setLastName] = useState(profile.lastName);
  return (
    <EditBlock>
      <Field label={t('First name')} value={firstName} onChangeText={setFirstName} />
      <Field
        label={t('Name prefix (optional)')}
        placeholder={t('e.g. van, de')}
        value={prefix}
        onChangeText={setPrefix}
      />
      <Field label={t('Last name')} value={lastName} onChangeText={setLastName} />
      <EditActions
        onCancel={onCancel}
        saveDisabled={!firstName.trim() || !lastName.trim()}
        onSave={() =>
          void onSave({
            firstName: firstName.trim(),
            prefix: prefix.trim(),
            lastName: lastName.trim(),
          })
        }
      />
    </EditBlock>
  );
}

function GenderEdit({ profile, onCancel, onSave }: EditProps) {
  const colors = useColors();
  const t = useT();
  const [gender, setGender] = useState(profile.gender);
  return (
    <EditBlock>
      <Text style={{ fontSize: 13, color: colors.muted }}>{t('Gender')}</Text>
      <View style={styles.chips}>
        {genderOptions.map((option) => (
          <Chip
            key={option.code}
            label={t(option.label)}
            selected={gender === option.code}
            onPress={() => setGender(option.code)}
          />
        ))}
      </View>
      <Hint>{t('Your gender decides which singles and doubles events you can pick.')}</Hint>
      <EditActions
        onCancel={onCancel}
        saveDisabled={!gender}
        onSave={() => {
          // Drop any discipline that doesn't fit the new gender, as the website does.
          const allowed = disciplinesFor(gender).map((option) => option.code as string);
          void onSave({
            gender,
            preferredDisciplines: profile.preferredDisciplines.filter((code) =>
              allowed.includes(code),
            ),
          });
        }}
      />
    </EditBlock>
  );
}

function NationalityEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [nationality, setNationality] = useState(profile.nationality);
  const value = nationality.trim();
  const valid = value === '' || /^[A-Za-z]{2}$/.test(value);
  return (
    <EditBlock>
      <Field
        label={t('Nationality (country code)')}
        autoCapitalize="characters"
        maxLength={2}
        value={nationality}
        onChangeText={setNationality}
        hint={t('For example NL or BE.')}
      />
      <EditActions
        onCancel={onCancel}
        saveDisabled={!valid}
        onSave={() => void onSave({ nationality: value.toUpperCase() })}
      />
    </EditBlock>
  );
}

function MobileEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [mobile, setMobile] = useState(profile.mobile);
  return (
    <EditBlock>
      <Field
        label={t('Mobile number')}
        keyboardType="phone-pad"
        value={mobile}
        onChangeText={setMobile}
        hint={t('Include the country code.')}
      />
      <EditActions
        onCancel={onCancel}
        saveDisabled={mobile.replace(/\D/g, '').length < 8}
        onSave={() => void onSave({ mobile: mobile.trim() })}
      />
    </EditBlock>
  );
}

function FederationEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [federationId, setFederationId] = useState(profile.federationId);
  return (
    <EditBlock>
      <Field
        label={t('Badminton Nederland member ID')}
        value={federationId}
        onChangeText={setFederationId}
      />
      <EditActions
        onCancel={onCancel}
        onSave={() => void onSave({ federationId: federationId.trim() })}
      />
    </EditBlock>
  );
}

function ClubEdit({ profile, onCancel, onSave }: EditProps) {
  const colors = useColors();
  const t = useT();
  const [clubs, setClubs] = useState<ClubOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(profile.club);

  useEffect(() => {
    let active = true;
    apiGet<{ data: ClubOption[] }>('/clubs', { limit: 100 })
      .then((answer) => {
        // Only clubs with an id can be saved. Until the website sends ids, the list stays empty.
        if (active) setClubs(answer.data.filter((club) => Boolean(club.id)));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <EditBlock>
      <Text style={{ fontSize: 13, color: colors.muted }}>{t('Club')}</Text>
      {failed ? <Hint>{t('Clubs could not be loaded.')}</Hint> : null}
      {!clubs && !failed ? <Hint>{t('Loading clubs…')}</Hint> : null}
      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          <Chip label={t('No club')} selected={!selected} onPress={() => setSelected(null)} />
          {(clubs ?? []).map((club) => (
            <Chip
              key={club.id}
              label={club.city ? `${club.name} (${club.city})` : club.name}
              selected={selected?.id === club.id}
              onPress={() => setSelected({ id: club.id, name: club.name })}
            />
          ))}
        </View>
      </ScrollView>
      <EditActions
        onCancel={onCancel}
        saveDisabled={!selected?.id && selected !== null}
        onSave={() => void onSave({ club: selected })}
      />
    </EditBlock>
  );
}

function LevelEdit({
  field,
  label,
  profile,
  onCancel,
  onSave,
}: EditProps & { field: 'levelSingles' | 'levelDoubles' | 'levelMixed'; label: string }) {
  const colors = useColors();
  const t = useT();
  const [levels, setLevels] = useState<LevelOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<LevelRef>(profile[field]);

  useEffect(() => {
    let active = true;
    apiGet<{ data: LevelOption[] }>('/levels')
      .then((answer) => {
        if (active) setLevels(answer.data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <EditBlock>
      <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
      {failed ? <Hint>{t('Levels could not be loaded.')}</Hint> : null}
      {!levels && !failed ? <Hint>{t('Loading levels…')}</Hint> : null}
      <View style={styles.chips}>
        <Chip label={t('Unknown')} selected={!selected} onPress={() => setSelected(null)} />
        {(levels ?? []).map((level) => (
          <Chip
            key={level.id}
            label={level.code}
            selected={selected?.id === level.id}
            onPress={() => setSelected({ id: level.id, code: level.code })}
          />
        ))}
      </View>
      <EditActions
        onCancel={onCancel}
        onSave={() => void onSave({ [field]: selected } as Partial<Profile>)}
      />
    </EditBlock>
  );
}

function DisciplinesEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [codes, setCodes] = useState<string[]>(profile.preferredDisciplines);
  const toggle = (code: string) =>
    setCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  return (
    <EditBlock>
      <View style={styles.chips}>
        {disciplinesFor(profile.gender).map((option) => (
          <Chip
            key={option.code}
            label={t(option.label)}
            selected={codes.includes(option.code)}
            onPress={() => toggle(option.code)}
          />
        ))}
      </View>
      <Hint>{t('Choose one or more.')}</Hint>
      <EditActions
        onCancel={onCancel}
        saveDisabled={codes.length === 0}
        onSave={() => void onSave({ preferredDisciplines: codes })}
      />
    </EditBlock>
  );
}

function EmergencyEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [name, setName] = useState(profile.emergencyName);
  const [phone, setPhone] = useState(profile.emergencyPhone);
  return (
    <EditBlock>
      <Field label={t('Emergency contact name')} value={name} onChangeText={setName} />
      <Field
        label={t('Emergency contact phone')}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <EditActions
        onCancel={onCancel}
        onSave={() => void onSave({ emergencyName: name.trim(), emergencyPhone: phone.trim() })}
      />
    </EditBlock>
  );
}

function LocaleEdit({ profile, onCancel, onSave }: EditProps) {
  const t = useT();
  const [locale, setLocale] = useState<Profile['locale']>(profile.locale);
  return (
    <EditBlock>
      <Text style={{ fontSize: 13 }}>{t('Language for emails')}</Text>
      <View style={styles.chips}>
        {languageOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            selected={locale === option.code}
            onPress={() => setLocale(option.code)}
          />
        ))}
      </View>
      <EditActions onCancel={onCancel} onSave={() => void onSave({ locale })} />
    </EditBlock>
  );
}

function PublicEdit({ profile, onCancel, onSave }: EditProps) {
  const colors = useColors();
  const t = useT();
  const [shown, setShown] = useState(profile.publicProfile);
  return (
    <EditBlock>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: shown }}
        onPress={() => setShown((current) => !current)}
        style={styles.switchRow}
      >
        <Text style={{ flex: 1, color: colors.fg, fontSize: 15 }}>
          {t('Show my name and club in public player lists')}
        </Text>
        <Switch value={shown} onValueChange={setShown} />
      </Pressable>
      <EditActions onCancel={onCancel} onSave={() => void onSave({ publicProfile: shown })} />
    </EditBlock>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 32, fontFamily: font.display },
  dots: { fontSize: 20, fontFamily: font.bold },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 20, fontFamily: font.bold },
  name: { fontSize: 19, fontFamily: font.semibold },
  tabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: 1 },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 15, fontFamily: font.semibold },
  scrollContent: { paddingBottom: 32 },
  details: { paddingTop: 16, gap: 8 },
  editBlock: { padding: 12, gap: 10, borderBottomWidth: 1 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editAction: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { maxHeight: 240 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

/** Shows a YYYY-MM-DD date as DD-MM-YYYY, the format used at sign-up. Other values pass through. */
function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}
