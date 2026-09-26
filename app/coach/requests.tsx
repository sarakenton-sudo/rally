import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCoachStore } from '@/stores/useCoachStore';
import { getRequestDetail, acceptRequest, declineRequest, isSupabaseConfigured, sessionKindStyle, type RequestDetail } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';

interface Row {
  id: string;
  slots?: { starts_at: string; ends_at: string; facilities?: { label: string } | null } | null;
  session_types?: { name: string; price_cents: number; kind: string } | null;
  detail: RequestDetail | null;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return 'Time TBD';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachRequestsScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const { data } = await supabase
      .from('booking_requests')
      .select('id, slots(starts_at, ends_at, facilities(label)), session_types(name, price_cents, kind)')
      .eq('coach_id', coachProfile.id)
      .eq('status', 'requested')
      .order('created_at', { ascending: true });
    const base = (data as any[]) ?? [];
    const details = await Promise.all(base.map((r) => getRequestDetail(r.id)));
    setRows(base.map((r, i) => ({ ...r, detail: details[i].data })));
    setLoading(false);
  }, [coachProfile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id: string, kind: 'accept' | 'decline') => {
    setBusyId(id);
    try {
      const { error } = kind === 'accept' ? await acceptRequest(id) : await declineRequest(id);
      if (error) { showAlert("Couldn't update", error.message); notifyError(); return; }
      setRows((r) => r.filter((x) => x.id !== id));
      notifySuccess();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Requests</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {rows.length === 0 ? (
            <View className="items-center py-12">
              <Ionicons name="checkmark-done-outline" size={30} color={ic.placeholder} />
              <Text className="text-sm text-stone dark:text-parchment mt-2">No pending requests</Text>
            </View>
          ) : (
            rows.map((r) => {
              const a = r.detail?.athlete;
              const meta = [a?.grad_year ? `'${String(a.grad_year).slice(-2)}` : null, a?.positions?.join('/') || null, a?.level || null, a?.club_team || null].filter(Boolean).join(' · ');
              return (
                <View key={r.id} className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900 mb-3"
                  style={{ borderLeftWidth: 4, borderLeftColor: sessionKindStyle(r.session_types?.kind).color, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-base font-bold text-bark dark:text-cream">
                      {a ? `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}` : 'Athlete'}
                    </Text>
                    {r.session_types && (
                      <Text className="text-sm font-bold text-rally-600">${(r.session_types.price_cents / 100).toFixed(0)}</Text>
                    )}
                  </View>
                  {!!meta && <Text className="text-xs text-stone dark:text-parchment mb-1">{meta}</Text>}
                  <Text className="text-xs text-stone dark:text-parchment">
                    {fmtWhen(r.slots?.starts_at)}{r.session_types?.name ? ` · ${r.session_types.name}` : ''}{r.slots?.facilities?.label ? ` · ${r.slots.facilities.label}` : ''}
                  </Text>

                  {!!a?.goals && <Text className="text-xs text-bark dark:text-parchment mt-2"><Text className="font-semibold">Goals: </Text>{a.goals}</Text>}
                  {!!r.detail?.notes && <Text className="text-xs text-bark dark:text-parchment mt-1"><Text className="font-semibold">Working on: </Text>{r.detail.notes}</Text>}
                  {(r.detail?.film_links ?? []).length > 0 && (
                    <View className="flex-row flex-wrap gap-2 mt-2">
                      {r.detail!.film_links.map((url, i) => (
                        <Pressable key={i} onPress={() => Linking.openURL(url)} className="flex-row items-center bg-rally-50 dark:bg-rally-900/20 px-2.5 py-1 rounded-lg active:opacity-70">
                          <Ionicons name="play-circle-outline" size={13} color="#3B82B0" />
                          <Text className="text-xs font-semibold text-rally-600 ml-1">Film {i + 1}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      disabled={busyId === r.id}
                      onPress={() => act(r.id, 'decline')}
                      className="flex-1 border border-parchment dark:border-rally-900 rounded-xl py-2.5 items-center active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-stone dark:text-parchment">Decline</Text>
                    </Pressable>
                    <Pressable
                      disabled={busyId === r.id}
                      onPress={() => act(r.id, 'accept')}
                      className={`flex-1 rounded-xl py-2.5 items-center ${busyId === r.id ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
                    >
                      <Text className="text-sm font-semibold text-cream">{busyId === r.id ? '...' : 'Accept'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
