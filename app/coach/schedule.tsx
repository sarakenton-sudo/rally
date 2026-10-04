import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchSchedule, getCalendarToken, calendarFeedUrl, googleCalendarSubscribeUrl,
  fetchWeekSlots, fetchSessionTypes, weekSummary, blockRevenue, fmtMoney, setSlotFacilityStatus,
  FACILITY_STATUS_STYLE, hasRealAllergies, isSupabaseConfigured, sessionKindStyle, type ScheduleItem, type SlotWithRefs,
} from '@/lib/coach';
import { useCoachStore } from '@/stores/useCoachStore';
import WeekSummaryHeader from '@/components/coach/WeekSummaryHeader';
import LessonActions from '@/components/coach/LessonActions';
import HealthInfo from '@/components/coach/HealthInfo';
import type { FacilityStatus, SessionType } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import { tapLight, notifySuccess, notifyError } from '@/lib/haptics';

/** Monday 00:00 local of the week containing d. */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return x;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtMonthDay = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Color of the slot's lesson kind (neutral if mixed). */
function itemKinds(item: ScheduleItem): string[] {
  return [...new Set(item.attendees.map((a) => a.session_kind).filter(Boolean) as string[])];
}

function summary(item: ScheduleItem): string {
  const booked = item.attendees.filter((a) => a.kind === 'booking');
  const shown = booked.length ? booked : item.attendees;
  const names = shown.map((a) => a.athlete_name);
  return names.length <= 2 ? names.join(' & ') : `${names.length} athletes`;
}

export default function CoachScheduleScreen() {
  const ic = useIconColors();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const coachProfile = useCoachStore((st) => st.coachProfile);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [slots, setSlots] = useState<SlotWithRefs[]>([]);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !coachProfile) { setLoading(false); return; }
    const end = addDays(weekStart, 7);
    const [sched, sl, st] = await Promise.all([
      fetchSchedule(weekStart, end),
      fetchWeekSlots(coachProfile.id, weekStart, end),
      fetchSessionTypes(coachProfile.id),
    ]);
    if (sched.error) showAlert("Couldn't load schedule", sched.error.message);
    setItems(sched.data);
    setSlots(sl.data);
    setTypes(st.data);
    setLoading(false);
  }, [weekStart, coachProfile]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const itemBySlot = useMemo(() => new Map(items.map((i) => [i.slot_id, i])), [items]);
  const summaryNums = useMemo(() => weekSummary(slots, items, types), [slots, items, types]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    return { day, slots: slots.filter((sl) => sl.status !== 'blocked' && sameDay(new Date(sl.starts_at), day)) };
  }), [weekStart, slots]);

  const isThisWeek = sameDay(weekStart, startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);
  const weekKinds = [...new Set(items.flatMap(itemKinds))];
  const unreserved = slots.filter((sl) => sl.seats_taken > 0 && (sl.facility_status ?? 'not_booked') !== 'reserved').length;

  // Tap the gym chip to cycle Not booked → Requested → Reserved.
  const cycleFacility = async (slot: SlotWithRefs) => {
    const order: FacilityStatus[] = ['not_booked', 'requested', 'reserved'];
    const next = order[(order.indexOf(slot.facility_status ?? 'not_booked') + 1) % order.length];
    tapLight();
    setSlots((all) => all.map((x) => (x.id === slot.id ? { ...x, facility_status: next } : x)));
    const { error } = await setSlotFacilityStatus(slot.id, next);
    if (error) { showAlert("Couldn't update gym status", error.message); load(); }
  };

  const withToken = async (regenerate: boolean, fn: (token: string) => Promise<void> | void) => {
    setSyncBusy(true);
    try {
      const { data, error } = await getCalendarToken(regenerate);
      if (error || !data) { showAlert('Calendar link unavailable', error?.message ?? 'Try again.'); notifyError(); return; }
      await fn(data);
    } finally {
      setSyncBusy(false);
    }
  };

  const addToGoogle = () => withToken(false, (token) => {
    tapLight();
    Linking.openURL(googleCalendarSubscribeUrl(token));
  });

  const copyLink = () => withToken(false, async (token) => {
    await Clipboard.setStringAsync(calendarFeedUrl(token));
    notifySuccess();
    showAlert('Link copied', 'Paste it into Apple Calendar or Outlook as a subscribed calendar.');
  });

  const resetLink = () => {
    const go = () => withToken(true, () => {
      notifySuccess();
      showAlert('Link reset', 'The old link stopped working. Add your calendar again with the new one.');
    });
    if (Platform.OS === 'web') {
      if (window.confirm('Reset your calendar link? Calendars using the old link will stop updating.')) go();
    } else {
      Alert.alert('Reset calendar link?', 'Calendars using the old link will stop updating.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: go },
      ]);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Schedule</Text>
        <View className="w-6" />
      </View>

      {/* Week navigator */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => setWeekStart(addDays(weekStart, -7))} className="p-2 active:opacity-60">
          <Ionicons name="chevron-back-circle-outline" size={26} color="#3B82B0" />
        </Pressable>
        <Pressable onPress={() => setWeekStart(startOfWeek(new Date()))} className="items-center">
          <Text className="text-base font-bold text-bark dark:text-cream">
            {fmtMonthDay(weekStart)} – {fmtMonthDay(weekEnd)}
          </Text>
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">
            {isThisWeek ? 'This week' : 'Tap for this week'}
            {!loading && ` · ${summaryNums.lessons} lesson${summaryNums.lessons === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setWeekStart(addDays(weekStart, 7))} className="p-2 active:opacity-60">
          <Ionicons name="chevron-forward-circle-outline" size={26} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
        {!loading && <WeekSummaryHeader s={summaryNums} />}

        {unreserved > 0 && (
          <View className="flex-row items-center rounded-xl px-3 py-2.5 mb-3" style={{ backgroundColor: '#dc26261a' }}>
            <Ionicons name="alert-circle" size={16} color="#dc2626" />
            <Text className="text-xs font-semibold ml-2 flex-1" style={{ color: '#dc2626' }}>
              {unreserved} booked block{unreserved === 1 ? '' : 's'} this week without a reserved gym. Tap the gym chip to update.
            </Text>
          </View>
        )}

        {/* Legend — lesson types this week */}
        {weekKinds.length > 0 && (
          <View className="flex-row flex-wrap mb-3">
            {weekKinds.map((k) => {
              const st = sessionKindStyle(k);
              return (
                <View key={k} className="flex-row items-center rounded-full px-2.5 py-1 mr-2 mb-1.5" style={{ backgroundColor: st.color + '15' }}>
                  <Ionicons name={st.icon} size={12} color={st.color} />
                  <Text className="text-[11px] font-semibold ml-1" style={{ color: st.color }}>{st.label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-6" />
        ) : (
          days.map(({ day, slots: daySlots }) => {
            const today = sameDay(day, new Date());
            return (
              <View key={day.toISOString()} className="mb-3">
                <Text className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ml-1 ${today ? 'text-rally-600' : 'text-stone'}`}>
                  {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{today ? ' · Today' : ''}
                </Text>
                {daySlots.length === 0 ? (
                  <Text className="text-xs text-stone/70 dark:text-parchment/60 ml-1 mb-1">Nothing scheduled</Text>
                ) : daySlots.map((slot) => {
                  const item = itemBySlot.get(slot.id);
                  const rev = blockRevenue(slot, types, item);
                  const fs = FACILITY_STATUS_STYLE[slot.facility_status ?? 'not_booked'];
                  const gymFlag = slot.seats_taken > 0 && (slot.facility_status ?? 'not_booked') !== 'reserved';
                  const gymChip = (
                    <Pressable
                      onPress={() => cycleFacility(slot)}
                      className="flex-row items-center rounded-full px-2 py-0.5 mt-1.5 self-start"
                      style={{ backgroundColor: fs.color + (gymFlag ? '22' : '14') }}
                    >
                      <Ionicons name={fs.icon} size={11} color={fs.color} />
                      <Text className="text-[10px] font-bold ml-1" style={{ color: fs.color }}>
                        {slot.facilities?.label ? `${slot.facilities.label} · ` : ''}{fs.label}
                      </Text>
                    </Pressable>
                  );

                  // ---- Open block (nobody booked or requested) ----
                  if (!item) {
                    const left = slot.seats_total - slot.seats_taken;
                    return (
                      <View
                        key={slot.id}
                        className="rounded-xl p-3 mb-2 border border-dashed border-parchment dark:border-rally-900"
                      >
                        <View className="flex-row items-center">
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-stone dark:text-parchment">
                              {fmtTime(slot.starts_at)} – {fmtTime(slot.ends_at)} · Open
                            </Text>
                            <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                              {left} spot{left === 1 ? '' : 's'}{rev.open ? ` · ${fmtMoney(rev.open)} open` : ''}
                            </Text>
                          </View>
                        </View>
                        {gymChip}
                      </View>
                    );
                  }

                  // ---- Booked / pending block ----
                  const open = expanded === slot.id;
                  const pending = item.status === 'pending';
                  const typesLabel = [...new Set(item.attendees.map((a) => a.session_type).filter(Boolean))].join(' / ');
                  const kinds = itemKinds(item);
                  const kindStyle = sessionKindStyle(kinds.length === 1 ? kinds[0] : null);
                  return (
                    // Card is a View: only the header toggles. When the whole card was a
                    // Pressable, tapping the note box (cancel/reschedule) collapsed it.
                    <View
                      key={slot.id}
                      className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2"
                      style={{ borderLeftWidth: 4, borderLeftColor: kindStyle.color, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                    >
                      <Pressable onPress={() => { tapLight(); setExpanded(open ? null : slot.id); }} className="flex-row items-center active:opacity-80">
                        <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: kindStyle.color + '15' }}>
                          <Ionicons name={kindStyle.icon} size={18} color={kindStyle.color} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-bark dark:text-cream">
                            {fmtTime(item.starts_at)} – {fmtTime(item.ends_at)} · {summary(item)}
                          </Text>
                          <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                            {[typesLabel, rev.booked ? fmtMoney(rev.booked) : null, rev.open ? `${fmtMoney(rev.open)} still open` : null].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <View className={`px-2 py-1 rounded-md ${pending ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                          <Text className={`text-[10px] font-bold ${pending ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                            {pending ? 'PENDING' : item.seats_total > 1 ? `${item.attendees.filter((a) => a.kind === 'booking').length}/${item.seats_total}` : 'BOOKED'}
                          </Text>
                        </View>
                      </Pressable>
                      <View className="flex-row flex-wrap items-center">
                        {gymChip}
                        {item.attendees.some((a) => hasRealAllergies(a.athlete_profile?.allergies)) && (
                          <View className="flex-row items-center rounded-full px-2 py-0.5 mt-1.5 ml-1.5" style={{ backgroundColor: '#dc26261f' }}>
                            <Ionicons name="warning" size={11} color="#dc2626" />
                            <Text className="text-[10px] font-bold ml-1" style={{ color: '#dc2626' }}>ALLERGY</Text>
                          </View>
                        )}
                      </View>

                      {open && (
                        <View className="mt-3 pt-3 border-t border-parchment dark:border-rally-900">
                          {item.facility_address ? (
                            <Text className="text-xs text-stone dark:text-parchment mb-2">{item.facility_address}</Text>
                          ) : null}
                          {item.attendees.map((a) => (
                            <View key={a.id} className="mb-3">
                              <Text className="text-sm font-semibold text-bark dark:text-cream">
                                {a.athlete_name}
                                {a.kind === 'request' ? <Text className="text-xs font-normal text-amber-700"> · awaiting your reply</Text> : null}
                              </Text>
                              {a.athlete_profile ? (() => {
                                const pr = a.athlete_profile;
                                const facts = [
                                  pr.grad_year ? `Class of ${pr.grad_year}` : null,
                                  pr.positions?.length ? pr.positions.join('/') : null,
                                  pr.height_inches ? `${Math.floor(pr.height_inches / 12)}'${pr.height_inches % 12}"` : null,
                                  pr.level, pr.club_team,
                                ].filter(Boolean);
                                return facts.length ? <Text className="text-xs text-rally-700 dark:text-rally-200 mt-0.5">{facts.join(' · ')}</Text> : null;
                              })() : null}
                              {a.athlete_profile?.goals ? <Text className="text-xs text-stone dark:text-parchment mt-0.5">Goals: {a.athlete_profile.goals}</Text> : null}
                              <HealthInfo
                                allergies={a.athlete_profile?.allergies}
                                medicalNotes={a.athlete_profile?.medical_notes}
                                ecName={a.athlete_profile?.emergency_contact_name}
                                ecPhone={a.athlete_profile?.emergency_contact_phone}
                              />
                              {a.parent_name || a.parent_email ? (
                                <Text className="text-xs text-stone dark:text-parchment">
                                  Parent: {a.parent_name ?? ''}{a.parent_email ? (
                                    <Text className="text-rally-600" onPress={() => Linking.openURL(`mailto:${a.parent_email}`)}>{a.parent_name ? ' · ' : ''}{a.parent_email}</Text>
                                  ) : null}
                                </Text>
                              ) : null}
                              {a.notes ? <Text className="text-xs text-bark dark:text-cream mt-0.5">Work on: {a.notes}</Text> : null}
                              {(a.film_links ?? []).map((url) => (
                                <Pressable key={url} onPress={() => Linking.openURL(url)}>
                                  <Text className="text-xs text-rally-600 underline mt-0.5" numberOfLines={1}>{url}</Text>
                                </Pressable>
                              ))}
                              {a.kind === 'booking' && coachProfile ? (
                                <LessonActions attendee={a} slotId={slot.id} startsAt={item.starts_at} coachId={coachProfile.id} onChanged={load} />
                              ) : null}
                            </View>
                          ))}
                          {pending && (
                            <Pressable onPress={() => router.push('/coach/requests')} className="flex-row items-center mt-1">
                              <Text className="text-xs font-semibold text-rally-600">Review in Requests</Text>
                              <Ionicons name="chevron-forward" size={14} color="#3B82B0" />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}

        {/* Calendar sync */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mt-4">
          <View className="flex-row items-center mb-1">
            <Ionicons name="sync-outline" size={18} color="#3B82B0" />
            <Text className="text-sm font-bold text-bark dark:text-cream ml-2">Sync to your calendar</Text>
          </View>
          <Text className="text-xs text-stone dark:text-parchment mb-3 leading-4">
            Booked and pending lessons show up in your calendar automatically. Google refreshes every few hours, so brand-new bookings can take a little while to appear.
          </Text>
          <Pressable
            disabled={syncBusy}
            onPress={addToGoogle}
            className="flex-row items-center justify-center bg-rally-600 rounded-xl py-2.5 active:opacity-80"
          >
            {syncBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="logo-google" size={16} color="#fff" />}
            <Text className="text-sm font-semibold text-cream ml-2">Add to Google Calendar</Text>
          </Pressable>
          <View className="flex-row justify-between mt-3">
            <Pressable disabled={syncBusy} onPress={copyLink} className="py-1 active:opacity-60">
              <Text className="text-xs font-semibold text-rally-600">Copy link (Apple / Outlook)</Text>
            </Pressable>
            <Pressable disabled={syncBusy} onPress={resetLink} className="py-1 active:opacity-60">
              <Text className="text-xs text-stone">Reset link</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
