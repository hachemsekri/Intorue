import { brand } from '@winou/config';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

export const C = brand.colors;

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
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : s.secondary,
        (disabled || busy) && { opacity: 0.6 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? '#fff' : C.navy} /> : <Text style={[s.buttonText, { color: primary ? '#fff' : C.navy }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#94A0AE"
        style={[s.input, error ? { borderColor: C.danger } : null]}
        {...props}
      />
      {error ? <Text style={{ color: C.danger }}>{error}</Text> : null}
    </View>
  );
}

export function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' }) {
  return (
    <View accessibilityRole="alert" style={[s.notice, { backgroundColor: tone === 'error' ? '#FDECEA' : '#E8EEF7' }]}>
      <Text style={{ color: tone === 'error' ? C.danger : C.navy }}>{text}</Text>
    </View>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  const [a, b] = brand.wordmark;
  return (
    <Text accessibilityLabel={brand.name} style={{ fontSize: size, fontWeight: '800', color: C.navy }}>
      {a}
      <Text style={{ color: C.turquoiseDark }}>{b}</Text>
    </Text>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  h1: { fontSize: 30, fontWeight: '800', color: C.navy },
  h2: { fontSize: 20, fontWeight: '700', color: C.navy },
  muted: { color: C.textMuted },
  label: { color: C.textMuted, fontSize: 14, fontWeight: '500' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: C.navy,
  },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: C.navy },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border },
  buttonText: { fontSize: 17, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  notice: { borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
