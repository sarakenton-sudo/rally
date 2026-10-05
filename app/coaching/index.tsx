import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { supabase } from '@/lib/supabase';
import { connectToCoach, fetchMyCoaches, isSupabaseConfigured } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { Coach } from '@/types/database';
import Avatar from '@/components/Avatar';

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  requested: { bg: 'bg-amber-100 dark:bg-amber-900/30', fg: 'text-amber-700 dark:text-amber-300', label: 'Pending' },
  accepted: { bg: 'bg-green-100 dark:bg-green-900/30', fg: 'text-green-700 dark:text-green-300', label: 'Confirmed' },
  declined: { bg: 'bg-parchment dark:bg-rally-900/30', fg: 'text-stone dark:text-parchment', label: 'Declined' },
  expired: { bg: 'bg-parchment dark:bg-rally-900/30', fg: 'text-stone dark:text-parchment', label: 'Expired' },
  cancelled: { bg: 'bg-parchment dark:bg-rally-900/30', fg: 'text-stone dark:text-parchment', label: 'Cancelled' },
};

function fmtWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function MyCoachesScreen() {
  const ic = useIconColors();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data: cs } = await fetchMyCoaches();
    setCoaches(cs);
    const { data: ls } = await supabase
      .from('booking_requests')
      .select('*, coaches(display_name), slots(starts_at, ends_at, facilities(label)), session_types(name)')
      .order('created_at', { ascending: false });
    setLessons((ls as any[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleConnect = async () => {
    if (!code.trim()) { showAlert('Enter a code', 'Type the code your coach sent you, then tap Connect.'); notifyError(); return; }
    setConnecting(true);
    try {
      const { data, error } = await connectToCoach(code.trim());
      if (error) { showAlert("Couldn't connect", error.message); notifyError(); return; }
      setCode('');
      notifySuccess();
      showAlert('Connected', `You're connected to ${data?.display_name ?? 'your coach'}.`);
      await load();
      if (data?.coach_id) router.push({ pathname: '/coaching/[coachId]', params: { coachId: data.coach_id } });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">My Coaches</Text>
        <View className="w-6" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Add a coach */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-5">
          <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Add a coach</Text>
          <Text className="text-xs text-stone dark:text-parchment mb-3">Enter the code your coach shared with you.</Text>
          <View className="flex-row items-end">
            <View className="flex-1">
              <FormField label="" value={code} onChangeText={setCode} placeholder="e.g. ABCD1234" autoCapitalize="characters" autoCorrect={false} />
            </View>
            <Pressable
              onPress={handleConnect}
              disabled={connecting}
              className={`px-5 py-3 rounded-xl ml-2 ${connecting ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
            >
              <Text className="text-sm font-semibold text-cream">{connecting ? '...' : 'Connect'}</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-4" />
        ) : (
          <>
            {/* Connected coaches */}
            {coaches.length > 0 && (
              <>
                <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Your coaches</Text>
                {coaches.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/coaching/[coachId]', params: { coachId: c.id } })}
                    className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                  >
                    <View className="mr-3">
                      <Avatar uri={c.photo_url} name={c.display_name} size={44} colorKey={c.id} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-bark dark:text-cream">{c.display_name}</Text>
                      {c.specialties.length > 0 && (
                        <Text className="text-xs text-stone dark:text-parchment mt-0.5">{c.specialties.join(' · ')}</Text>
                      )}
                    </View>
                    <Text className="text-xs font-semibold text-rally-600 mr-1">Book</Text>
                    <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                  </Pressable>
                ))}
              </>
            )}

            {/* My lessons */}
            {lessons.length > 0 && (
              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">My lessons</Text>
                {lessons.map((l) => {
                  const st = STATUS_STYLE[l.status] ?? STATUS_STYLE.requested;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: l.id } })}
                      className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-bark dark:text-cream">
                          {l.coaches?.display_name ?? 'Coach'}{l.session_types?.name ? ` · ${l.session_types.name}` : ''}
                        </Text>
                        <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                          {fmtWhen(l.slots?.starts_at) || 'Time TBD'}{l.slots?.facilities?.label ? ` · ${l.slots.facilities.label}` : ''}
                        </Text>
                      </View>
                      <View className={`px-2 py-1 rounded-md ${st.bg}`}>
                        <Text className={`text-[10px] font-bold ${st.fg}`}>{st.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#8FA8BF" style={{ marginLeft: 6 }} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {coaches.length === 0 && lessons.length === 0 && (
              <View className="items-center py-10">
                <Ionicons name="people-outline" size={30} color={ic.placeholder} />
                <Text className="text-sm text-stone dark:text-parchment mt-2 text-center px-8">
                  No coaches yet. Enter a code above to connect with your coach and book lessons.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
