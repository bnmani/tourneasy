import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Heading, Hint, Screen } from '@/components/ui';
import { Panel } from '@/components/Panel';
import { dateLocaleTag, useLocale, useT } from '@/lib/i18n';
import { fetchTournament, formatFee, type TournamentDetail } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

/** Public tournament page: date, venue, fees, categories and organiser contact. */
export default function TournamentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const tag = dateLocaleTag(locale);

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchTournament(slug)
      .then((data) => active && setTournament(data))
      .catch(() => {
        if (active) setError(t('This tournament could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [slug, t]);

  const dayFormat = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Screen scroll>
      <View style={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{t('Back')}</Text>
        </Pressable>

        {error ? <Hint>{error}</Hint> : null}
        {!tournament && !error ? <Body>{t('Loading…')}</Body> : null}

        {tournament ? (
          <>
            <Heading>{tournament.name}</Heading>
            <Text style={{ color: colors.muted, fontSize: 15 }}>
              {tournament.startsOn === tournament.endsOn
                ? dayFormat.format(new Date(`${tournament.startsOn}T12:00:00`))
                : `${dayFormat.format(new Date(`${tournament.startsOn}T12:00:00`))} – ${dayFormat.format(new Date(`${tournament.endsOn}T12:00:00`))}`}
            </Text>

            {tournament.venue ? (
              <Panel>
                <Text style={[styles.section, { color: colors.fg }]}>{t('Venue')}</Text>
                <Text style={{ color: colors.fg, fontSize: 15 }}>{tournament.venue.name}</Text>
                {tournament.venue.street ? (
                  <Text style={{ color: colors.muted, fontSize: 14 }}>
                    {[tournament.venue.street, tournament.venue.houseNumber].filter(Boolean).join(' ')}
                  </Text>
                ) : null}
                {tournament.venue.city ? (
                  <Text style={{ color: colors.muted, fontSize: 14 }}>{tournament.venue.city}</Text>
                ) : null}
              </Panel>
            ) : null}

            {tournament.description ? <Body>{tournament.description}</Body> : null}

            {tournament.events.length > 0 ? (
              <Panel>
                <Text style={[styles.section, { color: colors.fg }]}>{t('Categories')}</Text>
                {tournament.events.map((event) => (
                  <View key={event.id} style={styles.row}>
                    <Text style={{ color: colors.fg, fontSize: 15, flex: 1 }}>
                      {event.name ?? event.discipline}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14 }}>
                      {formatFee(event.feeCents, event.feeCents, locale === 'nl' ? 'nl-NL' : 'en-GB')}
                    </Text>
                  </View>
                ))}
              </Panel>
            ) : null}

            {tournament.contact.email || tournament.contact.phone || tournament.contact.name ? (
              <Panel>
                <Text style={[styles.section, { color: colors.fg }]}>{t('Organiser')}</Text>
                {tournament.contact.name ? (
                  <Text style={{ color: colors.fg, fontSize: 15 }}>{tournament.contact.name}</Text>
                ) : null}
                {tournament.contact.email ? (
                  <Text selectable style={{ color: colors.primary, fontSize: 15 }}>
                    {tournament.contact.email}
                  </Text>
                ) : null}
                {tournament.contact.phone ? (
                  <Text selectable style={{ color: colors.primary, fontSize: 15 }}>
                    {tournament.contact.phone}
                  </Text>
                ) : null}
              </Panel>
            ) : null}

            <Hint>{t('Entering a tournament is done on the Tourneasy website for now.')}</Hint>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  section: { fontSize: 14, fontFamily: font.semibold, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
});
