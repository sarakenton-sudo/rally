import { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { APP_STORE_URL, parseFanCode, rememberFanCode, acceptFanInvite } from '@/lib/fan';

/**
 * rally-hub.com/fan/<code> — a guest's invite. Works signed out. Shows who
 * invited them, then: get the app (App Store) or continue on the web.
 * The code is remembered through sign-up and accepted on the fan home.
 */
export default function FanInvite() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = parseFanCode(String(raw ?? ''));
  const { session } = useAuth();
  const [info, setInfo] = useState<{ guest_name: string | null; athlete_first_name: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rememberFanCode(code);
    (supabase.rpc as any)('get_fan_invite', { p_code: code }).then(({ data }: any) => setInfo(data ?? null));
  }, [code]);

  const athlete = info?.athlete_first_name ?? 'the athlete';

  const continueHere = async () => {
    if (!session) { router.push({ pathname: '/auth', params: { signup: 'true', fan: code } }); return; }
    setBusy(true);
    const { error: e } = await acceptFanInvite(code);
    setBusy(false);
    if (e) { setError(e); return; }
    router.replace('/fan-home' as any);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#1E3A5F' }}>
      <View className="flex-1 px-6 justify-center" style={{ maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        {info === undefined ? <ActivityIndicator color="#7DBDD9" /> : info === null ? (
          <>
            <Text className="text-2xl font-extrabold text-white">This invite link isn't valid</Text>
            <Text className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>Ask the family to send you a new invite from RallyHUB.</Text>
          </>
        ) : (
          <>
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7DBDD9' }}>You're invited</Text>
            <Text className="text-3xl font-extrabold text-white mt-2">
              {info.guest_name ? `${info.guest_name}, follow ` : 'Follow '}{athlete}'s volleyball season
            </Text>
            <Text className="text-base mt-3 leading-6" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Tournament dates and locations, live streams and tickets, all in one place — with a heads-up on game day. Free.
            </Text>
            {[
              ['calendar', 'Every upcoming tournament, by month'],
              ['navigate', 'Directions to each venue'],
              ['videocam', 'Live stream and ticket links'],
              ['notifications', 'Game-day alerts in the app'],
            ].map(([icon, label]) => (
              <View key={label} className="flex-row items-center mt-3">
                <Ionicons name={icon as any} size={18} color="#7DBDD9" />
                <Text className="text-sm text-white ml-3">{label}</Text>
              </View>
            ))}

            {Platform.OS === 'web' && (
              <Pressable onPress={() => Linking.openURL(APP_STORE_URL)} className="rounded-xl py-3.5 items-center mt-8 active:opacity-80" style={{ backgroundColor: '#FEFEFE' }} accessibilityLabel="Get the free app">
                <Text className="text-base font-bold" style={{ color: '#1E3A5F' }}>Get the free app</Text>
              </Pressable>
            )}
            <Pressable onPress={continueHere} disabled={busy} className="rounded-xl py-3.5 items-center mt-3 active:opacity-80" style={{ backgroundColor: '#3B82B0' }}>
              <Text className="text-base font-bold text-white">
                {busy ? 'One moment…' : session ? `Follow ${athlete}` : Platform.OS === 'web' ? 'Continue on the web' : 'Create my free account'}
              </Text>
            </Pressable>
            {error ? <Text className="text-sm mt-3" style={{ color: '#fca5a5' }}>{error}</Text> : null}
            <Text className="text-xs mt-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Already downloaded the app? Sign up there and enter fan code <Text style={{ fontWeight: '700', color: '#fff' }}>{code}</Text>.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
