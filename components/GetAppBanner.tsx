import { useState } from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_STORE_URL } from '@/lib/fan';
import { CORAL } from '@/lib/colors';
import { track } from '@/lib/track-event';

const KEY = 'rally.getAppDismissed';
const MESSAGES = {
  parent: 'Get alerts on game day and your team code one tap away.',
  coach: 'Get booking requests and lesson reminders as they happen.',
  fan: 'Get a heads-up on game day and when the stream goes live.',
} as const;

/**
 * Web only: a slim bar that sends everyone on the website to the app.
 * Dismiss hides it for this visit (sessionStorage), so it comes back next time.
 */
export default function GetAppBanner({ role }: { role: keyof typeof MESSAGES }) {
  const [hidden, setHidden] = useState(() => {
    if (Platform.OS !== 'web') return true;
    try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  if (hidden) return null;
  return (
    <View style={{ backgroundColor: '#1E3A5F', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
      <Ionicons name="phone-portrait" size={16} color={CORAL} />
      <Text style={{ color: '#fff', fontSize: 12, marginLeft: 8, flex: 1, fontFamily: 'NunitoSans-SemiBold' }} numberOfLines={2}>
        <Text style={{ fontFamily: 'NunitoSans-Bold' }}>RallyHUB is better in the app. </Text>{MESSAGES[role]}
      </Text>
      <Pressable
        onPress={() => { track('get_app_tapped', { role }); Linking.openURL(APP_STORE_URL); }}
        style={{ backgroundColor: CORAL, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}
        accessibilityLabel="Get the app"
      >
        <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'NunitoSans-Bold' }}>Get the app</Text>
      </Pressable>
      <Pressable onPress={() => { try { sessionStorage.setItem(KEY, '1'); } catch { /* fine */ } setHidden(true); }} style={{ padding: 6, marginLeft: 4 }} accessibilityLabel="Hide for now">
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
      </Pressable>
    </View>
  );
}
