import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {statusColor, useStyles, useTheme} from '@/components/ui';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import { SessionProvider, useSession } from '@/lib/session';

function Gate() {
  const { T } = useTheme();
  const s = useStyles();
  const { status } = useSession();
  const segments = useSegments();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.ink} />
      </View>
    );
  }
  const onLogin = segments[0] === 'login';
  if (status === 'signedOut' && !onLogin) return <Redirect href="/login" />;
  if (status === 'signedIn' && onLogin) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="vehicle/[id]" options={{ headerShown: true, headerTitle: '', headerTintColor: T.ink, headerStyle: { backgroundColor: T.bg } }} />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { name } = useTheme();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <SessionProvider>
            <ThemedStatusBar />
            <Gate />
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
