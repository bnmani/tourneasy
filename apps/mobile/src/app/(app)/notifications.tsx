import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { Card, Heading, Hint, Screen, TextLink } from '@/components/ui';
import { dateLocaleTag, useLocale, useT } from '@/lib/i18n';
import { fetchInbox, markRead, type InboxItem } from '@/lib/notifications';
import { pickLocale } from '@/lib/tournaments';
import { font, useColors } from '@/theme';

/**
 * My notifications: every push the website sent me, newest first. Opening the list marks them
 * read on the website (the bell's count goes); the dots stay until I leave, so I can see which
 * ones are new. Tapping one opens what it is about.
 */
export default function NotificationsScreen() {
  const colors = useColors();
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchInbox()
        .then((inbox) => {
          if (!active) return;
          setItems(inbox.items);
          setFailed(false);
          if (inbox.unread > 0) void markRead().catch(() => null);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const when = (iso: string) =>
    new Date(iso).toLocaleString(dateLocaleTag(locale), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Screen scroll>
      <TextLink title={t('Back')} onPress={() => router.back()} />
      <Heading>{t('Notifications')}</Heading>
      {failed ? <Hint>{t('Your notifications could not be loaded.')}</Hint> : null}
      {!items && !failed ? <Hint>{t('Loading…')}</Hint> : null}
      {items && items.length === 0 ? (
        <Hint>
          {t(
            'Nothing yet. When your schedule is out, your match goes on court or a player you follow plays, it shows here.',
          )}
        </Hint>
      ) : null}
      {(items ?? []).map((item) => {
        const title = pickLocale(item.title, locale) ?? '';
        return (
          <Card key={item.id}>
            <Pressable
              testID={`notification-${item.id}`}
              accessibilityRole={item.url ? 'button' : 'text'}
              accessibilityLabel={item.read ? title : `${t('New')}: ${title}`}
              disabled={!item.url}
              onPress={() => item.url && router.push(item.url as Href)}
              style={styles.row}
            >
              <View
                style={[styles.dot, { backgroundColor: item.read ? 'transparent' : colors.fg }]}
              />
              <View style={styles.text}>
                <Text style={[styles.title, { color: colors.fg }]}>{title}</Text>
                <Text style={[styles.body, { color: colors.fg }]}>
                  {pickLocale(item.body, locale)}
                </Text>
                <Text style={[styles.time, { color: colors.muted }]}>{when(item.createdAt)}</Text>
              </View>
            </Pressable>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, padding: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontFamily: font.semibold },
  body: { fontSize: 15, lineHeight: 21 },
  time: { fontSize: 13, marginTop: 2 },
});
