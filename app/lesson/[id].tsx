import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/Avatar';
import { showToast } from '@/components/Toast';
import {
  fetchParentLesson, fetchBookableSlots, sessionKindStyle, canFamilyChangeLesson, LESSON_CHANGE_CUTOFF_HOURS,
  parentCancelBooking, parentProposeReschedule, parentWithdrawReschedule, respondToReschedule,
  type ParentLesson, type SlotWithRefs,
} from '@/lib/coach';
import { addTimedEventToCalendar } from '@/lib/calendar';
import { withAthlete } from '@/lib/calendarFormat';
import { openDirections } from '@/lib/maps';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';
import type { Coach } from '@/types/database';

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtShort = (iso: string) => `${new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(iso)}`;

/** Parent's lesson detail: where, when, directions, calendar, cancel / reschedule. */
export default function LessonDetailScreen() {
  const ic = useIconColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<ParentLesson | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'none' | 'cancel' | 'reschedule'>('none');
  const [note, setNote] = useState('');
  const [options, setOptions] = useState<SlotWithRefs[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await fetchParentLesson(id);
    setLesson(r.data);
    setCoach(r.coach);
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn: () => Promise<{ error: Error | null }>, ok: string) => {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) { notifyError(); setError(e.message); return; }
    notifySuccess();
    showToast(ok);
    setMode('none'); setNote(''); setTarget(null);
    load();
  };

  const openReschedule = async () => {
    tapLight();
    setMode('reschedule');
    setError(null);
    if (options || !lesson) return;
    const { data } = await fetchBookableSlots(lesson.coach_id);
    setOptions(data.filter((s) => s.starts_at !== lesson.starts_at).slice(0, 16));
  };

  if (loading || !lesson) {
    return (
      <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
        <Header ic={ic} />
        {loading ? <ActivityIndicator color="#3B82B0" className="mt-8" /> : (
          <Text className="text-sm text-stone text-center mt-10">This lesson isn't available.</Text>
        )}
      </SafeAreaView>
    );
  }

  const st = sessionKindStyle(lesson.session_kind);
  const off = lesson.status === 'cancelled' || lesson.status === 'declined';
  const past = Date.parse(lesson.ends_at) < Date.now();
  const confirmed = lesson.status === 'accepted' && !!lesson.booking_id;
  const changeable = confirmed && !past && canFamilyChangeLesson(lesson.starts_at);
  const address = lesson.facility_address || '';
  const coachPhone = (coach as any)?.phone as string | null | undefined;

  const statusLabel = off
    ? lesson.status === 'cancelled' ? `Cancelled${lesson.cancelled_by === 'parent' ? ' by you' : lesson.cancelled_by === 'coach' ? ' by the coach' : ''}` : 'Declined'
    : lesson.status === 'accepted' ? 'Confirmed' : 'Waiting for the coach to confirm';

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <Header ic={ic} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Summary */}
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900" style={{ borderLeftWidth: 4, borderLeftColor: off ? '#dc2626' : st.color }}>
            <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: off ? '#dc2626' : st.color }}>{statusLabel}</Text>
            <Text className={`text-xl font-bold text-bark dark:text-cream mt-1 ${off ? 'line-through' : ''}`}>
              {lesson.session_type ?? st.label}{lesson.athlete_first_name ? ` · ${lesson.athlete_first_name}` : ''}
            </Text>
            <Text className="text-sm text-bark dark:text-cream mt-1">{fmtDay(lesson.starts_at)}</Text>
            <Text className="text-sm text-stone dark:text-parchment">{fmtTime(lesson.starts_at)} – {fmtTime(lesson.ends_at)}</Text>
            {lesson.change_reason ? (
              <Text className="text-xs mt-2 italic" style={{ color: off ? '#dc2626' : '#b45309' }}>"{lesson.change_reason}"</Text>
            ) : null}
          </View>

          {/* Pending move */}
          {lesson.proposal && !off ? (
            <View className="rounded-2xl p-4 mt-3" style={{ backgroundColor: '#FEF3C7' }}>
              {lesson.proposal.by === 'coach' ? (
                <>
                  <Text className="text-sm font-semibold text-bark">{lesson.coach_name} asked to move this lesson</Text>
                  <Text className="text-xs text-stone mt-0.5">New time: <Text className="font-bold text-bark">{fmtShort(lesson.proposal.starts_at)}</Text></Text>
                  <View className="flex-row mt-3" style={{ gap: 8 }}>
                    <Pressable disabled={busy} onPress={() => run(() => respondToReschedule(lesson.booking_id!, true), 'Lesson moved — your coach has been told')} className="rounded-lg px-3 py-2 bg-rally-600 active:opacity-80" accessibilityLabel="Accept new time">
                      <Text className="text-xs font-bold text-white">Accept new time</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => run(() => respondToReschedule(lesson.booking_id!, false), 'Original time kept — your coach has been told')} className="rounded-lg px-3 py-2 border border-parchment active:opacity-70" style={{ backgroundColor: '#fff' }} accessibilityLabel="Keep original">
                      <Text className="text-xs font-bold text-bark">Keep original</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text className="text-sm font-semibold text-bark">You asked to move this lesson</Text>
                  <Text className="text-xs text-stone mt-0.5">To {fmtShort(lesson.proposal.starts_at)} · waiting for {lesson.coach_name}. Until then it stays at the time above.</Text>
                  <Pressable disabled={busy} onPress={() => run(() => parentWithdrawReschedule(lesson.booking_id!), 'Request withdrawn')} className="mt-2 self-start">
                    <Text className="text-xs font-semibold text-stone underline">Withdraw request</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}

          {/* Coach */}
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-3 border border-parchment dark:border-rally-900 flex-row items-center">
            <Avatar uri={coach?.photo_url ?? null} name={lesson.coach_name} size={44} colorKey={lesson.coach_id} />
            <View className="flex-1 ml-3">
              <Text className="text-xs text-stone">Coach</Text>
              <Text className="text-base font-semibold text-bark dark:text-cream">{lesson.coach_name}</Text>
            </View>
            {coachPhone ? (
              <Pressable onPress={() => Linking.openURL(`sms:${coachPhone}`)} className="p-2" accessibilityLabel={`Text ${lesson.coach_name}`}>
                <Ionicons name="chatbubble-outline" size={20} color="#3B82B0" />
              </Pressable>
            ) : null}
          </View>

          {/* Where */}
          <Pressable
            disabled={!address}
            onPress={() => openDirections(address)}
            className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-3 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={address ? `Directions to ${lesson.facility ?? address}` : 'Location'}
          >
            <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B015' }}>
              <Ionicons name="location" size={20} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">{lesson.facility ?? 'Location to be confirmed'}</Text>
              {address ? <Text className="text-xs text-rally-600 mt-0.5 underline">{address}</Text> : <Text className="text-xs text-stone mt-0.5">Your coach hasn't added an address.</Text>}
            </View>
            {address ? <Text className="text-xs font-bold text-rally-600 ml-2">Directions</Text> : null}
          </Pressable>
          {address && Platform.OS === 'ios' ? (
            <Pressable onPress={() => openDirections(address, { forceAsk: true })} className="self-end mt-1 mr-1">
              <Text className="text-[11px] text-stone underline">Change maps app</Text>
            </Pressable>
          ) : null}

          {/* Calendar */}
          {!off ? (
            <Pressable
              onPress={() => addTimedEventToCalendar({
                title: withAthlete(lesson.athlete_first_name, `${lesson.session_type ?? 'Lesson'} with ${lesson.coach_name}`),
                start: lesson.starts_at, end: lesson.ends_at, location: [lesson.facility, address].filter(Boolean).join(', ') || null,
              })}
              className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-3 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
            >
              <Ionicons name="calendar-outline" size={20} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-600 ml-3">Add to calendar</Text>
            </Pressable>
          ) : null}

          {/* Change the lesson */}
          {confirmed && !past && !off ? (
            changeable ? (
              mode === 'none' ? (
                <View className="flex-row mt-4" style={{ gap: 8 }}>
                  {!lesson.proposal ? (
                    <Pressable onPress={openReschedule} className="flex-1 rounded-xl py-3 items-center bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
                      <Text className="text-sm font-semibold text-rally-600">Reschedule</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => { tapLight(); setMode('cancel'); setError(null); }} className="flex-1 rounded-xl py-3 items-center bg-red-50 dark:bg-red-900/20 active:opacity-70">
                    <Text className="text-sm font-semibold text-red-600">Cancel lesson</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="mt-4 rounded-2xl p-4 border border-parchment dark:border-rally-900 bg-warm-white dark:bg-bark-light">
                  {mode === 'reschedule' ? (
                    <>
                      <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Ask {lesson.coach_name} for a new time</Text>
                      <Text className="text-xs text-stone mb-2">Your lesson stays at its current time until your coach accepts.</Text>
                      {options === null ? <ActivityIndicator color="#3B82B0" /> : options.length === 0 ? (
                        <Text className="text-xs text-stone mb-2">{lesson.coach_name} has no other open times right now.</Text>
                      ) : (
                        <View className="flex-row flex-wrap mb-1">
                          {options.map((o) => {
                            const on = target === o.id;
                            return (
                              <Pressable key={o.id} onPress={() => setTarget(o.id)} className={`rounded-lg px-2.5 py-1.5 mr-1.5 mb-1.5 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`}>
                                <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>{fmtShort(o.starts_at)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Cancel this lesson?</Text>
                      <Text className="text-xs text-stone mb-2">{lesson.coach_name} is notified and the time opens up. Anything you paid in RallyHUB is refunded.</Text>
                    </>
                  )}
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={`Note for ${lesson.coach_name} (optional)`}
                    placeholderTextColor="#8FA8BF"
                    className="bg-cream dark:bg-bark rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
                  />
                  {error ? <Text className="text-xs text-red-600 mt-2">{error}</Text> : null}
                  <View className="flex-row mt-3" style={{ gap: 8 }}>
                    {mode === 'reschedule' ? (
                      <Pressable
                        disabled={busy || !target}
                        onPress={() => target && run(() => parentProposeReschedule(lesson.booking_id!, target, note), `Sent — ${lesson.coach_name} will accept or keep the original`)}
                        className={`rounded-lg px-4 py-2.5 ${target ? 'bg-rally-600 active:opacity-80' : 'bg-parchment'}`}
                      >
                        <Text className="text-xs font-bold text-white">{busy ? 'Sending…' : 'Ask coach'}</Text>
                      </Pressable>
                    ) : (
                      <Pressable disabled={busy} onPress={() => run(() => parentCancelBooking(lesson.booking_id!, note), 'Lesson cancelled — your coach has been told')} className="rounded-lg px-4 py-2.5 bg-red-600 active:opacity-80">
                        <Text className="text-xs font-bold text-white">{busy ? 'Cancelling…' : 'Cancel lesson'}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => { setMode('none'); setNote(''); setTarget(null); setError(null); }} className="rounded-lg px-3 py-2.5">
                      <Text className="text-xs font-semibold text-stone">Never mind</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ) : (
              <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#3B82B010' }}>
                <Text className="text-sm font-semibold text-bark dark:text-cream">Need to change this lesson?</Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  It's less than {LESSON_CHANGE_CUTOFF_HOURS} hours away, so contact {lesson.coach_name} directly.
                </Text>
                {coachPhone ? (
                  <View className="flex-row mt-3" style={{ gap: 8 }}>
                    <Pressable onPress={() => Linking.openURL(`sms:${coachPhone}`)} className="rounded-lg px-3 py-2 bg-rally-600 active:opacity-80">
                      <Text className="text-xs font-bold text-white">Text {lesson.coach_name}</Text>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL(`tel:${coachPhone}`)} className="rounded-lg px-3 py-2 border border-parchment active:opacity-70">
                      <Text className="text-xs font-bold text-bark dark:text-cream">Call</Text>
                    </Pressable>
                    <Text className="text-xs text-stone self-center">{coachPhone}</Text>
                  </View>
                ) : null}
              </View>
            )
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ ic }: { ic: ReturnType<typeof useIconColors> }) {
  return (
    <>
    {/* Own header — hide the stack's default one (it showed "< (tabs)"). */}
    <Stack.Screen options={{ headerShown: false }} />
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} className="p-1" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color={ic.muted} />
      </Pressable>
      <Text className="text-lg font-bold text-bark dark:text-cream">Lesson</Text>
      <View className="w-6" />
    </View>
    </>
  );
}
