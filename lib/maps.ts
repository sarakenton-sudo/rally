import { Platform, Linking, ActionSheetIOS, Alert } from 'react-native';
import { getPref, setPref } from '@/lib/prefs';

// Directions to a lesson/venue address. The family picks Apple Maps or Google
// Maps once; we remember it. On the web it's always Google Maps.

export type MapsApp = 'apple' | 'google';
const PREF_KEY = 'rally.mapsApp';

export function mapsLinks(address: string) {
  const q = encodeURIComponent(address.trim());
  return {
    apple: `maps://?daddr=${q}`,
    googleApp: `comgooglemaps://?daddr=${q}&directionsmode=driving`,
    googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}

async function openWith(app: MapsApp, address: string) {
  const l = mapsLinks(address);
  if (app === 'apple') return Linking.openURL(l.apple);
  // Google Maps app if installed, else the web version (which may hand off to the app).
  const hasApp = Platform.OS === 'ios' ? await Linking.canOpenURL(l.googleApp).catch(() => false) : false;
  return Linking.openURL(hasApp ? l.googleApp : l.googleWeb);
}

function ask(): Promise<MapsApp | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Get directions with', options: ['Apple Maps', 'Google Maps', 'Cancel'], cancelButtonIndex: 2 },
        (i) => resolve(i === 0 ? 'apple' : i === 1 ? 'google' : null),
      );
    } else {
      Alert.alert('Get directions with', undefined, [
        { text: 'Google Maps', onPress: () => resolve('google') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

/**
 * Open directions to `address`. iPhone: asks Apple vs Google the first time (or
 * every time with `forceAsk`), then remembers. Web/Android: Google Maps.
 */
export async function openDirections(address: string, opts: { forceAsk?: boolean } = {}) {
  if (!address?.trim()) return;
  if (Platform.OS !== 'ios') return openWith('google', address);
  let app = opts.forceAsk ? null : ((await getPref(PREF_KEY)) as MapsApp | null);
  if (app !== 'apple' && app !== 'google') {
    app = await ask();
    if (!app) return;
    await setPref(PREF_KEY, app);
  }
  return openWith(app, address);
}
