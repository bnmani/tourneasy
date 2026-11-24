import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { MenuSheet } from '@/components/MenuSheet';
import { Button, Card, Chip, Field, Hint, IconButton, Row, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { preferredEventOptions } from '@/lib/links';
import { useSession, type Profile } from '@/lib/session';
import { font, useColors } from '@/theme';

type EditField = 'name' | 'email' | 'mobile' | 'events' | null;
type TabName = 'Details' | 'My entries' | 'Followed';

/** Profile. One field is edited at a time; tapping a row opens it in place. */
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
              ? t('Entries come in Phase 2.')
              : t('Followed players come in Phase 3.')}
          </Text>
        ) : (
          <DetailsCard
            profile={profile}
            editing={editing}
            setEditing={setEditing}
            onSave={(patch) => {
              updateProfile(patch);
              setEditing(null);
            }}
          />
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
  onSave: (patch: Partial<Profile>) => void;
}) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.details}>
      <Card>
        {editing === 'name' ? (
          <NameEdit profile={profile} onCancel={() => setEditing(null)} onSave={onSave} />
        ) : (
          <Row
            label={t('Name')}
            value={`${profile.firstName} ${profile.lastName}`}
            onPress={() => setEditing('name')}
          />
        )}
        <Row
          label={t('Date of birth')}
          value={profile.dateOfBirth}
          locked
          hint={t("Set at sign-up and can't be changed")}
        />
        {editing === 'email' ? (
          <EmailEdit profile={profile} onCancel={() => setEditing(null)} onSave={onSave} />
        ) : (
          <Row label={t('Email')} value={profile.email} onPress={() => setEditing('email')} />
        )}
        {editing === 'mobile' ? (
          <MobileEdit profile={profile} onCancel={() => setEditing(null)} onSave={onSave} />
        ) : (
          <Row
            label={t('Mobile number')}
            value={profile.mobile}
            onPress={() => setEditing('mobile')}
          />
        )}
        {editing === 'events' ? (
          <EventsEdit profile={profile} onCancel={() => setEditing(null)} onSave={onSave} />
        ) : (
          <Row
            label={t('Preferred events')}
            value={profile.preferredEvents.map((event) => t(event)).join(', ')}
            onPress={() => setEditing('events')}
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

function NameEdit({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (patch: Partial<Profile>) => void;
}) {
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
          onSave({ firstName: firstName.trim(), prefix: prefix.trim(), lastName: lastName.trim() })
        }
      />
    </EditBlock>
  );
}

function EmailEdit({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (patch: Partial<Profile>) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState(profile.email);
  return (
    <EditBlock>
      <Field
        label={t('Email')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        hint={t('We send a link to check the new address.')}
      />
      <EditActions
        onCancel={onCancel}
        saveDisabled={!/\S+@\S+\.\S+/.test(email)}
        onSave={() => onSave({ email: email.trim() })}
      />
    </EditBlock>
  );
}

function MobileEdit({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (patch: Partial<Profile>) => void;
}) {
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
        onSave={() => onSave({ mobile: mobile.trim() })}
      />
    </EditBlock>
  );
}

function EventsEdit({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (patch: Partial<Profile>) => void;
}) {
  const colors = useColors();
  const t = useT();
  const [events, setEvents] = useState<string[]>(profile.preferredEvents);
  const toggle = (event: string) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  return (
    <EditBlock>
      <Text style={{ fontSize: 13, color: colors.muted }}>{t('Preferred events')}</Text>
      <View style={styles.chips}>
        {preferredEventOptions.map((event) => (
          <Chip
            key={event}
            label={t(event)}
            selected={events.includes(event)}
            onPress={() => toggle(event)}
          />
        ))}
      </View>
      <Hint>{t('Choose one or more.')}</Hint>
      <EditActions
        onCancel={onCancel}
        saveDisabled={events.length === 0}
        onSave={() => onSave({ preferredEvents: events })}
      />
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
  details: { paddingTop: 16, gap: 8 },
  editBlock: { padding: 12, gap: 10, borderBottomWidth: 1 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editAction: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
