import { brand, type ThemeTokens } from '@winou/config';
import type { LiveStatus } from '@winou/shared';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

export { useTheme };

/** Status colours from the theme; the status is always written out too. */
export const statusColor = (T: ThemeTokens): Record<LiveStatus, string> => ({
  moving: T.moving,
  stopped: T.stopped,
  offline: T.offline,
  never: T.sub,
  no_device: T.sub,
});

/** Styles built from the current theme (memoized per theme). */
export function useStyles() {
  const { T } = useTheme();
  return useMemo(() => makeStyles(T), [T]);
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { T } = useTheme();
  const s = useStyles();
  const primary = variant === 'primary';
  const fg = primary ? T.onacc : T.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.button, primary ? s.primary : s.secondary, (disabled || busy) && { opacity: 0.6 }, pressed && { opacity: 0.85 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** Pill filter / choice, as in the web app (ink when chosen). */
export function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { T } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ paddingHorizontal: 15, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: on ? T.ink : T.surf2 }}
    >
      <Text style={{ color: on ? T.bg : T.ink, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { T } = useTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={T.sub} style={[s.input, error ? { borderColor: T.danger } : null]} {...props} />
      {error ? <Text style={{ color: T.danger }}>{error}</Text> : null}
    </View>
  );
}

export function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  const s = useStyles();
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' }) {
  const { T } = useTheme();
  const s = useStyles();
  return (
    <View accessibilityRole="alert" style={[s.notice, { backgroundColor: tone === 'error' ? T.dangerbg : T.infobg }]}>
      <Text style={{ color: tone === 'error' ? T.danger : T.ink }}>{text}</Text>
    </View>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  const { T } = useTheme();
  const [a, b] = brand.wordmark;
  return (
    <Text accessibilityLabel={brand.name} style={{ fontSize: size, fontWeight: '900', color: T.ink, letterSpacing: -1 }}>
      {a}
      <Text style={{ color: T.acctxt }}>{b}</Text>
    </Text>
  );
}

function makeStyles(T: ThemeTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    h1: { fontSize: 32, fontWeight: '800', color: T.ink, letterSpacing: -0.8 },
    h2: { fontSize: 20, fontWeight: '800', color: T.ink, letterSpacing: -0.4 },
    big: { fontSize: 30, fontWeight: '800', color: T.ink, letterSpacing: -0.8 },
    muted: { color: T.sub },
    label: { color: T.ink, fontSize: 14, fontWeight: '600' },
    input: {
      minHeight: 48,
      borderWidth: 2,
      borderColor: 'transparent',
      borderRadius: 12,
      paddingHorizontal: 13,
      fontSize: 16,
      backgroundColor: T.surf2,
      color: T.ink,
    },
    button: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    primary: { backgroundColor: T.acc },
    secondary: { backgroundColor: T.surf2 },
    buttonText: { fontSize: 16, fontWeight: '800' },
    badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' },
    card: { backgroundColor: T.surf, borderRadius: 20, padding: 16 },
    notice: { borderRadius: 16, padding: 12 },
    row: { flexDirection: 'row', alignItems: 'center' },
    plaque: { backgroundColor: T.plaque, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center' },
  });
}
