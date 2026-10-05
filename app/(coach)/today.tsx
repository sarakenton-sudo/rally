import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { useSeasonStore } from '@/stores/useSeasonStore';
import Avatar from '@/components/Avatar';
import SetupChecklist from '@/components/coach/SetupChecklist';
import { showToast } from '@/components/Toast';
import {
  fetchMyCoach, fetchSchedule, fetchWeekSlots, fetchSessionTypes, fetchUpcomingSlots, fetchPendingRequests,
  fetchCoachPolicies, fetchUnpaidLessons, getRequestDetail, acceptRequest, declineRequest, weekSummary,
  fmtMoney, sessionKindStyle, hasRealAllergies, paymentBadge, PAYMENT_BADGE_STYLE, isSupabaseConfigured,
  type ScheduleItem, type WeekSummary, type CoachPolicies, type RequestDetail,
} from '@/lib/coach';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

const startOfWeek = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

interface PendingCard { id: string; when: string | null; type: string | null; detail: RequestDetail | null }

/** Coach home: money strip, "Needs you", today's lessons, next 7 days. */
export default function CoachTodayScreen() {
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);
  const setCoach = useCoachStore((s) => s.setCoachProfile);
  // Parent + coach on one login → offer the Family switch.
  const hasFamily = useSeasonStore((s) => s.athletes.length > 0 || !!s.adminConfig);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [today, setToday] = useState<ScheduleItem[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduleItem[]>([]);
  const [pending, setPending] = useState<PendingCard[]>([]);
  const [unpaidEnded, setUnpaidEnded] = useState(0);
  const [unreserved, setUnreserved] = useState(0);
  const [typeCount, setTypeCount] = useState<number | null>(null);
  const [slotCount, setSlotCount] = useState<number | null>(null);
  const [policies, setPolicies] = useState<CoachPolicies | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    let c = coach;
    if (!c) {
      const { data } = await fetchMyCoach(user.id);
      if (data) { setCoach(data); c = data; }
    }
    if (!c) { setLoading(false); return; }
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = startOfWeek(now);
    const [weekItems, weekSlots, types, sched8, pend, unpaid, upcomingSlots, pol] = await Promise.all([
      fetchSchedule(mon, addDays(mon, 7)),
      fetchWeekSlots(c.id, mon, addDays(mon, 7)),
      fetchSessionTypes(c.id),
      fetchSchedule(dayStart, addDays(dayStart, 8)),
      fetchPendingRequests(c.id),
      fetchUnpaidLessons(c.id),
      fetchUpcomingSlots(c.id),
      fetchCoachPolicies(c.id),
    ]);
    setWeek(weekSummary(weekSlots.data, weekItems.data, types.data));
    setUnreserved(weekSlots.data.filter((s) => s.seats_taken > 0 && (s.facility_status ?? 'not_booked') !== 'reserved' && new Date(s.starts_at) >= dayStart).length);
    const tomorrow = addDays(dayStart, 1);
    setToday(sched8.data.filter((i) => new Date(i.starts_at) < tomorrow && i.status === 'booked'));
    setUpcoming(sched8.data.filter((i) => new Date(i.starts_at) >= tomorrow));
    setUnpaidEnded(unpaid.filter((u) => u.slots && new Date(u.slots.ends_at) <= now).length);
    setTypeCount(types.data.filter((t) => t.is_active).length);
    setSlotCount(upcomingSlots.data.length);
    setPolicies(pol.data);
    // Pending requests with athlete detail, oldest first (most at risk of expiring).
    const details = await Promise.all(pend.data.map((r) => getRequestDetail(r.id)));
    const slotById = new Map(sched8.data.map((i) => [i.slot_id, i]));
    setPending(pend.data.map((r: any, i) => ({
      id: r.id,
      when: slotById.get(r.slot_id)?.starts_at ?? null,
      type: slotById.get(r.slot_id)?.attendees.find((a) => a.id === r.id)?.session_type ?? null,
      detail: details[i].data,
    })));
    setLoading(false);
  }, [user, coach?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (id: string, kind: 'accept' | 'decline') => {
    setBusy(id);
    const { error } = kind === 'accept' ? await acceptRequest(id) : await declineRequest(id);
    setBusy(null);
    if (error) { notifyError(); showToast(error.message); return; }
    notifySuccess();
    setPending((p) => p.filter((x) => x.id !== id));
    showToast(kind === 'accept' ? 'Approved — the family has been notified' : 'Declined');
    load();
  };

  if (loading) return <View className="flex-1 bg-cream dark:bg-bark items-center justify-center"><ActivityIndicator color="#3B82B0" /></View>;
  if (!coach) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-bark items-center justify-center px-8" edges={['top']}>
        <Text className="text-xl font-bold text-bark dark:text-cream text-center mb-2">Run your private lessons from one place</Text>
        <Pressable onPress={() => router.push('/coach/onboarding')} className="bg-rally-600 rounded-xl px-6 py-3 mt-3">
          <Text className="text-base font-semibold text-cream">Set up my coaching profile</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const first = coach.display_name.replace(/^coach\s+/i, '').split(' ')[0];
  const needsCount = pending.length + (unreserved ? 1 : 0) + (unpaidEnded ? 1 : 0);

  const LessonRow = ({ item, compact }: { item: ScheduleItem; compact?: boolean }) => {
    const booked = item.attendees.filter((a) => a.kind === 'booking');
    const shown = booked.length ? booked : item.attendees;
    const kind = sessionKindStyle(shown[0]?.session_kind);
    const allergy = item.attendees.some((a) => hasRealAllergies(a.athlete_profile?.allergies));
    const pay = booked[0] ? PAYMENT_BADGE_STYLE[paymentBadge(booked[0], item.starts_at)] : null;
    const d = new Date(item.starts_at);
    return (
      <Pressable
        onPress={() => router.push('/coach-schedule')}
        className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
        style={{ borderLeftWidth: 4, borderLeftColor: kind.color }}
      >
        <View className="w-16">
          {compact && <Text className="text-[10px] font-bold uppercase text-stone">{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>}
          <Text className="text-sm font-bold text-bark dark:text-cream">{fmtTime(item.starts_at)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-bark dark:text-cream" numberOfLines={1}>
            {shown.map((a) => a.athlete_name.split(' ')[0]).join(', ')}{shown[0]?.session_type ? ` · ${shown[0].session_type}` : ''}
          </Text>
          <View className="flex-row items-center flex-wrap mt-0.5">
            {item.facility_label ? <Text className="text-xs text-stone dark:text-parchment mr-2">{item.facility_label}</Text> : null}
            {item.status === 'pending' ? <Text className="text-[10px] font-bold text-amber-700 mr-2">PENDING</Text> : null}
            {allergy ? <Text className="text-[10px] font-bold mr-2" style={{ color: '#dc2626' }}>⚠ ALLERGY</Text> : null}
          </View>
        </View>
        {pay && !compact ? (
          <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: pay.bg }}>
            <Text className="text-[10px] font-bold" style={{ color: pay.fg }}>{pay.label}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#3B82B0" />}
      >
        {/* Header */}
        <View className="flex-row items-center mb-4">
          <Avatar uri={coach.photo_url} name={coach.display_name} size={44} colorKey={coach.id} />
          <View className="flex-1 ml-3">
            <Text className="text-xs text-stone dark:text-parchment">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            <Text className="text-xl font-bold text-bark dark:text-cream">Hi, {first}</Text>
          </View>
          {hasFamily && (
            <Pressable onPress={() => router.replace('/(tabs)')} className="flex-row items-center rounded-full px-3 py-1.5 bg-warm-white dark:bg-bark-light border border-parchment dark:border-rally-900 active:opacity-70" accessibilityLabel="Switch to Family">
              <Ionicons name="swap-horizontal" size={14} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 ml-1">Family</Text>
            </Pressable>
          )}
        </View>

        {/* Money strip */}
        {week && (
          <Pressable onPress={() => router.push('/coach-schedule')} className="bg-bark rounded-2xl p-4 mb-4 flex-row active:opacity-90" style={{ backgroundColor: '#1E3A5F' }} accessibilityLabel="This week's money">
            {[
              { l: 'Booked', v: week.booked, c: '#FEFEFE' },
              { l: 'Still open', v: week.open, c: '#7DBDD9' },
              { l: 'Unpaid', v: week.outstanding, c: week.outstanding ? '#FCA5A5' : '#8FA8BF' },
            ].map((t, i) => (
              <View key={t.l} className={`flex-1 ${i ? 'border-l pl-3' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>{t.l}</Text>
                <Text className="text-xl font-bold mt-0.5" style={{ color: t.c }}>{fmtMoney(t.v)}</Text>
              </View>
            ))}
          </Pressable>
        )}

        <SetupChecklist coach={coach} typeCount={typeCount} slotCount={slotCount} policies={policies} />

        {/* Needs you */}
        {needsCount > 0 && (
          <>
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Needs you</Text>
            {pending.map((p) => {
              const a = p.detail?.athlete;
              const meta = [a?.grad_year ? `'${String(a.grad_year).slice(-2)}` : null, a?.positions?.join('/') || null, a?.club_team].filter(Boolean).join(' · ');
              return (
                <View key={p.id} className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-amber-300 dark:border-amber-700">
                  <Text className="text-[10px] font-bold text-amber-700 mb-0.5">LESSON REQUEST</Text>
                  <Text className="text-sm font-bold text-bark dark:text-cream">
                    {a ? `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}` : 'A family'}{p.type ? ` · ${p.type}` : ''}
                  </Text>
                  <Text className="text-xs text-stone dark:text-parchment">
                    {p.when ? `${new Date(p.when).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(p.when)}` : ''}{meta ? ` · ${meta}` : ''}
                  </Text>
                  {hasRealAllergies(a?.allergies) && <Text className="text-xs font-semibold mt-0.5" style={{ color: '#dc2626' }}>⚠ Allergies: {a?.allergies}</Text>}
                  <View className="flex-row mt-2.5">
                    <Pressable disabled={busy === p.id} onPress={() => respond(p.id, 'accept')} className="flex-1 bg-rally-600 rounded-lg py-2 items-center mr-2 active:opacity-80" accessibilityLabel="Approve">
                      <Text className="text-sm font-bold text-cream">{busy === p.id ? '…' : 'Approve'}</Text>
                    </Pressable>
                    <Pressable disabled={busy === p.id} onPress={() => respond(p.id, 'decline')} className="flex-1 rounded-lg py-2 items-center border border-parchment dark:border-rally-900 active:opacity-70" accessibilityLabel="Decline">
                      <Text className="text-sm font-semibold text-stone">Decline</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => router.push('/coach/requests')} className="mt-2"><Text className="text-xs font-semibold text-rally-600">Notes, film & full profile →</Text></Pressable>
                </View>
              );
            })}
            {unreserved > 0 && (
              <Pressable onPress={() => router.push('/coach-schedule')} className="flex-row items-center rounded-xl p-3.5 mb-2 active:opacity-80" style={{ backgroundColor: '#dc26261a' }}>
                <Ionicons name="business" size={18} color="#dc2626" />
                <Text className="text-sm font-semibold ml-2 flex-1" style={{ color: '#dc2626' }}>
                  {unreserved} booked block{unreserved === 1 ? '' : 's'} this week without a reserved gym
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#dc2626" />
              </Pressable>
            )}
            {unpaidEnded > 0 && (
              <Pressable onPress={() => { tapLight(); router.push('/coach/unpaid'); }} className="flex-row items-center rounded-xl p-3.5 mb-2 active:opacity-80" style={{ backgroundColor: '#16a34a14' }}>
                <Ionicons name="cash" size={18} color="#16a34a" />
                <Text className="text-sm font-semibold ml-2 flex-1" style={{ color: '#15803d' }}>
                  {unpaidEnded} lesson{unpaidEnded === 1 ? '' : 's'} unpaid — mark paid
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#16a34a" />
              </Pressable>
            )}
            <View className="h-3" />
          </>
        )}

        {/* Today */}
        <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Today</Text>
        {today.length === 0 ? (
          <Text className="text-sm text-stone dark:text-parchment ml-1 mb-4">No lessons today.</Text>
        ) : (
          <View className="mb-4">{today.map((i) => <LessonRow key={i.slot_id} item={i} />)}</View>
        )}

        {/* Next 7 days */}
        <View className="flex-row items-center justify-between mb-2 ml-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone">Next 7 days</Text>
          <Pressable onPress={() => router.push('/coach-schedule')}><Text className="text-xs font-semibold text-rally-600">Full schedule →</Text></Pressable>
        </View>
        {upcoming.length === 0 ? (
          <Pressable onPress={() => router.push('/coach/availability-add')} className="rounded-xl p-4 border border-dashed border-parchment dark:border-rally-900 items-center">
            <Text className="text-sm text-stone dark:text-parchment">Nothing booked yet.</Text>
            <Text className="text-sm font-semibold text-rally-600 mt-1">Add open time</Text>
          </Pressable>
        ) : upcoming.map((i) => <LessonRow key={i.slot_id} item={i} compact />)}
      </ScrollView>
    </SafeAreaView>
  );
}
