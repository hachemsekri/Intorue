import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Tokens live in the phone's secure storage (Keychain / Keystore).
 * The web preview has no secure storage: it keeps them in memory only (lost on reload).
 */
const memory = new Map<string, string>();

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return memory.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    memory.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Non-secret preferences (language, selected organization). */
export const prefs = { getItem, setItem, removeItem };
