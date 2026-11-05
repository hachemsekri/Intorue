import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {Button, Field, Notice, Wordmark, statusColor, useStyles, useTheme} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function Login() {
  const { T } = useTheme();
  const s = useStyles();
  const { t, tx } = useI18n();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? tx(`errors.${e.code}`, t('errors.generic')) : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Wordmark size={34} />
          <View>
            <Text style={s.h1} accessibilityRole="header">
              {t('auth.signInTitle')}
            </Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{t('auth.signInSubtitle')}</Text>
          </View>
          {error && <Notice tone="error" text={error} />}
          <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
          <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
          <Button title={t('auth.signIn')} onPress={submit} busy={busy} disabled={!email || !password} />
          <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>{t('mobile.server', { url: API_URL })}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
