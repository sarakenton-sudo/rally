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
import Avatar from '@/components/Avatar';
import OpenTimesList from '@/components/OpenTimesList';

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
  const { kind: initialKind, coachId: initialCoach } = useLocalSearchParams<{ kind?: string; coachId?: string }>();
  const [openings, setOpenings] = useState<CoachOpening[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<SessionKind | 'all'>((initialKind as SessionKind) || 'all');
  const [coachId, setCoachId] = useState<string | 'all'>(initialCoach || 'all');

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
              {coaches.map((c) => {
                const on = coachId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => { tapLight(); setCoachId(c.id); }}
                    className="flex-row items-center rounded-full pl-1 pr-3 py-1 mr-2 border"
                    style={{ backgroundColor: on ? '#4f46e5' : '#4f46e512', borderColor: on ? '#4f46e5' : '#4f46e535' }}
                  >
                    <Avatar uri={c.photo_url} name={c.display_name} size={22} colorKey={c.id} />
                    <Text className="text-xs font-semibold ml-1.5" style={{ color: on ? '#fff' : '#4f46e5' }}>{c.display_name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <OpenTimesList openings={shown} kind={kind} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
