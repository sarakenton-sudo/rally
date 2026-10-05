import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Tiny per-device preferences (e.g. a dismissed prompt). Never for secrets
// or shared data. Failures are ignored: a pref is a convenience.
export async function getPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

export async function setPref(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch { /* ignore */ }
}
