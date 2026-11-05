import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from '@/components/ui';
import { I18nProvider } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';

function Gate() {
  const { status } = useSession();
  const segments = useSegments();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
        <ActivityIndicator color={C.navy} />
      </View>
    );
  }
  const onLogin = segments[0] === 'login';
  if (status === 'signedOut' && !onLogin) return <Redirect href="/login" />;
  if (status === 'signedIn' && onLogin) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="vehicle/[id]" options={{ headerShown: true, headerTitle: '', headerTintColor: C.navy }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Gate />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
