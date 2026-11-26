import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Hint } from '@/components/ui';
import { useT, type TranslateFn } from '@/lib/i18n';
import { courtName, type ScheduleMatch } from '@/lib/schedule';
import { font, useColors } from '@/theme';

/**
 * One match: time and court, both sides (the winner in bold), the score, and the category and
 * round. `mine` gives it a coloured edge; `subtitle` adds a last line, e.g. the tournament name.
 */
export function MatchCard({
  match,
  dateTag,
  mine = false,
  subtitle,
  showDate = false,
  onPress,
}: {
  match: ScheduleMatch;
  dateTag: string;
  mine?: boolean;
  subtitle?: string;
  /** Show the day too, for lists that aren't grouped by day. */
  showDate?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const time = match.startsAt
    ? new Date(match.startsAt).toLocaleString(dateTag, {
        ...(showDate ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
        hour: '2-digit',
        minute: '2-digit',
      })
    : t('Time to follow');
  const court = courtName(match.court);
  const score = match.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join('  ');
  const aWon = !!match.winnerEntryId && match.winnerEntryId === match.aEntryId;
  const bWon = !!match.winnerEntryId && match.winnerEntryId === match.bEntryId;
  const status = statusLabel(match.status, t);
  const live = match.status === 'IN_PROGRESS' || match.status === 'CALLED';
  const body = (
    <>
      <View style={styles.top}>
        <Text style={[styles.time, { color: colors.primary }]}>
          {time}
          {court ? ` · ${t('Court {court}', { court })}` : ''}
        </Text>
        {status ? (
          <Text
            style={[
              styles.badge,
              live
                ? {
                    color: colors.primaryFg,
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  }
                : { color: colors.primary, borderColor: colors.primary },
            ]}
          >
            {status}
          </Text>
        ) : match.changed ? (
          <Text style={[styles.badge, { color: colors.muted, borderColor: colors.border }]}>
            {match.changed === 'new' ? t('New') : t('Changed')}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.side, { color: colors.fg }, aWon && styles.winner]}>{match.a}</Text>
      <Text style={[styles.side, { color: colors.fg }, bWon && styles.winner]}>{match.b}</Text>
      {score ? <Text style={[styles.score, { color: colors.fg }]}>{score}</Text> : null}
      <Hint>{[match.event, match.round, subtitle].filter(Boolean).join(' · ')}</Hint>
    </>
  );
  return (
    <View style={mine ? [styles.mine, { borderLeftColor: colors.primary }] : undefined}>
      <Card>
        {onPress ? (
          <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
            {body}
          </Pressable>
        ) : (
          <View style={styles.card}>{body}</View>
        )}
      </Card>
    </View>
  );
}

export function statusLabel(status: ScheduleMatch['status'], t: TranslateFn): string | null {
  switch (status) {
    case 'CALLED':
      return t('Called');
    case 'IN_PROGRESS':
      return t('On court');
    case 'COMPLETED':
      return t('Played');
    case 'WALKOVER':
      return t('Walkover');
    case 'RETIRED':
      return t('Retired');
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 4 },
  mine: { borderLeftWidth: 4, borderRadius: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 14, fontFamily: font.semibold },
  badge: {
    fontSize: 12,
    fontFamily: font.semibold,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  side: { fontSize: 16, fontFamily: font.medium },
  winner: { fontFamily: font.bold },
  score: { fontSize: 15, fontFamily: font.semibold },
});
