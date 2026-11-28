import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { font } from '@/theme';

/** Umpire palette from the approved mock-ups: slate with beige labels (dark), beige with brown (light). */
export type Palette = {
  bg: string;
  fg: string;
  accent: string;
  border: string;
  buttonBg: string;
  buttonFg: string;
  danger: string;
  shadow: string;
};

const dark: Palette = {
  bg: '#293541',
  fg: '#edeae3',
  accent: '#beb196',
  border: 'rgba(190,177,150,0.5)',
  buttonBg: '#293541',
  buttonFg: '#edeae3',
  danger: '#f0a293',
  shadow: '#000000',
};

const light: Palette = {
  bg: '#edeae3',
  fg: '#293541',
  accent: '#594235',
  border: 'rgba(41,53,65,0.45)',
  buttonBg: '#edeae3',
  buttonFg: '#293541',
  danger: '#a3402e',
  shadow: '#293541',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

const lift = (p: Palette): ViewStyle => ({
  shadowColor: p.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 3,
});

export function UScreen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const p = usePalette();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: p.bg }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function UHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  const p = usePalette();
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: p.accent }]}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={[styles.title, { color: p.fg }]}>
        {title}
      </Text>
      {sub ? <Text style={[styles.sub, { color: p.accent }]}>{sub}</Text> : null}
    </View>
  );
}

export function UText({
  children,
  size = 15,
  muted = false,
  bold = false,
  center = false,
}: {
  children: ReactNode;
  size?: number;
  muted?: boolean;
  bold?: boolean;
  center?: boolean;
}) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: Math.round(size * 1.35),
        color: muted ? p.accent : p.fg,
        fontFamily: bold ? font.bold : font.regular,
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </Text>
  );
}

export function UCard({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.card,
        lift(p),
        { borderColor: strong ? p.accent : p.border, borderWidth: strong ? 2 : 1 },
      ]}
    >
      {children}
    </View>
  );
}

export function CourtBadge({ number }: { number: number }) {
  const p = usePalette();
  const t = useT();
  return (
    <View style={[styles.badge, { borderColor: p.accent }]}>
      <Text style={[styles.badgeLabel, { color: p.accent }]}>{t('Court')}</Text>
      <Text style={[styles.badgeNumber, { color: p.fg }]}>{number}</Text>
    </View>
  );
}

export function UPill({ label, tone = 'solid' }: { label: string; tone?: 'solid' | 'outline' }) {
  const p = usePalette();
  return (
    <View
      style={[
        styles.pill,
        tone === 'solid'
          ? { backgroundColor: p.fg }
          : { borderColor: p.accent, borderWidth: 1, backgroundColor: 'transparent' },
      ]}
    >
      <Text style={[styles.pillText, { color: tone === 'solid' ? p.bg : p.accent }]}>{label}</Text>
    </View>
  );
}

export function UButton({
  title,
  onPress,
  disabled = false,
  variant = 'pill',
  small = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'pill' | 'text';
  small?: boolean;
  busy?: boolean;
}) {
  const p = usePalette();
  const off = disabled || busy;
  if (variant === 'text') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={onPress}
        style={[styles.textButton, off && styles.dim]}
      >
        <Text style={{ color: p.accent, fontSize: 15, fontFamily: font.medium }}>{title}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillButton,
        small && styles.pillButtonSmall,
        lift(p),
        { backgroundColor: p.buttonBg, borderColor: p.border },
        off && styles.dim,
        pressed && !off && styles.pressed,
      ]}
    >
      <Text
        style={[styles.pillButtonText, small && styles.pillButtonTextSmall, { color: p.buttonFg }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** A notice strip: offline, blocked, rejected and similar messages. */
export function UNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  const p = usePalette();
  return (
    <View style={[styles.notice, { borderColor: tone === 'warn' ? p.danger : p.accent }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16, gap: 14, flexGrow: 1 },
  header: { gap: 4, paddingHorizontal: 4 },
  eyebrow: { fontSize: 17, fontFamily: font.semibold },
  title: { fontSize: 26, fontFamily: font.display },
  sub: { fontSize: 14, lineHeight: 19, fontFamily: font.regular },
  card: { borderRadius: 16, padding: 14, gap: 10 },
  badge: {
    width: 52,
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 9,
    fontFamily: font.semibold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  badgeNumber: { fontSize: 20, fontFamily: font.bold },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontFamily: font.bold },
  pillButton: {
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pillButtonSmall: { minHeight: 36, paddingHorizontal: 12 },
  pillButtonText: {
    fontSize: 13,
    fontFamily: font.medium,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  pillButtonTextSmall: { fontSize: 11, letterSpacing: 1.5 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
});
