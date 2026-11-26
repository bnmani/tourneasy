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

/**
 * The approved pill: the screen's own colour, a thin light outline, spaced capitals and a
 * shadow on the left, right and underneath so it floats. Main and secondary buttons look the
 * same; a destructive one has a red outline and text.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const colors = useColors();
  const destructive = variant === 'destructive';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: destructive ? colors.destructive : colors.border,
          boxShadow: pressed && !disabled ? colors.liftPressed : colors.lift,
        },
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, { color: destructive ? colors.destructive : colors.fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function TextLink({
  title,
  onPress,
  center = false,
}: {
  title: string;
  onPress: () => void;
  center?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link} hitSlop={8}>
      <Text style={[styles.linkText, { color: colors.fg }, center && styles.center]}>{title}</Text>
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

/** A floating card: outline and shadow on the outside, contents clipped to the rounded corners. */
export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, boxShadow: colors.liftSmall },
      ]}
    >
      <View style={styles.cardInner}>{children}</View>
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
          ? { backgroundColor: colors.card, borderColor: colors.fg, boxShadow: colors.liftSmall }
          : { backgroundColor: 'transparent', borderColor: colors.inputBorder },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.fg : colors.muted }]}>
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
    <View style={[styles.segmented, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && {
                backgroundColor: colors.card,
                borderColor: colors.border,
                boxShadow: colors.liftSmall,
              },
            ]}
          >
            <Text style={[styles.segmentText, { color: selected ? colors.fg : colors.muted }]}>
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
      style={[
        styles.iconButton,
        { backgroundColor: colors.card, borderColor: colors.border, boxShadow: colors.liftSmall },
      ]}
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
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  buttonPressed: { transform: [{ translateY: 1 }] },
  buttonText: {
    fontSize: 14,
    fontFamily: font.regular,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  center: { textAlign: 'center' },
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
  card: { borderWidth: 1, borderRadius: 16 },
  cardInner: { borderRadius: 15, overflow: 'hidden' },
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
    borderRadius: 999,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
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
