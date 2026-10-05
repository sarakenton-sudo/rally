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
import { claimPendingCoachInvite } from '@/lib/coachInvites';
import {
  fetchMyCoach, fetchSchedule, fetchWeekSlots, fetchSessionTypes, fetchUpcomingSlots, fetchPendingRequests,
  fetchCoachPolicies, fetchUnpaidLessons, getRequestDetail, acceptRequest, declineRequest,
  fmtMoney, sessionKindStyle, hasRealAllergies, paymentBadge, PAYMENT_BADGE_STYLE, isSupabaseConfigured,
  fetchFamilyRescheduleRequests, coachRespondToReschedule,
  type ScheduleItem, type CoachPolicies, type RequestDetail, type FamilyRescheduleRequest,
} from '@/lib/coach';
import { moneyStrip, gymsToBook, nextLesson, localYmd, type MoneyStrip } from '@/lib/coachToday';
import { groupByMonth } from '@/lib/nextUp';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

const startOfWeek = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

interface PendingCard { id: string; when: string | null; type: string | null; detail: RequestDetail | null }

/** Coach home, in the parent Home format: money strip, Next up, Needs you, Coming up (30 days by month). */
export default function CoachTodayScreen() {
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);
  const setCoach = useCoachStore((s) => s.setCoachProfile);
  // Parent + coach on one login → offer the Family switch.
  const hasFamily = useSeasonStore((s) => s.athletes.length > 0 || !!s.adminConfig);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [money, setMoney] = useState<MoneyStrip | null>(null);
  const [coming, setComing] = useState<ScheduleItem[]>([]);
  const [pending, setPending] = useState<PendingCard[]>([]);
  const [unpaidEnded, setUnpaidEnded] = useState({ count: 0, total: 0 });
  const [gyms, setGyms] = useState(0);
  const [typeCount, setTypeCount] = useState<number | null>(null);
  const [slotCount, setSlotCount] = useState<number | null>(null);
  const [policies, setPolicies] = useState<CoachPolicies | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moveRequests, setMoveRequests] = useState<FamilyRescheduleRequest[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    let c = coach;
    if (!c) {
      const { data } = await fetchMyCoach(user.id);
      if (data) { setCoach(data); c = data; }
    }
    if (!c) { setLoading(false); return; }
    fetchFamilyRescheduleRequests(c.id).then(setMoveRequests);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = startOfWeek(now);
    const [weekItems, weekSlots, types, sched30, pend, unpaid, upcomingSlots, pol, next7Slots] = await Promise.all([
      fetchSchedule(mon, addDays(mon, 7)),
      fetchWeekSlots(c.id, mon, addDays(mon, 7)),
      fetchSessionTypes(c.id),
      fetchSchedule(dayStart, addDays(dayStart, 31)),
      fetchPendingRequests(c.id),
      fetchUnpaidLessons(c.id),
      fetchUpcomingSlots(c.id),
      fetchCoachPolicies(c.id),
      fetchWeekSlots(c.id, dayStart, addDays(dayStart, 8)),
    ]);
    setMoney(moneyStrip(weekItems.data as any, weekSlots.data as any, now));
    setGyms(gymsToBook(next7Slots.data as any, now));
    setComing(sched30.data.filter((i) => i.status === 'booked' && Date.parse(i.ends_at) > now.getTime()));
    const ended = unpaid.filter((u) => u.slots && new Date(u.slots.ends_at) <= now);
    setUnpaidEnded({ count: ended.length, total: ended.reduce((n, u) => n + (u.price_cents ?? 0), 0) });
    setTypeCount(types.data.filter((t) => t.is_active).length);
    setSlotCount(upcomingSlots.data.length);
    setPolicies(pol.data);
    // Pending requests with athlete detail, oldest first (most at risk of expiring).
    const details = await Promise.all(pend.data.map((r) => getRequestDetail(r.id)));
    const slotById = new Map(sched30.data.map((i) => [i.slot_id, i]));
    setPending(pend.data.map((r: any, i) => ({
      id: r.id,
      when: slotById.get(r.slot_id)?.starts_at ?? null,
      type: slotById.get(r.slot_id)?.attendees.find((a) => a.id === r.id)?.session_type ?? null,
      detail: details[i].data,
    })));
    setLoading(false);
  }, [user, coach?.id]);

  useFocusEffect(useCallback(() => {
    // Signed up from a parent's invite link: connect that family first.
    (async () => {
      if (coach) {
        const name = await claimPendingCoachInvite();
        if (name !== null) showToast(name ? `${name}'s family is connected — they can book with you now` : 'The family who invited you is connected');
      }
      load();
    })();
  }, [load, coach?.id]));

  const answerMove = async (r: FamilyRescheduleRequest, accept: boolean) => {
    setBusy(r.booking_id);
    const { error } = await coachRespondToReschedule(r.booking_id, accept);
    setBusy(null);
    if (error) { notifyError(); showToast(error.message); return; }
    notifySuccess();
    setMoveRequests((list) => list.filter((x) => x.booking_id !== r.booking_id));
    showToast(accept ? 'Lesson moved — the family has been told' : 'Original time kept — the family has been told');
    load();
  };

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
  const needsCount = pending.length + moveRequests.length + (gyms ? 1 : 0) + (unpaidEnded.count ? 1 : 0);
  const next = nextLesson(coming);
  const months = groupByMonth(coming.map((i) => ({ ...i, date: localYmd(i.starts_at) })));
  const fmtMove = (iso: string) => `${new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

  /** Payment status carries the weight; allergy is a small FYI line. */
  const PayBadge = ({ item, big }: { item: ScheduleItem; big?: boolean }) => {
    const booked = item.attendees.filter((a) => a.kind === 'booking');
    if (!booked.length) return null;
    const st = PAYMENT_BADGE_STYLE[paymentBadge(booked[0], item.starts_at)];
    const total = booked.reduce((n, a) => n + (a.price_cents ?? 0), 0);
    return (
      <View className="rounded-lg items-end" style={{ backgroundColor: st.bg, paddingHorizontal: big ? 12 : 10, paddingVertical: big ? 6 : 5 }}>
        <Text style={{ color: st.fg, fontSize: big ? 13 : 12, fontWeight: '800' }}>{st.label}</Text>
        {total ? <Text style={{ color: st.fg, fontSize: 11, fontWeight: '600' }}>{fmtMoney(total)}{booked.length > 1 ? ` · ${booked.length}` : ''}</Text> : null}
      </View>
    );
  };
  const allergyLine = (item: ScheduleItem) => {
    const list = item.attendees.map((a) => a.athlete_profile?.allergies).filter((x) => hasRealAllergies(x));
    return list.length ? `Allergy: ${list.join('; ')}` : null;
  };

  const LessonRow = ({ item }: { item: ScheduleItem }) => {
    const booked = item.attendees.filter((a) => a.kind === 'booking');
    const shown = booked.length ? booked : item.attendees;
    const kind = sessionKindStyle(shown[0]?.session_kind);
    const allergy = allergyLine(item);
    const d = new Date(item.starts_at);
    return (
      <Pressable
        onPress={() => router.push('/coach-schedule')}
        className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
        style={{ borderLeftWidth: 4, borderLeftColor: kind.color }}
      >
        <View className="w-16">
          <Text className="text-[10px] font-bold uppercase text-stone">{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</Text>
          <Text className="text-sm font-bold text-bark dark:text-cream">{fmtTime(item.starts_at)}</Text>
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-sm font-semibold text-bark dark:text-cream" numberOfLines={1}>
            {shown.map((a) => a.athlete_name.split(' ')[0]).join(', ')}{shown[0]?.session_type ? ` · ${shown[0].session_type}` : ''}
          </Text>
          {item.facility_label ? <Text className="text-xs text-stone dark:text-parchment" numberOfLines={1}>{item.facility_label}</Text> : null}
          {allergy ? <Text className="text-[11px] text-stone dark:text-parchment" numberOfLines={1}>{allergy}</Text> : null}
        </View>
        <PayBadge item={item} />
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

        {/* Money strip — this week: booked, collected, unpaid (open capacity is spots, not $) */}
        {money && (
          <Pressable onPress={() => router.push('/coach-schedule')} className="rounded-2xl p-4 mb-4 active:opacity-90" style={{ backgroundColor: '#1E3A5F' }} accessibilityLabel="This week's money">
            <Text className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>This week · {money.lessons} lesson{money.lessons === 1 ? '' : 's'}</Text>
            <View className="flex-row">
              {[
                { l: 'Booked', v: money.booked, c: '#FEFEFE' },
                { l: 'Collected', v: money.collected, c: '#86EFAC' },
                { l: 'Unpaid', v: money.unpaid, c: money.unpaid ? '#FCD34D' : '#8FA8BF' },
              ].map((t, i) => (
                <View key={t.l} className={`flex-1 ${i ? 'border-l pl-3' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                  <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>{t.l}</Text>
                  <Text className="text-xl font-bold mt-0.5" style={{ color: t.c }}>{fmtMoney(t.v)}</Text>
                </View>
              ))}
            </View>
            {money.openSpots > 0 && (
              <Text className="text-xs mt-2" style={{ color: '#7DBDD9' }}>{money.openSpots} open spot{money.openSpots === 1 ? '' : 's'} left this week</Text>
            )}
          </Pressable>
        )}

        <SetupChecklist coach={coach} typeCount={typeCount} slotCount={slotCount} policies={policies} />

        {/* Next up */}
        {next && (() => {
          const booked = next.attendees.filter((a) => a.kind === 'booking');
          const kind = sessionKindStyle(booked[0]?.session_kind);
          const d = new Date(next.starts_at);
          const isToday = localYmd(next.starts_at) === localYmd(new Date().toISOString());
          const allergy = allergyLine(next);
          return (
            <Pressable onPress={() => router.push('/coach-schedule')} className="rounded-2xl p-4 mb-4 bg-warm-white dark:bg-bark-light border border-parchment dark:border-rally-900 active:opacity-90" style={{ borderLeftWidth: 5, borderLeftColor: kind.color }} accessibilityLabel="Next lesson">
              <View className="flex-row items-start">
                <View className="flex-1 mr-3">
                  <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: kind.color }}>Next up · {isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long' })}</Text>
                  <Text className="text-lg font-bold text-bark dark:text-cream mt-0.5" numberOfLines={1}>
                    {booked.map((a) => a.athlete_name.split(' ')[0]).join(', ')}{booked[0]?.session_type ? ` · ${booked[0].session_type}` : ''}
                  </Text>
                  <Text className="text-sm text-stone dark:text-parchment mt-0.5">
                    {isToday ? '' : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · `}{fmtTime(next.starts_at)}{next.facility_label ? ` · ${next.facility_label}` : ''}
                  </Text>
                  {allergy ? <Text className="text-xs text-stone dark:text-parchment mt-0.5">{allergy}</Text> : null}
                </View>
                <PayBadge item={next} big />
              </View>
            </Pressable>
          );
        })()}

        {/* Needs you */}
        {needsCount > 0 && (
          <>
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Needs you</Text>
            {moveRequests.map((r) => (
              <View key={r.booking_id} className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-amber-300 dark:border-amber-700">
                <Text className="text-[10px] font-bold text-amber-700 mb-0.5">MOVE REQUEST</Text>
                <Text className="text-sm font-bold text-bark dark:text-cream">{r.athlete_name}</Text>
                <Text className="text-xs text-stone dark:text-parchment">{r.parent_name ? `${r.parent_name} asked to move this lesson` : 'The family asked to move this lesson'}</Text>
                <View className="mt-1.5 rounded-lg p-2" style={{ backgroundColor: '#d977060f' }}>
                  <Text className="text-xs text-stone dark:text-parchment">Now: <Text className="line-through">{fmtMove(r.current_starts_at)}</Text></Text>
                  <Text className="text-xs text-bark dark:text-cream mt-0.5">Requested: <Text className="font-bold">{fmtMove(r.proposed_starts_at)}</Text>{r.proposed_facility ? ` · ${r.proposed_facility}` : ''}</Text>
                </View>
                {r.reason ? <Text className="text-xs text-stone italic mt-0.5">"{r.reason}"</Text> : null}
                <View className="flex-row mt-2" style={{ gap: 8 }}>
                  <Pressable disabled={busy === r.booking_id} onPress={() => answerMove(r, true)} className="rounded-lg px-3 py-2 bg-rally-600 active:opacity-80" accessibilityLabel="Accept new time">
                    <Text className="text-xs font-bold text-white">Accept new time</Text>
                  </Pressable>
                  <Pressable disabled={busy === r.booking_id} onPress={() => answerMove(r, false)} className="rounded-lg px-3 py-2 border border-parchment dark:border-rally-900 active:opacity-70" accessibilityLabel="Keep original">
                    <Text className="text-xs font-bold text-bark dark:text-cream">Keep original</Text>
                  </Pressable>
                </View>
              </View>
            ))}
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
                  {hasRealAllergies(a?.allergies) && <Text className="text-xs text-stone dark:text-parchment mt-0.5">Allergy: {a?.allergies}</Text>}
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
            {gyms > 0 && (
              <Pressable onPress={() => { tapLight(); router.push('/coach-schedule'); }} className="flex-row items-center rounded-xl p-3.5 mb-2 active:opacity-80" style={{ backgroundColor: '#d977061a' }} accessibilityLabel="Book your gyms">
                <Ionicons name="business" size={18} color="#b45309" />
                <View className="flex-1 ml-2">
                  <Text className="text-sm font-semibold" style={{ color: '#b45309' }}>Book your gyms</Text>
                  <Text className="text-xs" style={{ color: '#b45309' }}>
                    {gyms} lesson{gyms === 1 ? '' : 's'} in the next 7 days without a reserved gym
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#b45309" />
              </Pressable>
            )}
            {unpaidEnded.count > 0 && (
              <Pressable onPress={() => { tapLight(); router.push('/coach/unpaid'); }} className="flex-row items-center rounded-xl p-3.5 mb-2 active:opacity-80" style={{ backgroundColor: '#16a34a14' }} accessibilityLabel="Record payments">
                <Ionicons name="cash" size={18} color="#15803d" />
                <Text className="text-sm font-semibold ml-2 flex-1" style={{ color: '#15803d' }}>
                  {unpaidEnded.count} lesson{unpaidEnded.count === 1 ? '' : 's'} unpaid · {fmtMoney(unpaidEnded.total)} — record payment
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#15803d" />
              </Pressable>
            )}
            <View className="h-3" />
          </>
        )}

        {/* Coming up — next 30 days, by month (same format as the parent Home) */}
        <View className="flex-row items-center justify-between mb-2 ml-1">
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone">Coming up · next 30 days</Text>
          <Pressable onPress={() => router.push('/coach-schedule')}><Text className="text-xs font-semibold text-rally-600">Full schedule →</Text></Pressable>
        </View>
        {months.length === 0 ? (
          <Pressable onPress={() => router.push('/coach/availability-add')} className="rounded-xl p-4 border border-dashed border-parchment dark:border-rally-900 items-center">
            <Text className="text-sm text-stone dark:text-parchment">Nothing booked in the next 30 days.</Text>
            <Text className="text-sm font-semibold text-rally-600 mt-1">Add open time</Text>
          </Pressable>
        ) : months.map((m) => (
          <View key={m.key}>
            <Text className="text-xs font-bold uppercase tracking-wider text-stone mt-2 mb-2 ml-1" accessibilityRole="header">{m.label}</Text>
            {m.items.map((i) => <LessonRow key={i.slot_id} item={i} />)}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
