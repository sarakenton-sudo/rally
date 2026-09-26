import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchSchedule, getCalendarToken, calendarFeedUrl, googleCalendarSubscribeUrl,
  isSupabaseConfigured, sessionKindStyle, type ScheduleItem,
} from '@/lib/coach';
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
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await fetchSchedule(weekStart, addDays(weekStart, 7));
    if (error) showAlert("Couldn't load schedule", error.message);
    setItems(data);
    setLoading(false);
  }, [weekStart]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    return { day, items: items.filter((it) => sameDay(new Date(it.starts_at), day)) };
  }), [weekStart, items]);

  const isThisWeek = sameDay(weekStart, startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);
  const bookedCount = items.filter((i) => i.status === 'booked').length;
  const pendingCount = items.length - bookedCount;
  const weekKinds = [...new Set(items.flatMap(itemKinds))];

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
            {!loading && ` · ${bookedCount} booked${pendingCount ? ` · ${pendingCount} pending` : ''}`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setWeekStart(addDays(weekStart, 7))} className="p-2 active:opacity-60">
          <Ionicons name="chevron-forward-circle-outline" size={26} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
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
          days.map(({ day, items: dayItems }) => {
            const today = sameDay(day, new Date());
            return (
              <View key={day.toISOString()} className="mb-3">
                <Text className={`text-xs font-semibold uppercase tracking-wider mb-1.5 ml-1 ${today ? 'text-rally-600' : 'text-stone'}`}>
                  {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{today ? ' · Today' : ''}
                </Text>
                {dayItems.length === 0 ? (
                  <Text className="text-xs text-stone/70 dark:text-parchment/60 ml-1 mb-1">No lessons</Text>
                ) : dayItems.map((item) => {
                  const open = expanded === item.slot_id;
                  const pending = item.status === 'pending';
                  const types = [...new Set(item.attendees.map((a) => a.session_type).filter(Boolean))].join(' / ');
                  const kinds = itemKinds(item);
                  const kindStyle = sessionKindStyle(kinds.length === 1 ? kinds[0] : null);
                  return (
                    <Pressable
                      key={item.slot_id}
                      onPress={() => { tapLight(); setExpanded(open ? null : item.slot_id); }}
                      className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 active:opacity-90"
                      style={{ borderLeftWidth: 4, borderLeftColor: kindStyle.color, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                    >
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: kindStyle.color + '15' }}>
                          <Ionicons name={kindStyle.icon} size={18} color={kindStyle.color} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-bark dark:text-cream">
                            {fmtTime(item.starts_at)} – {fmtTime(item.ends_at)} · {summary(item)}
                          </Text>
                          <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                            {[types, item.facility_label].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <View className={`px-2 py-1 rounded-md ${pending ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                          <Text className={`text-[10px] font-bold ${pending ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                            {pending ? 'PENDING' : item.seats_total > 1 ? `${item.attendees.filter((a) => a.kind === 'booking').length}/${item.seats_total}` : 'BOOKED'}
                          </Text>
                        </View>
                      </View>

                      {open && (
                        <View className="mt-3 pt-3 border-t border-parchment dark:border-rally-900">
                          {item.facility_address ? (
                            <Text className="text-xs text-stone dark:text-parchment mb-2">{item.facility_address}</Text>
                          ) : null}
                          {item.attendees.map((a) => (
                            <View key={a.id} className="mb-2.5">
                              <Text className="text-sm font-semibold text-bark dark:text-cream">
                                {a.athlete_name}
                                {a.kind === 'request' ? <Text className="text-xs font-normal text-amber-700"> · awaiting your reply</Text> : null}
                              </Text>
                              {a.parent_name ? <Text className="text-xs text-stone dark:text-parchment">Parent: {a.parent_name}</Text> : null}
                              {a.notes ? <Text className="text-xs text-bark dark:text-cream mt-0.5">Work on: {a.notes}</Text> : null}
                              {(a.film_links ?? []).map((url) => (
                                <Pressable key={url} onPress={() => Linking.openURL(url)}>
                                  <Text className="text-xs text-rally-600 underline mt-0.5" numberOfLines={1}>{url}</Text>
                                </Pressable>
                              ))}
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
                    </Pressable>
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
