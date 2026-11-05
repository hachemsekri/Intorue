/**
 * Where the phone finds the platform. On a real phone "localhost" is the phone itself, so set
 * these to your computer's address on the Wi-Fi network in apps/mobile/.env, for example:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
 *   EXPO_PUBLIC_WEB_URL=http://192.168.1.20:3000
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const WS_URL = API_URL.replace(/^http/, 'ws');
