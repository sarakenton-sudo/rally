import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchUpcomingSlots, fetchSessionTypes, deleteSlot, isSupabaseConfigured, sessionKindStyle, slotDefaultPrice, fmtMoney, FACILITY_STATUS_STYLE, type SlotWithRefs } from '@/lib/coach';
import type { SessionType } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

function fmtDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function AvailabilityScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [slots, setSlots] = useState<SlotWithRefs[]>([]);
  const [typeNames, setTypeNames] = useState<Record<string, string>>({});
  const [typeKinds, setTypeKinds] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [s, t] = await Promise.all([fetchUpcomingSlots(coachProfile.id), fetchSessionTypes(coachProfile.id)]);
    setSlots(s.data);
    setTypeNames(Object.fromEntries(t.data.map((x) => [x.id, x.name])));
    setTypeKinds(Object.fromEntries(t.data.map((x) => [x.id, x.kind])));
    setTypes(t.data);
    setLoading(false);
  }, [coachProfile]);

  const slotTypeLabel = (slot: SlotWithRefs): string => {
    const ids = slot.eligible_session_type_ids ?? [];
    if (ids.length === 0) return 'Any type';
    return ids.map((id) => typeNames[id]).filter(Boolean).join(' / ') || 'Lesson';
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (slot: SlotWithRefs) => {
    if (slot.seats_taken > 0 || slot.status === 'blocked') {
      const msg = 'This slot has bookings. Cancel those first.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Cannot remove', msg);
      return;
    }
    const doDelete = async () => {
      await deleteSlot(slot.id);
      setSlots((s) => s.filter((x) => x.id !== slot.id));
      notifySuccess();
    };
    const msg = `Remove ${fmtTime(slot.starts_at)} on ${fmtDateKey(slot.starts_at)}?`;
    if (Platform.OS === 'web') { if (window.confirm(msg)) doDelete(); }
    else Alert.alert('Remove slot', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: doDelete }]);
  };

  // Group by date
  const groups: { key: string; items: SlotWithRefs[] }[] = [];
  for (const slot of slots) {
    const key = fmtDateKey(slot.starts_at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(slot); else groups.push({ key, items: [slot] });
  }

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Availability</Text>
        <Pressable onPress={() => router.push('/coach/availability-add')} className="p-1">
          <Ionicons name="add" size={26} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-sm text-stone dark:text-parchment mb-4">
          Open times athletes can book. Add a one-off, or a recurring block for several weeks.
        </Text>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-6" />
        ) : slots.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="calendar-outline" size={30} color={ic.placeholder} />
            <Text className="text-sm text-stone dark:text-parchment mt-2 mb-4">No open times yet</Text>
            <Pressable className="bg-rally-600 rounded-xl px-5 py-3 active:opacity-80" onPress={() => router.push('/coach/availability-add')}>
              <Text className="text-sm font-semibold text-cream">Add availability</Text>
            </Pressable>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.key} className="mb-4">
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">{g.key}</Text>
              {g.items.map((slot) => {
                const full = slot.seats_taken >= slot.seats_total;
                const multi = slot.seats_total > 1;
                const remaining = Math.max(slot.seats_total - slot.seats_taken, 0);
                const kinds = [...new Set((slot.eligible_session_type_ids ?? []).map((id) => typeKinds[id]).filter(Boolean))];
                const stripe = kinds.length === 1 ? sessionKindStyle(kinds[0]).color : sessionKindStyle(null).color;
                return (
                  <Pressable
                    key={slot.id}
                    onPress={() => router.push({ pathname: '/coach/slot-edit', params: { slotId: slot.id } })}
                    className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                    style={{ borderLeftWidth: 4, borderLeftColor: stripe, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-semibold text-bark dark:text-cream">
                          {fmtTime(slot.starts_at)} – {fmtTime(slot.ends_at)}
                        </Text>
                        {kinds.map((k) => (
                          <View key={k} className="w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: sessionKindStyle(k).color }} />
                        ))}
                      </View>
                      <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                        {[slotTypeLabel(slot), slot.facilities?.label].filter(Boolean).join(' · ')}
                      </Text>
                      {multi && (
                        <Text className={`text-xs font-semibold mt-0.5 ${full ? 'text-stone' : 'text-rally-600'}`}>
                          {full ? 'Full' : `${remaining} of ${slot.seats_total} spots left`}
                        </Text>
                      )}
                      {(() => {
                        const openCents = remaining * slotDefaultPrice(slot, types);
                        const fs = slot.facility_id
                          ? FACILITY_STATUS_STYLE[slot.facility_status ?? 'not_booked']
                          : { label: 'Needs a facility — tap to add', color: '#dc2626', icon: 'alert-circle' as const };
                        return (
                          <View className="flex-row items-center mt-1">
                            {openCents > 0 && (
                              <Text className="text-[11px] font-semibold text-rally-600 mr-2">{fmtMoney(openCents)} open</Text>
                            )}
                            <Ionicons name={fs.icon} size={11} color={fs.color} />
                            <Text className="text-[11px] font-semibold ml-0.5" style={{ color: fs.color }}>{fs.label}</Text>
                          </View>
                        );
                      })()}
                    </View>
                    {full ? (
                      <View className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-md">
                        <Text className="text-[10px] font-bold text-green-700 dark:text-green-300">{multi ? 'FULL' : 'BOOKED'}</Text>
                      </View>
                    ) : slot.seats_taken > 0 ? (
                      <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-md">
                        <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{slot.seats_taken} BOOKED</Text>
                      </View>
                    ) : (
                      <Pressable onPress={() => handleDelete(slot)} className="p-2 active:opacity-60">
                        <Ionicons name="trash-outline" size={17} color="#dc2626" />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
