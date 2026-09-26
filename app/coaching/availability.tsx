import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchAllCoachAvailability, sessionKindStyle, SESSION_KIND_STYLE, isSupabaseConfigured,
  type CoachOpening,
} from '@/lib/coach';
import type { Coach, SessionKind } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso: string) => new Date(iso).toDateString();
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today · ${label}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${label}`;
  return label;
};

export default function CoachAvailabilityScreen() {
  const ic = useIconColors();
  // Home's "Book a private" opens with kind=private_1 preselected.
  const { kind: initialKind } = useLocalSearchParams<{ kind?: string }>();
  const [openings, setOpenings] = useState<CoachOpening[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<SessionKind | 'all'>((initialKind as SessionKind) || 'all');
  const [coachId, setCoachId] = useState<string | 'all'>('all');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data, coaches: cs } = await fetchAllCoachAvailability();
    setOpenings(data);
    setCoaches(cs);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Only offer kind chips that actually have openings.
  const kindsOffered = useMemo(() => {
    const set = new Set<SessionKind>();
    openings.forEach((o) => o.eligible_types.forEach((t) => set.add(t.kind)));
    return (Object.keys(SESSION_KIND_STYLE) as SessionKind[]).filter((k) => set.has(k));
  }, [openings]);

  const shown = useMemo(() => openings.filter((o) =>
    (coachId === 'all' || o.coach_id === coachId) &&
    (kind === 'all' || o.eligible_types.some((t) => t.kind === kind))
  ), [openings, coachId, kind]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: CoachOpening[] }[] = [];
    for (const o of shown) {
      const key = dayKey(o.starts_at);
      const g = out.find((x) => x.key === key);
      if (g) g.items.push(o); else out.push({ key, label: fmtDay(o.starts_at), items: [o] });
    }
    return out;
  }, [shown]);

  const Chip = ({ active, label, color, onPress }: { active: boolean; label: string; color: string; onPress: () => void }) => (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      className="rounded-full px-3 py-1.5 mr-2 border"
      style={{ backgroundColor: active ? color : color + '12', borderColor: active ? color : color + '35' }}
    >
      <Text className="text-xs font-semibold" style={{ color: active ? '#fff' : color }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Book a Lesson</Text>
        <Pressable onPress={() => router.push('/coaching')} className="p-1" accessibilityLabel="My coaches">
          <Ionicons name="people-outline" size={22} color="#3B82B0" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : coaches.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: '#3B82B015' }}>
            <Ionicons name="person-add-outline" size={28} color="#3B82B0" />
          </View>
          <Text className="text-lg font-bold text-bark dark:text-cream text-center">Add your coach first</Text>
          <Text className="text-sm text-stone dark:text-parchment text-center mt-1 mb-5">
            Enter the code your coach sent you and their open times will show up here.
          </Text>
          <Pressable onPress={() => router.push('/coaching')} className="bg-rally-600 rounded-xl px-6 py-3 active:opacity-80">
            <Text className="text-sm font-semibold text-cream">Add a coach</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Lesson type filter */}
          {kindsOffered.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              <Chip active={kind === 'all'} label="All types" color="#1E3A5F" onPress={() => setKind('all')} />
              {kindsOffered.map((k) => (
                <Chip key={k} active={kind === k} label={SESSION_KIND_STYLE[k].label} color={SESSION_KIND_STYLE[k].color} onPress={() => setKind(k)} />
              ))}
            </ScrollView>
          )}
          {/* Coach filter */}
          {coaches.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <Chip active={coachId === 'all'} label="All coaches" color="#4f46e5" onPress={() => setCoachId('all')} />
              {coaches.map((c) => (
                <Chip key={c.id} active={coachId === c.id} label={c.display_name} color="#4f46e5" onPress={() => setCoachId(c.id)} />
              ))}
            </ScrollView>
          )}

          {groups.length === 0 ? (
            <View className="items-center py-12 px-6">
              <Ionicons name="calendar-clear-outline" size={34} color={ic.placeholder} />
              <Text className="text-base font-semibold text-bark dark:text-cream mt-3">No open times right now</Text>
              <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
                {kind !== 'all' ? 'Try "All types", or check back — ' : 'Check back soon — '}coaches add new times regularly.
              </Text>
            </View>
          ) : groups.map((g) => (
            <View key={g.key} className="mb-4">
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">{g.label}</Text>
              {g.items.map((o) => {
                const types = kind === 'all' ? o.eligible_types : o.eligible_types.filter((t) => t.kind === kind);
                const stripe = sessionKindStyle(types.length === 1 ? types[0].kind : kind === 'all' ? null : kind).color;
                const fromPrice = types.length ? Math.min(...types.map((t) => t.price_cents)) : null;
                const left = o.seats_total - o.seats_taken;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => router.push({ pathname: '/coaching/book', params: { slotId: o.id, coachId: o.coach_id } })}
                    className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                    style={{ borderLeftWidth: 4, borderLeftColor: stripe, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                  >
                    <View className="flex-1">
                      <Text className="text-base font-bold text-bark dark:text-cream">
                        {fmtTime(o.starts_at)} – {fmtTime(o.ends_at)}
                      </Text>
                      <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                        {[o.coach_name, o.facilities?.label].filter(Boolean).join(' · ')}
                      </Text>
                      <View className="flex-row flex-wrap mt-1.5">
                        {types.map((t) => {
                          const st = sessionKindStyle(t.kind);
                          return (
                            <View key={t.id} className="rounded-md px-1.5 py-0.5 mr-1 mb-1" style={{ backgroundColor: st.color + '15' }}>
                              <Text className="text-[10px] font-semibold" style={{ color: st.color }}>{t.name}</Text>
                            </View>
                          );
                        })}
                        {o.seats_total > 1 && (
                          <View className="rounded-md px-1.5 py-0.5 mr-1 mb-1 bg-parchment dark:bg-rally-900/30">
                            <Text className="text-[10px] font-semibold text-stone dark:text-parchment">{left} spot{left === 1 ? '' : 's'} left</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View className="items-end ml-2">
                      {fromPrice !== null && (
                        <Text className="text-base font-bold" style={{ color: stripe }}>
                          {types.length > 1 ? 'from ' : ''}${(fromPrice / 100).toFixed(0)}
                        </Text>
                      )}
                      <View className="flex-row items-center mt-1">
                        <Text className="text-xs font-semibold text-rally-600">Book</Text>
                        <Ionicons name="chevron-forward" size={14} color="#3B82B0" />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
