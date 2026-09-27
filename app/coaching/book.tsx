import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import {
  fetchSlot, fetchSessionTypes, requestBooking, notifyCoachOfRequest, isSupabaseConfigured,
  fetchCoachPolicies, hasAcceptedCoachPolicies, acceptCoachPolicies, fetchAthleteHealth, saveAthleteHealth,
  type SlotWithRefs, type CoachPolicies,
} from '@/lib/coach';
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
  // Health & safety (saved to the athlete, pre-filled next time)
  const [allergies, setAllergies] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  // Coach terms + release + RallyHUB platform terms (once per coach/athlete/version)
  const [policies, setPolicies] = useState<CoachPolicies | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeRelease, setAgreeRelease] = useState(false);
  const [signer, setSigner] = useState('');
  const [openDoc, setOpenDoc] = useState<string | null>(null);
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

  useEffect(() => {
    if (coachId && isSupabaseConfigured) fetchCoachPolicies(coachId).then(({ data }) => setPolicies(data));
  }, [coachId]);

  useEffect(() => {
    if (!athleteId || !coachId || !isSupabaseConfigured) return;
    setAccepted(null);
    hasAcceptedCoachPolicies(coachId, athleteId).then(setAccepted);
    fetchAthleteHealth(athleteId).then((h) => {
      setAllergies(h?.allergies ?? '');
      setMedicalNotes(h?.medical_notes ?? '');
      setEcName(h?.emergency_contact_name ?? '');
      setEcPhone(h?.emergency_contact_phone ?? '');
    });
  }, [athleteId, coachId]);

  const showAlert = (t: string, m: string, onOk?: () => void) => {
    if (Platform.OS === 'web') { window.alert(`${t}: ${m}`); onOk?.(); }
    else Alert.alert(t, m, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  };

  const selectedType = types.find((t) => t.id === sessionTypeId);

  const handleSubmit = async () => {
    if (!athleteId) { showAlert('Pick an athlete', 'Choose who this lesson is for.'); notifyError(); return; }
    if (!sessionTypeId) { showAlert('Pick a session type', 'Choose what to book.'); notifyError(); return; }
    if (!allergies.trim()) { showAlert('Allergies', 'List any allergies, or type "None".'); notifyError(); return; }
    if (!ecName.trim() || !ecPhone.trim()) { showAlert('Emergency contact', 'Add an emergency contact name and phone.'); notifyError(); return; }
    if (!accepted) {
      if (!agreeTerms || !agreeRelease) { showAlert('Terms & release', 'Please accept the lesson terms and the release to continue.'); notifyError(); return; }
      if (signer.trim().length < 2) { showAlert('Signature', 'Type your full name to sign.'); notifyError(); return; }
    }

    const filmLinks = film.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      const health = await saveAthleteHealth(athleteId, {
        allergies, medical_notes: medicalNotes, emergency_contact_name: ecName, emergency_contact_phone: ecPhone,
      });
      if (health.error) { showAlert("Couldn't save health info", health.error.message); notifyError(); return; }
      if (!accepted) {
        const acc = await acceptCoachPolicies(coachId!, athleteId, signer);
        if (acc.error) { showAlert("Couldn't record your signature", acc.error.message); notifyError(); return; }
        setAccepted(true);
      }
      const { data, error } = await requestBooking({ slotId: slotId!, sessionTypeId, athleteId, notes: notes.trim() || null, filmLinks });
      if (error) {
        const msg = error.message.includes('COACH_NOT_READY')
          ? "This coach hasn't finished setting up bookings yet. Let them know, and try again soon."
          : error.message.replace(/^[A-Z_]+: /, '');
        showAlert("Couldn't send request", msg); notifyError(); return;
      }
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

            {/* Health & safety */}
            <View className="flex-row items-center mt-2 mb-2">
              <Ionicons name="medkit" size={16} color="#dc2626" />
              <Text className="text-sm font-bold text-bark dark:text-cream ml-1.5">Health & safety</Text>
            </View>
            <Text className="text-xs text-stone dark:text-parchment mb-3">
              Shared with this coach so they can act fast in an emergency. Saved to {athletes.find((a) => a.id === athleteId)?.first_name ?? 'the athlete'}'s profile.
            </Text>
            <FormField label="Allergies (required)" value={allergies} onChangeText={setAllergies} placeholder='e.g. peanuts, bee stings — or "None"' />
            <FormField label="Medical conditions or notes (optional)" value={medicalNotes} onChangeText={setMedicalNotes} placeholder="e.g. asthma (inhaler in bag), recent ankle sprain" multiline style={{ minHeight: 50, textAlignVertical: 'top' }} />
            <View className="flex-row gap-3">
              <View className="flex-1"><FormField label="Emergency contact" value={ecName} onChangeText={setEcName} placeholder="Name" /></View>
              <View className="flex-1"><FormField label="Their phone" value={ecPhone} onChangeText={setEcPhone} placeholder="(512) 555-0100" keyboardType="phone-pad" /></View>
            </View>

            {/* Terms, release, platform terms */}
            {accepted ? (
              <View className="flex-row items-center rounded-lg px-3 py-2 mb-4" style={{ backgroundColor: '#16a34a14' }}>
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text className="text-xs font-semibold ml-1.5" style={{ color: '#16a34a' }}>You've accepted this coach's terms and release.</Text>
              </View>
            ) : policies ? (
              <View className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 border border-parchment dark:border-rally-900">
                <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Terms & release</Text>
                <Text className="text-xs text-stone dark:text-parchment mb-2">Read and accept once for this coach. We'll ask again only if they change.</Text>
                {[
                  { id: 'terms', title: 'Lesson Terms', text: policies.terms },
                  { id: 'release', title: 'Participant Release', text: policies.release },
                  { id: 'platform', title: 'RallyHUB Platform Terms', text: policies.platform },
                ].map((d) => (
                  <View key={d.id}>
                    <Pressable onPress={() => setOpenDoc(openDoc === d.id ? null : d.id)} className="flex-row items-center py-1.5">
                      <Ionicons name={openDoc === d.id ? 'chevron-down' : 'chevron-forward'} size={14} color="#3B82B0" />
                      <Text className="text-xs font-semibold text-rally-600 ml-1">{d.title}</Text>
                    </Pressable>
                    {openDoc === d.id && (
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} className="bg-warm-white dark:bg-bark rounded-lg p-3 mb-1 border border-parchment dark:border-rally-900">
                        <Text className="text-xs leading-5 text-bark dark:text-cream">{d.text}</Text>
                      </ScrollView>
                    )}
                  </View>
                ))}
                <Pressable onPress={() => setAgreeTerms(!agreeTerms)} className="flex-row items-start mt-2 active:opacity-80">
                  <Ionicons name={agreeTerms ? 'checkbox' : 'square-outline'} size={22} color={agreeTerms ? '#3B82B0' : '#8FA8BF'} />
                  <Text className="text-xs text-bark dark:text-cream ml-2 flex-1">I agree to the coach's Lesson Terms and the RallyHUB Platform Terms.</Text>
                </Pressable>
                <Pressable onPress={() => setAgreeRelease(!agreeRelease)} className="flex-row items-start mt-2 active:opacity-80">
                  <Ionicons name={agreeRelease ? 'checkbox' : 'square-outline'} size={22} color={agreeRelease ? '#3B82B0' : '#8FA8BF'} />
                  <Text className="text-xs text-bark dark:text-cream ml-2 flex-1">
                    I am {athletes.find((a) => a.id === athleteId)?.first_name ?? 'the athlete'}'s parent or legal guardian, and I accept the Participant Release for {athletes.find((a) => a.id === athleteId)?.first_name ?? 'the athlete'} and myself.
                  </Text>
                </Pressable>
                <Text className="text-xs text-stone mt-3 mb-1">Type your full name to sign</Text>
                <TextInput
                  value={signer}
                  onChangeText={setSigner}
                  placeholder="Full legal name"
                  placeholderTextColor="#8FA8BF"
                  autoCapitalize="words"
                  className="bg-warm-white dark:bg-bark rounded-lg px-3 py-2.5 text-base text-bark dark:text-cream border border-parchment dark:border-rally-900"
                  style={{ fontStyle: signer ? 'italic' : 'normal' }}
                />
              </View>
            ) : (
              <ActivityIndicator color="#3B82B0" className="mb-4" />
            )}

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
