import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/Avatar';
import { sessionKindStyle, type CoachOpening } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import type { SessionKind } from '@/types/database';

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

/**
 * Coaches' open times grouped by day; tap one to request it. Used on
 * Book a lesson (inline) and the full Book a Lesson screen.
 */
export default function OpenTimesList({ openings, kind = 'all', limitDays }: {
  openings: CoachOpening[];
  kind?: SessionKind | 'all';
  /** Show only the first N days (Book a lesson shows a preview). */
  limitDays?: number;
}) {
  const ic = useIconColors();
  const groups: { key: string; label: string; items: CoachOpening[] }[] = [];
  for (const o of openings) {
    const key = dayKey(o.starts_at);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(o); else groups.push({ key, label: fmtDay(o.starts_at), items: [o] });
  }
  const shownGroups = limitDays ? groups.slice(0, limitDays) : groups;

  return (
    <>
          {shownGroups.length === 0 ? (
            <View className="items-center py-12 px-6">
              <Ionicons name="calendar-clear-outline" size={34} color={ic.placeholder} />
              <Text className="text-base font-semibold text-bark dark:text-cream mt-3">No open times right now</Text>
              <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
                {kind !== 'all' ? 'Try "All types", or check back — ' : 'Check back soon — '}coaches add new times regularly.
              </Text>
            </View>
          ) : shownGroups.map((g) => (
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
                    <View className="mr-3">
                      <Avatar uri={o.coach_photo_url} name={o.coach_name} size={40} colorKey={o.coach_id} />
                    </View>
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
    </>
  );
}
