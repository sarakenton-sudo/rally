import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Share, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/providers/AuthProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import Avatar from '@/components/Avatar';
import { showToast } from '@/components/Toast';
import {
  fetchMyCoaches, fetchMyLessonHistory, fetchBookableSlots, connectToCoach, isSupabaseConfigured,
} from '@/lib/coach';
import { connectViaBookingPage } from '@/lib/bookingPage';
import { findLessonPattern, type RebookSuggestion } from '@/lib/plusSheet';
import { COACH_INVITE_URL } from '@/lib/config';
import { trackEvent } from '@/lib/track-event';
import { useIconColors } from '@/lib/colors';
import { tapLight, notifyError, notifySuccess } from '@/lib/haptics';
import type { Coach } from '@/types/database';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmtHour = (h: number, m: number) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;

/**
 * "Book a lesson" from the + sheet (spec §3.3). One entry that branches:
 *  A) family has coaches → Rebook suggestion + coach list + invite another
 *  B) no coaches → Invite your coach (primary) / Have a coach link? (secondary)
 * No coach discovery in v1.
 */
export default function LessonsEntryScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const athletes = useSeasonStore((s) => s.athletes);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [rebook, setRebook] = useState<RebookSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const track = (event: string, props: Record<string, unknown> = {}) => { if (user) trackEvent(user.id, event, props); };

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [c, history] = await Promise.all([fetchMyCoaches(), fetchMyLessonHistory()]);
    setCoaches(c.data);
    setRebook(c.data.length ? findLessonPattern(history, new Date()) : null);
    setLoading(false);
    track('lesson_entry_opened', { has_coach: c.data.length > 0 });
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const athleteFirst = athletes.length === 1 ? athletes[0].first_name : athletes.length > 1 ? athletes.map((a) => a.first_name).join(' and ') : 'our athlete';
  const inviteMessage = `Hey Coach — we use RallyHUB to manage ${athleteFirst}'s season. You can take lesson bookings and payments there. Here's the link: ${COACH_INVITE_URL}`;

  const inviteCoach = async () => {
    tapLight();
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(inviteMessage);
      showToast('Invite copied — paste it into a text to your coach');
      track('coach_invite_sent', { channel: 'copy' });
      return;
    }
    const r = await Share.share({ message: inviteMessage });
    if (r.action === Share.sharedAction) track('coach_invite_sent', { channel: r.activityType ?? 'share' });
  };

  // Accepts a booking-page URL (…/book/<slug>) or a coach's client code.
  const enterLink = async () => {
    const v = link.trim();
    if (!v) return;
    setBusy(true);
    const slug = v.match(/\/book\/([a-z0-9-]+)/i)?.[1];
    let coachId: string | null = null;
    let err: Error | null = null;
    if (slug) {
      const r = await connectViaBookingPage(slug);
      coachId = r.coachId; err = r.error;
    } else {
      const r = await connectToCoach(v);
      coachId = r.data?.coach_id ?? null; err = r.error;
    }
    setBusy(false);
    track('coach_link_entered', { kind: slug ? 'url' : 'code', success: !!coachId });
    if (!coachId) { notifyError(); showToast(err?.message?.replace(/^.*?: /, '') ?? "That link or code didn't work"); return; }
    notifySuccess();
    setLink('');
    router.push({ pathname: '/coaching/[coachId]', params: { coachId } });
  };

  const doRebook = async () => {
    if (!rebook) return;
    tapLight();
    track('rebook_tapped', { coach_id: rebook.coachId });
    setBusy(true);
    const { data } = await fetchBookableSlots(rebook.coachId);
    setBusy(false);
    const target = rebook.hour * 60 + rebook.minute;
    const match = data.find((s) => {
      const d = new Date(s.starts_at);
      const ids = s.eligible_session_type_ids ?? [];
      return d.getDay() === rebook.weekday
        && Math.abs(d.getHours() * 60 + d.getMinutes() - target) <= 60
        && (!rebook.sessionTypeId || ids.length === 0 || ids.includes(rebook.sessionTypeId));
    });
    if (match) {
      router.push({ pathname: '/coaching/book', params: { slotId: match.id, coachId: rebook.coachId } });
    } else {
      showToast(`Your usual time is taken — here are ${rebook.coachName}'s open times`);
      router.push({ pathname: '/coaching/[coachId]', params: { coachId: rebook.coachId } });
    }
  };

  const LinkEntry = (
    <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900">
      <Text className="text-sm font-bold text-bark dark:text-cream">Have a coach link?</Text>
      <Text className="text-xs text-stone dark:text-parchment mt-0.5 mb-2">Paste their RallyHUB page link or enter their code.</Text>
      <View className="flex-row items-center">
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="rally-hub.com/book/… or code"
          placeholderTextColor="#8FA8BF"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          onSubmitEditing={enterLink}
          className="flex-1 bg-cream dark:bg-bark rounded-lg px-3 py-2.5 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
        />
        <Pressable disabled={busy || !link.trim()} onPress={enterLink} className={`ml-2 rounded-lg px-4 py-2.5 ${link.trim() ? 'bg-rally-600' : 'bg-parchment'}`}>
          <Text className="text-sm font-semibold text-cream">{busy ? '…' : 'Go'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Book a lesson</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : coaches.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {rebook && (
            <Pressable
              onPress={doRebook}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Rebook lesson with ${rebook.coachName}, ${WEEKDAY_LONG[rebook.weekday]} ${fmtHour(rebook.hour, rebook.minute)}`}
              className="rounded-2xl p-4 mb-4 flex-row items-center active:opacity-80"
              style={{ backgroundColor: '#3B82B0' }}
            >
              <Ionicons name="repeat" size={22} color="#fff" />
              <View className="flex-1 ml-3">
                <Text className="text-base font-bold text-white">Rebook {rebook.coachName}</Text>
                <Text className="text-xs text-white/90">{WEEKDAY[rebook.weekday]} {fmtHour(rebook.hour, rebook.minute)} · your usual time</Text>
              </View>
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="chevron-forward" size={20} color="#fff" />}
            </Pressable>
          )}

          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Your coaches</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl border border-parchment dark:border-rally-900 mb-3">
            {coaches.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/coaching/[coachId]', params: { coachId: c.id } })}
                className={`flex-row items-center px-4 py-3 active:opacity-70 ${i ? 'border-t border-parchment dark:border-rally-900' : ''}`}
                accessibilityLabel={`Book with ${c.display_name}`}
              >
                <Avatar uri={c.photo_url} name={c.display_name} size={40} colorKey={c.id} />
                <Text className="text-sm font-semibold text-bark dark:text-cream ml-3 flex-1">{c.display_name}</Text>
                <Text className="text-xs font-semibold text-rally-600 mr-1">Book</Text>
                <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => router.push('/coaching/availability')} className="flex-row items-center justify-center py-2 mb-5 active:opacity-70">
            <Ionicons name="calendar-outline" size={15} color="#3B82B0" />
            <Text className="text-sm font-semibold text-rally-600 ml-1.5">See every open time</Text>
          </Pressable>

          {LinkEntry}
          <Pressable onPress={inviteCoach} className="items-center py-4 active:opacity-70">
            <Text className="text-sm font-semibold text-rally-600">Invite another coach</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View className="items-center mt-4 mb-6">
            <View className="w-16 h-16 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#3B82B01a' }}>
              <Ionicons name="person-add-outline" size={28} color="#3B82B0" />
            </View>
            <Text className="text-xl font-bold text-bark dark:text-cream text-center">Book lessons with your coach</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
              Lessons land on the same calendar as tournaments, and you pay right here.
            </Text>
          </View>
          <Pressable onPress={inviteCoach} className="bg-rally-600 rounded-xl py-3.5 items-center mb-5 active:opacity-80" accessibilityLabel="Invite your coach">
            <Text className="text-base font-bold text-cream">Invite your coach</Text>
          </Pressable>
          {LinkEntry}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
