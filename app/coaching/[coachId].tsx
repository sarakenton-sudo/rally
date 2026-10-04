import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchCoachById, fetchBookableSlots, fetchSessionTypes, isSupabaseConfigured, type SlotWithRefs } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import type { Coach, SessionType } from '@/types/database';
import Avatar from '@/components/Avatar';

function fmtDateKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CoachDetailScreen() {
  const ic = useIconColors();
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [slots, setSlots] = useState<SlotWithRefs[]>([]);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!coachId || !isSupabaseConfigured) { setLoading(false); return; }
    const [c, s, t] = await Promise.all([fetchCoachById(coachId), fetchBookableSlots(coachId), fetchSessionTypes(coachId)]);
    setCoach(c.data);
    setSlots(s.data);
    setTypes(t.data.filter((x) => x.is_active));
    setLoading(false);
  }, [coachId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? '';
  const slotTypeLabel = (slot: SlotWithRefs) => {
    const ids = slot.eligible_session_type_ids ?? [];
    if (ids.length === 0) return 'Any session type';
    return ids.map(typeName).filter(Boolean).join(' / ');
  };
  const slotFromPrice = (slot: SlotWithRefs) => {
    const ids = slot.eligible_session_type_ids ?? [];
    const pool = ids.length ? types.filter((t) => ids.includes(t.id)) : types;
    if (!pool.length) return null;
    return Math.min(...pool.map((t) => t.price_cents));
  };

  // group by date
  const groups: { key: string; items: SlotWithRefs[] }[] = [];
  for (const s of slots) {
    const key = fmtDateKey(s.starts_at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(s); else groups.push({ key, items: [s] });
  }

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream" numberOfLines={1}>{coach?.display_name ?? 'Coach'}</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Coach header */}
          {coach && (
            <View className="flex-row items-center mb-5">
              <View className="mr-3">
                <Avatar uri={coach.photo_url} name={coach.display_name} size={64} colorKey={coach.id} />
              </View>
              <View className="flex-1">
                {coach.cost_tier && <Text className="text-xs font-semibold text-rally-600">{coach.cost_tier}</Text>}
                {!!coach.bio && <Text className="text-sm text-stone dark:text-parchment" numberOfLines={3}>{coach.bio}</Text>}
              </View>
            </View>
          )}

          <Text className="text-sm font-bold text-bark dark:text-cream mb-2">Open times</Text>
          {slots.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="calendar-outline" size={28} color={ic.placeholder} />
              <Text className="text-sm text-stone dark:text-parchment mt-2 text-center px-8">No open times right now. Check back soon.</Text>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.key} className="mb-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">{g.key}</Text>
                {g.items.map((slot) => {
                  const remaining = slot.seats_total - slot.seats_taken;
                  const from = slotFromPrice(slot);
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => router.push({ pathname: '/coaching/book', params: { slotId: slot.id, coachId: coachId! } })}
                      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                    >
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-bark dark:text-cream">
                          {fmtTime(slot.starts_at)} – {fmtTime(slot.ends_at)}
                        </Text>
                        <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                          {[slotTypeLabel(slot), slot.facilities?.label].filter(Boolean).join(' · ')}
                        </Text>
                        {slot.seats_total > 1 && (
                          <Text className="text-xs font-semibold text-rally-600 mt-0.5">{remaining} of {slot.seats_total} spots left</Text>
                        )}
                      </View>
                      {from != null && (
                        <Text className="text-sm font-bold text-rally-600 mr-2">from ${(from / 100).toFixed(0)}</Text>
                      )}
                      <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
