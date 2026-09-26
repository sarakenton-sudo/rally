import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { fetchSlot, fetchSessionTypes, requestBooking, notifyCoachOfRequest, isSupabaseConfigured, type SlotWithRefs } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { SessionType } from '@/types/database';

const athleteName = (a: { first_name: string; last_name: string | null }) =>
  `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`;

export default function BookScreen() {
  const ic = useIconColors();
  const { slotId, coachId } = useLocalSearchParams<{ slotId: string; coachId: string }>();
  const athletes = useSeasonStore((s) => s.athletes);

  const [slot, setSlot] = useState<SlotWithRefs | null>(null);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);

  const [sessionTypeId, setSessionTypeId] = useState<string | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(athletes[0]?.id ?? null);
  const [notes, setNotes] = useState('');
  const [film, setFilm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!slotId || !coachId || !isSupabaseConfigured) { setLoading(false); return; }
      const [sl, t] = await Promise.all([fetchSlot(slotId), fetchSessionTypes(coachId)]);
      setSlot(sl.data);
      const active = t.data.filter((x) => x.is_active);
      const eligibleIds = sl.data?.eligible_session_type_ids ?? [];
      const eligible = eligibleIds.length ? active.filter((x) => eligibleIds.includes(x.id)) : active;
      setTypes(eligible);
      if (eligible.length) setSessionTypeId(eligible[0].id);
      setLoading(false);
    })();
  }, [slotId, coachId]);

  const showAlert = (t: string, m: string, onOk?: () => void) => {
    if (Platform.OS === 'web') { window.alert(`${t}: ${m}`); onOk?.(); }
    else Alert.alert(t, m, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  };

  const selectedType = types.find((t) => t.id === sessionTypeId);

  const handleSubmit = async () => {
    if (!athleteId) { showAlert('Pick an athlete', 'Choose who this lesson is for.'); notifyError(); return; }
    if (!sessionTypeId) { showAlert('Pick a session type', 'Choose what to book.'); notifyError(); return; }
    if (!agreed) { showAlert('Agree to terms', 'Please accept the terms & liability waiver to continue.'); notifyError(); return; }

    const filmLinks = film.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      const { data, error } = await requestBooking({ slotId: slotId!, sessionTypeId, athleteId, notes: notes.trim() || null, filmLinks });
      if (error) { showAlert("Couldn't send request", error.message); notifyError(); return; }
      if (data?.request_id) notifyCoachOfRequest(data.request_id);
      notifySuccess();
      showAlert('Request sent', "The coach gets your athlete's info and film — you'll hear back soon.", () => router.back());
    } finally {
      setSubmitting(false);
    }
  };

  const fmtWhen = slot
    ? new Date(slot.starts_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) +
      ' · ' + new Date(slot.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Request a Lesson</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || loading}
            className={`px-4 py-1.5 rounded-lg ${submitting || loading ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{submitting ? 'Sending...' : 'Request'}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-8" />
        ) : (
          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
            {/* Slot summary */}
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm font-bold text-rally-600">{fmtWhen}</Text>
              {!!slot?.facilities?.label && <Text className="text-xs text-stone dark:text-parchment mt-0.5">{slot.facilities.label}</Text>}
            </View>

            {/* Session type */}
            {types.length > 1 ? (
              <DropdownField
                label="Session type"
                value={selectedType ? `${selectedType.name} — $${(selectedType.price_cents / 100).toFixed(0)}` : ''}
                options={types.map((t) => `${t.name} — $${(t.price_cents / 100).toFixed(0)}`)}
                onChange={(label) => setSessionTypeId(types.find((t) => `${t.name} — $${(t.price_cents / 100).toFixed(0)}` === label)?.id ?? null)}
              />
            ) : selectedType ? (
              <View className="mb-4">
                <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Session type</Text>
                <View className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
                  <Text className="text-base text-bark dark:text-cream">{selectedType.name} — ${(selectedType.price_cents / 100).toFixed(0)}</Text>
                </View>
              </View>
            ) : null}

            {/* Athlete */}
            {athletes.length === 0 ? (
              <View className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4 flex-row items-start">
                <Ionicons name="alert-circle" size={15} color="#B8924A" style={{ marginTop: 1 }} />
                <Text className="text-xs text-amber-700 dark:text-amber-300 ml-1.5 flex-1">Add an athlete first (Athletes tab) — a lesson is booked for a specific athlete.</Text>
              </View>
            ) : athletes.length === 1 ? (
              <View className="mb-4">
                <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Athlete</Text>
                <View className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
                  <Text className="text-base text-bark dark:text-cream">{athleteName(athletes[0])}</Text>
                </View>
              </View>
            ) : (
              <DropdownField
                label="Athlete"
                value={athleteId ? athleteName(athletes.find((a) => a.id === athleteId)!) : ''}
                options={athletes.map(athleteName)}
                onChange={(name) => setAthleteId(athletes.find((a) => athleteName(a) === name)?.id ?? null)}
              />
            )}

            <FormField
              label="What do you want to work on? (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. serve receive and setting consistency"
              multiline
              numberOfLines={3}
              style={{ minHeight: 70, textAlignVertical: 'top' }}
            />
            <FormField
              label="Film links (optional)"
              value={film}
              onChangeText={setFilm}
              placeholder="Paste YouTube/Hudl links, one per line"
              multiline
              numberOfLines={2}
              autoCapitalize="none"
              style={{ minHeight: 50, textAlignVertical: 'top' }}
            />

            {/* Terms */}
            <Pressable onPress={() => setAgreed(!agreed)} className="flex-row items-start mb-4 active:opacity-80">
              <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? '#3B82B0' : '#8FA8BF'} />
              <Text className="text-xs text-stone dark:text-parchment ml-2 flex-1">
                I agree to RALLY's terms, the participation/liability waiver, and the coach's cancellation policy.
              </Text>
            </Pressable>

            <View className="bg-cream dark:bg-bark-light rounded-lg px-3 py-2 mb-6 flex-row items-start">
              <Ionicons name="information-circle" size={15} color={ic.muted} style={{ marginTop: 1 }} />
              <Text className="text-xs text-stone dark:text-parchment ml-1.5 flex-1">
                You're sending a request — the coach reviews it before it's confirmed. Payment will be added in a later step.
              </Text>
            </View>
            <View className="h-8" />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
