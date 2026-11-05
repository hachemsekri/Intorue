import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { prefs } from './storage';

const TOKEN_KEY = 'winou.pushToken';

export type PushStatus = 'registered' | 'denied' | 'unsupported' | 'needs_build' | 'error';

/** Alerts show as banners even when the app is open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Asks permission and registers this phone's Expo push token with the API.
 * Remote push needs a development or store build with an Expo project ID (EAS); in Expo Go
 * and in the web preview it reports "needs_build" / "unsupported" and the app works without it.
 */
export async function registerForPush(locale: string): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'needs_build';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', {
        name: 'Alertes',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#14B8A6',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/me/push-tokens', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', locale } });
    await prefs.setItem(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'error';
  }
}

export async function unregisterPush() {
  const token = await prefs.getItem(TOKEN_KEY);
  if (!token) return;
  await api('/me/push-tokens/remove', { method: 'POST', body: { token } }).catch(() => {});
  await prefs.removeItem(TOKEN_KEY);
}
