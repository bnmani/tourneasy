import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useT, type TranslateFn } from '@/lib/i18n';
import { courtName, type ScheduleMatch } from '@/lib/schedule';
import { font, useColors, type Colors } from '@/theme';

/** Red dot on the Live pill. Fixed so it reads on the pill in both themes. */
const LIVE_DOT = '#d64533';

/**
 * One match, scoreboard style. The court sits in a tile on the left. Next to it are the category
 * and round, with the time below, and the status on the right. Under that, each side has a row:
 * the players stacked, then one column per game, with each game's winning score in bold. `mine`
 * gives it a coloured edge. `subtitle` goes after the time, e.g. the tournament name.
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
  const decided = !!match.winnerEntryId;
  const aWon = decided && match.winnerEntryId === match.aEntryId;
  const bWon = decided && match.winnerEntryId === match.bEntryId;

  const body = (
    <>
      <View style={styles.top}>
        <CourtTile court={court} colors={colors} t={t} />
        <View style={styles.info}>
          <Text style={[styles.event, { color: colors.fg }]}>
            {[match.event, match.round].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[styles.time, { color: colors.muted }]}>
            {[time, subtitle].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <StatusBadge match={match} colors={colors} t={t} />
      </View>
      <Side
        names={match.a}
        games={match.sets.map((s) => [s.scoreA, s.scoreB])}
        won={aWon}
        dim={decided && !aWon}
        colors={colors}
      />
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <Side
        names={match.b}
        games={match.sets.map((s) => [s.scoreB, s.scoreA])}
        won={bWon}
        dim={decided && !bWon}
        colors={colors}
      />
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

/** "COURT" over the court's number, or a dash when no court is set yet. */
function CourtTile({ court, colors, t }: { court: string | null; colors: Colors; t: TranslateFn }) {
  const long = !!court && court.length > 3;
  return (
    <View
      style={[styles.tile, { borderColor: colors.primary }]}
      accessible
      accessibilityLabel={court ? t('Court {court}', { court }) : t('Time to follow')}
    >
      <Text style={[styles.tileLabel, { color: colors.muted }]}>{t('Court')}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          long ? styles.tileName : styles.tileNumber,
          { color: court ? colors.fg : colors.muted },
        ]}
      >
        {court ?? '–'}
      </Text>
    </View>
  );
}

/** Live as a filled pill with a red dot, finished states outlined, otherwise a new/changed tag. */
function StatusBadge({
  match,
  colors,
  t,
}: {
  match: ScheduleMatch;
  colors: Colors;
  t: TranslateFn;
}) {
  const label = statusLabel(match.status, t);
  if (match.status === 'IN_PROGRESS' || match.status === 'CALLED') {
    return (
      <View style={[styles.badge, styles.livePill, { backgroundColor: colors.fg }]}>
        {match.status === 'IN_PROGRESS' ? <View style={styles.dot} /> : null}
        <Text style={[styles.badgeText, { color: colors.bg }]}>{label}</Text>
      </View>
    );
  }
  if (label) {
    return (
      <View style={[styles.badge, { borderColor: colors.primary }]}>
        <Text style={[styles.badgeText, { color: colors.primary }]}>{label}</Text>
      </View>
    );
  }
  if (match.changed) {
    return (
      <View style={[styles.badge, { borderColor: colors.border }]}>
        <Text style={[styles.badgeText, { color: colors.muted }]}>
          {match.changed === 'new' ? t('New') : t('Changed')}
        </Text>
      </View>
    );
  }
  return null;
}

/** One side: the players stacked, then a column per game. */
function Side({
  names,
  games,
  won,
  dim,
  colors,
}: {
  names: string;
  games: [number, number][];
  won: boolean;
  dim: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.side}>
      <View style={styles.names}>
        {names.split(' / ').map((name, i) => (
          <Text
            key={i}
            style={[styles.name, { color: colors.fg }, won && styles.bold, dim && styles.dimName]}
          >
            {name}
          </Text>
        ))}
      </View>
      {games.map(([own, other], i) => (
        <Text
          key={i}
          style={[
            styles.game,
            { color: colors.fg },
            own > other ? styles.bold : styles.dimGame,
          ]}
        >
          {own}
        </Text>
      ))}
    </View>
  );
}

export function statusLabel(status: ScheduleMatch['status'], t: TranslateFn): string | null {
  switch (status) {
    case 'CALLED':
      return t('Called');
    case 'IN_PROGRESS':
      return t('Live');
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
  card: { paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  mine: { borderLeftWidth: 4, borderRadius: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    minWidth: 52,
    maxWidth: 96,
    height: 46,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileLabel: { fontSize: 9, fontFamily: font.semibold, letterSpacing: 0.8, textTransform: 'uppercase' },
  tileNumber: { fontSize: 20, lineHeight: 22, fontFamily: font.bold },
  tileName: { fontSize: 13, lineHeight: 16, fontFamily: font.bold },
  info: { flex: 1, minWidth: 0, gap: 3 },
  event: { fontSize: 14, lineHeight: 18, fontFamily: font.semibold },
  time: { fontSize: 13, lineHeight: 17, fontFamily: font.medium },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  livePill: { paddingLeft: 7, paddingRight: 9 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE_DOT },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: font.bold },
  side: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 20, fontFamily: font.medium },
  dimName: { opacity: 0.72 },
  game: {
    width: 30,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: font.medium,
    fontVariant: ['tabular-nums'],
  },
  rule: { height: StyleSheet.hairlineWidth },
  bold: { fontFamily: font.bold },
  dimGame: { opacity: 0.55 },
});
