import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchSessionTypes, isSupabaseConfigured, sessionKindStyle } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';

const KIND_LABEL: Record<string, string> = {
  private_1: 'Private 1:1',
  semi_2: 'Semi-Private 2:1',
  small_group: 'Small Group',
  clinic: 'Clinic',
  camp: 'Camp',
};

export default function SessionTypesScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const sessionTypes = useCoachStore((s) => s.sessionTypes);
  const setSessionTypes = useCoachStore((s) => s.setSessionTypes);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const { data } = await fetchSessionTypes(coachProfile.id);
    setSessionTypes(data);
    setLoading(false);
  }, [coachProfile, setSessionTypes]);

  useEffect(() => { load(); }, [load]);
  // Refresh when returning from the edit screen
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Session Types</Text>
        <Pressable onPress={() => router.push('/coach/session-type-edit')} className="p-1">
          <Ionicons name="add" size={26} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-sm text-stone dark:text-parchment mb-4">
          Define the lessons you offer and what they cost. You'll attach these to your open times.
        </Text>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-6" />
        ) : sessionTypes.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="pricetags-outline" size={30} color={ic.placeholder} />
            <Text className="text-sm text-stone dark:text-parchment mt-2 mb-4">No session types yet</Text>
            <Pressable
              className="bg-rally-600 rounded-xl px-5 py-3 active:opacity-80"
              onPress={() => router.push('/coach/session-type-edit')}
            >
              <Text className="text-sm font-semibold text-cream">Add your first session type</Text>
            </Pressable>
          </View>
        ) : (
          sessionTypes.map((st) => (
            <Pressable
              key={st.id}
              onPress={() => router.push({ pathname: '/coach/session-type-edit', params: { editId: st.id } })}
              className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
              style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: sessionKindStyle(st.kind).color + '15' }}>
                <Ionicons name={sessionKindStyle(st.kind).icon} size={20} color={sessionKindStyle(st.kind).color} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">{st.name}</Text>
                  {!st.is_active && (
                    <View className="ml-2 bg-parchment dark:bg-rally-900/30 px-1.5 py-0.5 rounded">
                      <Text className="text-[10px] font-bold text-stone dark:text-parchment">HIDDEN</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  {KIND_LABEL[st.kind] ?? st.kind} · {st.duration_min} min · {st.booking_mode === 'instant' ? 'Instant book' : 'Request to book'}
                </Text>
              </View>
              <Text className="text-base font-bold mr-2" style={{ color: sessionKindStyle(st.kind).color }}>${(st.price_cents / 100).toFixed(0)}</Text>
              <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
