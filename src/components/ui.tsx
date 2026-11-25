import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { ICONS, IconName } from '../lib/icons';
import { useTextScale } from '../lib/prefs';
import { avatarColors, colors, fonts, initialsOf, radius } from '../lib/theme';

export function Icon({ name, color = colors.navy, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'dots' ? (
        [5, 12, 19].map((y) => <Circle key={y} cx={12} cy={y} r={2.2} fill={color} />)
      ) : (
        <Path d={ICONS[name]} fill={color} fillRule={name === 'block' ? 'evenodd' : 'nonzero'} />
      )}
    </Svg>
  );
}

/** Grows fontSize and lineHeight by the Text size setting. */
export function scaleText(style: StyleProp<TextStyle>, k: number, base = 15): TextStyle {
  const s = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontSize = Math.round((s.fontSize ?? base) * k);
  return { ...s, fontSize, ...(s.lineHeight ? { lineHeight: Math.round(s.lineHeight * k) } : {}) };
}

export function T({ style, children, numberOfLines, onPress }: { style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; onPress?: () => void }) {
  const k = useTextScale();
  return (
    <Text maxFontSizeMultiplier={2} onPress={onPress} suppressHighlighting style={scaleText([{ fontFamily: fonts.regular, color: colors.ink, fontSize: 15 }, style], k)} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  color = '#FFFFFF',
  size = 24,
}: {
  name: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={styles.iconBtn}>
      <Icon name={name} color={color} size={size} />
    </Pressable>
  );
}

export function Avatar({ name, size = 44, rounded = 14, uri }: { name: string; size?: number; rounded?: number; uri?: string | null }) {
  if (uri) return <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: rounded, backgroundColor: colors.surface100 }} />;
  const c = avatarColors(name);
  return (
    <View style={{ width: size, height: size, borderRadius: rounded, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.fg, fontFamily: fonts.bold, fontSize: Math.round(size * 0.34) }}>{initialsOf(name)}</Text>
    </View>
  );
}

/** Navy header with rounded bottom corners, as in every mockup. */
export function Header({
  title,
  subtitle,
  onBack,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      {title !== undefined && (
        <View style={styles.headerRow}>
          {onBack && <IconButton name="back" label="Back" onPress={onBack} />}
          <View style={{ flex: 1, paddingLeft: onBack ? 0 : 8 }}>
            <T style={styles.headerTitle}>{title}</T>
            {subtitle ? <T style={styles.headerSub}>{subtitle}</T> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'navy';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? colors.lime : variant === 'navy' ? colors.navy : '#FFFFFF';
  const fg = variant === 'navy' ? '#FFFFFF' : colors.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 2, borderColor: colors.navy },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} color={fg} size={20} />}
          <T style={{ color: fg, fontFamily: fonts.extrabold, fontSize: 16 }}>{title}</T>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T style={styles.label}>{label}</T>
      <ScaledTextInput accessibilityLabel={label} placeholderTextColor="#8A93A8" {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <T style={[styles.label, { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }]}>{children}</T>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({
  left,
  title,
  subtitle,
  right,
  onPress,
  last,
  danger,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && onPress && { backgroundColor: colors.surface100 }]}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontFamily: fonts.bold, color: danger ? colors.danger : colors.ink }}>{title}</T>
        {subtitle ? (
          <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Tile({ name, bg, fg, size = 44 }: { name: IconName; bg: string; fg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} color={fg} size={size * 0.52} />
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.navy, false: colors.line }}
      thumbColor={value ? colors.lime : '#FFFFFF'}
    />
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: colors.navy, borderColor: colors.navy } : null]}
    >
      <T style={{ fontSize: 13, fontFamily: fonts.bold, color: active ? '#FFFFFF' : colors.ink }}>{label}</T>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: colors.navy,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: 8,
    paddingBottom: 14,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { color: '#FFFFFF', fontFamily: fonts.extrabold, fontSize: 20 },
  headerSub: { color: colors.soft, fontSize: 13 },
  button: { height: 54, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 12, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface100,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  card: { marginHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#FFFFFF' },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.surface100 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
});

/** A TextInput that follows the Text size setting. (React 19: ref is passed as a normal prop.) */
export function ScaledTextInput(props: React.ComponentProps<typeof TextInput>) {
  const k = useTextScale();
  return <TextInput maxFontSizeMultiplier={2} {...props} style={scaleText([{ fontFamily: fonts.regular, color: colors.ink, fontSize: 15 }, props.style], k, 15)} />;
}
