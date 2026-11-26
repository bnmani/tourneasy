import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, useColors } from '@/theme';

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      {content}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.heading, { color: colors.fg }]}>{children}</Text>;
}

export function Body({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return <Text style={[styles.body, { color: muted ? colors.muted : colors.fg }]}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.hint, { color: colors.muted }]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

// Colours for buttons and links placed on the brand teal (the welcome screen), in either theme.
const ON_DARK = { text: '#f3fafb', muted: '#afdde5', teal: '#11464c' } as const;

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  onDark = false,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** True on the brand teal background, where theme colours would be dark on dark. */
  onDark?: boolean;
}) {
  const colors = useColors();
  const tone = onDark
    ? variant === 'primary'
      ? { backgroundColor: ON_DARK.text, borderColor: ON_DARK.text, color: ON_DARK.teal }
      : { backgroundColor: 'transparent', borderColor: ON_DARK.muted, color: ON_DARK.text }
    : variant === 'primary'
      ? { backgroundColor: colors.primary, borderColor: colors.primary, color: colors.primaryFg }
      : variant === 'destructive'
        ? {
            backgroundColor: 'transparent',
            borderColor: colors.destructive,
            color: colors.destructive,
          }
        : { backgroundColor: 'transparent', borderColor: colors.border, color: colors.primary };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: tone.color }]}>{title}</Text>
    </Pressable>
  );
}

export function TextLink({
  title,
  onPress,
  onDark = false,
}: {
  title: string;
  onPress: () => void;
  /** True on the brand teal background. */
  onDark?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link} hitSlop={8}>
      <Text style={[styles.linkText, { color: onDark ? ON_DARK.muted : colors.primary }]}>
        {title}
      </Text>
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; hint?: string };

export function Field({ label, hint, ...input }: FieldProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.fg }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          { backgroundColor: colors.card, borderColor: colors.inputBorder, color: colors.fg },
        ]}
        {...input}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

export function Row({
  label,
  value,
  onPress,
  locked = false,
  hint,
  last = false,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  locked?: boolean;
  hint?: string;
  last?: boolean;
}) {
  const colors = useColors();
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
        {value ? <Text style={[styles.rowValue, { color: colors.fg }]}>{value}</Text> : null}
        {hint ? <Hint>{hint}</Hint> : null}
      </View>
      {!locked && onPress ? <Text style={[styles.chevron, { color: colors.muted }]}>›</Text> : null}
    </>
  );
  const divider = last
    ? undefined
    : { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border };
  if (!onPress || locked) {
    return <View style={[styles.row, divider]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: 'transparent', borderColor: colors.inputBorder },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.primaryFg : colors.fg }]}>
        {selected ? `${label} ✓` : label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.segmentText, { color: selected ? colors.primaryFg : colors.fg }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {children}
    </Pressable>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  const colors = useColors();
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${fraction * 100}%`, backgroundColor: colors.primary },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, gap: 18 },
  heading: { fontSize: 32, fontFamily: font.display },
  body: { fontSize: 16, lineHeight: 24 },
  hint: { fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 17, fontFamily: font.semibold },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 15, fontFamily: font.semibold },
  field: { gap: 6 },
  label: { fontSize: 15, fontFamily: font.medium },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: {
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 16 },
  chevron: { fontSize: 22, marginLeft: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontFamily: font.semibold },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segment: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 15, fontFamily: font.semibold },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4 },
});
