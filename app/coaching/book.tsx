import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { PAYMENTS_ENABLED } from '@/lib/config';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import {
  fetchSlot, fetchSessionTypes, requestBooking, notifyCoachOfRequest, isSupabaseConfigured,
  fetchCoachPolicies, hasAcceptedCoachPolicies, acceptCoachPolicies, fetchAthleteHealth, saveAthleteHealth, fetchCoachById, fmtMoney,
  type SlotWithRefs, type CoachPolicies,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { createLessonAthlete } from '@/lib/bookingPage';
import {
  getPaymentMethod, addPaymentMethod, confirmPaymentMethod, describePaymentMethod, getPlatformFeeBps,
  type SavedPaymentMethod,
} from '@/lib/payments';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { SessionType } from '@/types/database';

const athleteName = (a: { first_name: string; last_name: string | null }) =>
  `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`;

export default function BookScreen() {
  const ic = useIconColors();
  const { slotId, coachId, pm_setup, session_id } = useLocalSearchParams<{ slotId: string; coachId: string; pm_setup?: string; session_id?: string }>();
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
  const [newAthlete, setNewAthlete] = useState({ firstName: '', lastName: '', gradYear: '', position: '', club: '' });
  const [addingAthlete, setAddingAthlete] = useState(false);
  const [showAddAthlete, setShowAddAthlete] = useState(athletes.length === 0);
  // Inline, always-visible validation (Alert buttons don't work on the web).
  const [formError, setFormError] = useState<string | null>(null);
  // Athletes can load after the screen opens: pick the first and close the add form
  // unless the parent already started typing a new athlete.
  useEffect(() => {
    if (athleteId || !athletes.length) return;
    setAthleteId(athletes[0].id);
    if (!newAthlete.firstName.trim()) setShowAddAthlete(false);
  }, [athletes.length]);

  const addAthlete = async () => {
    if (!newAthlete.firstName.trim()) { showAlert('Athlete', "Enter your athlete's first name."); notifyError(); return; }
    setAddingAthlete(true);
    const { athleteId: id, error } = await createLessonAthlete(newAthlete);
    setAddingAthlete(false);
    if (error || !id) { showAlert("Couldn't add athlete", error?.message ?? 'Try again.'); notifyError(); return; }
    const created = {
      id, first_name: newAthlete.firstName.trim(), last_name: newAthlete.lastName.trim() || null,
      user_id: null, can_edit: false, created_at: new Date().toISOString(),
    } as any;
    useSeasonStore.getState().setAthletes([...athletes, created]);
    setAthleteId(id);
    setShowAddAthlete(false);
    setNewAthlete({ firstName: '', lastName: '', gradYear: '', position: '', club: '' });
    notifySuccess();
  };
  // Payment (only when the coach takes payments in RallyHUB)
  const [coachPay, setCoachPay] = useState<{ enabled: boolean; feeHandling: string; timing: string; hoursBefore: number } | null>(null);
  const [pm, setPm] = useState<SavedPaymentMethod | null>(null);
  const [pmBusy, setPmBusy] = useState(false);
  const [feeBps, setFeeBps] = useState(1000);
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
    if (coachId && isSupabaseConfigured) {
      fetchCoachById(coachId).then(({ data }) => {
        const c = data as any;
        setCoachPay(c ? { enabled: !!c.stripe_charges_enabled, feeHandling: c.fee_handling, timing: c.payment_timing ?? 'on_accept', hoursBefore: c.payment_hours_before ?? 24 } : null);
      });
      getPlatformFeeBps().then(setFeeBps);
      // Back from Stripe Checkout on web → save the new method; otherwise load the saved one.
      if (pm_setup === 'success' && session_id) confirmPaymentMethod(session_id).then(({ data }) => setPm(data));
      else getPaymentMethod().then(({ data }) => setPm(data?.payment_method ?? null));
    }
  }, [coachId]);

  const addOrChangePm = async () => {
    setPmBusy(true);
    const { data, error } = await addPaymentMethod(`/coaching/book?slotId=${slotId}&coachId=${coachId}`);
    setPmBusy(false);
    if (error) { showAlert('Payment method', error.message); notifyError(); return; }
    if (data) { setPm(data); notifySuccess(); }
  };

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
    const fail = (msg: string) => { setFormError(msg); notifyError(); };
    setFormError(null);
    if (!athleteId) return fail("Choose who this lesson is for (or add your athlete).");
    if (!sessionTypeId) return fail('Choose a session type.');
    if (!allergies.trim()) return fail('Allergies are required — list any, or type "None".');
    if (!ecName.trim()) return fail('Add an emergency contact name.');
    if (ecPhone.replace(/\D/g, '').length < 10) return fail("Add the emergency contact's phone number (10 digits).");
    if ((PAYMENTS_ENABLED && coachPay?.enabled) && !pm) return fail("Add a card or bank account. You won't be charged until the coach confirms.");
    if (!accepted) {
      if (!agreeTerms || !agreeRelease) return fail('Accept the lesson terms and the release to continue.');
      if (signer.trim().length < 2) return fail('Type your full name to sign.');
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

        {formError ? (
          <View className="flex-row items-start px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-900" accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={16} color="#dc2626" style={{ marginTop: 1 }} />
            <Text className="text-xs font-semibold text-red-700 dark:text-red-300 ml-1.5 flex-1">{formError}</Text>
          </View>
        ) : null}

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

            {/* Athlete — always changeable; add one inline */}
            <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Who's the lesson for?</Text>
            {athletes.length > 0 && (
              <View className="flex-row flex-wrap mb-2">
                {athletes.map((a) => {
                  const on = athleteId === a.id && !showAddAthlete;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => { setAthleteId(a.id); setShowAddAthlete(false); setFormError(null); }}
                      className={`rounded-full px-3.5 py-2 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900 bg-cream dark:bg-bark-light'}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text className={`text-sm font-semibold ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>{athleteName(a)}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setShowAddAthlete(true)}
                  className={`rounded-full px-3.5 py-2 mr-2 mb-2 border border-dashed ${showAddAthlete ? 'border-rally-600' : 'border-parchment dark:border-rally-900'}`}
                  accessibilityLabel="Add another athlete"
                >
                  <Text className="text-sm font-semibold text-rally-600">+ Add athlete</Text>
                </Pressable>
              </View>
            )}
            {showAddAthlete && (
              // Lessons-first parents (e.g. from a coach's booking page) add their athlete here.
              <View className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 border border-parchment dark:border-rally-900">
                <Text className="text-xs text-stone dark:text-parchment mb-2">Your coach sees this so they know who's walking in.</Text>
                <View className="flex-row gap-3">
                  <View className="flex-1"><FormField label="First name" value={newAthlete.firstName} onChangeText={(v) => setNewAthlete((a) => ({ ...a, firstName: v }))} placeholder="Drue" /></View>
                  <View className="flex-1"><FormField label="Last name" value={newAthlete.lastName} onChangeText={(v) => setNewAthlete((a) => ({ ...a, lastName: v }))} placeholder="Kenton" /></View>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1"><FormField label="Grad year" value={newAthlete.gradYear} onChangeText={(v) => setNewAthlete((a) => ({ ...a, gradYear: v.replace(/\D/g, '').slice(0, 4) }))} placeholder="YYYY" keyboardType="number-pad" /></View>
                  <View className="flex-1"><FormField label="Position" value={newAthlete.position} onChangeText={(v) => setNewAthlete((a) => ({ ...a, position: v }))} placeholder="e.g. Setter" /></View>
                </View>
                <FormField label="Club (optional)" value={newAthlete.club} onChangeText={(v) => setNewAthlete((a) => ({ ...a, club: v }))} placeholder="e.g. AJV" />
                <View className="flex-row" style={{ gap: 8 }}>
                  <Pressable disabled={addingAthlete} onPress={addAthlete} className="flex-1 bg-rally-600 rounded-lg py-2.5 items-center active:opacity-80">
                    <Text className="text-sm font-semibold text-cream">{addingAthlete ? 'Adding…' : 'Add athlete'}</Text>
                  </Pressable>
                  {athletes.length > 0 && (
                    <Pressable onPress={() => setShowAddAthlete(false)} className="rounded-lg px-4 py-2.5 items-center">
                      <Text className="text-sm font-semibold text-stone">Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </View>
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

            {/* Payment */}
            {coachPay && selectedType ? (
              <View className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 border border-parchment dark:border-rally-900">
                <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Payment</Text>
                {coachPay.enabled ? (() => {
                  const price = selectedType.price_cents;
                  const total = coachPay.feeHandling === 'surcharge' ? Math.ceil((price + 30) / (1 - 0.029)) : price;
                  return (
                    <>
                      <Text className="text-xs text-stone dark:text-parchment mb-2">
                        {fmtMoney(price)}{total > price ? ` + ${fmtMoney(total - price)} service fee (card; less by bank)` : ''} · charged {coachPay.timing === 'hours_before' ? `${coachPay.hoursBefore} hours before the lesson` : coachPay.timing === 'after_lesson' ? 'after the lesson' : 'when the coach confirms'}.
                      </Text>
                      <Pressable disabled={pmBusy} onPress={addOrChangePm} className="flex-row items-center rounded-lg px-3 py-2.5 bg-warm-white dark:bg-bark border border-parchment dark:border-rally-900 active:opacity-70">
                        <Ionicons name={pm ? (pm.pm_type === 'us_bank_account' ? 'business' : 'card') : 'add-circle-outline'} size={18} color="#3B82B0" />
                        <Text className="text-sm font-semibold text-bark dark:text-cream ml-2 flex-1">{pmBusy ? 'Opening secure checkout…' : pm ? describePaymentMethod(pm) : 'Add card, Apple Pay, or bank'}</Text>
                        <Text className="text-xs font-semibold text-rally-600">{pm ? 'Change' : 'Add'}</Text>
                      </Pressable>
                      <Text className="text-[11px] text-stone mt-1.5">Secured by Stripe. Saved for future lessons.</Text>
                    </>
                  );
                })() : (
                  <Text className="text-xs text-stone dark:text-parchment">This coach isn't taking payments in RallyHUB yet — pay them directly for now.</Text>
                )}
              </View>
            ) : null}

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
              <View className="flex-1"><FormField label="Emergency contact (required)" value={ecName} onChangeText={(v) => { setEcName(v); setFormError(null); }} placeholder="Name" /></View>
              <View className="flex-1"><FormField label="Their phone (required)" value={ecPhone} onChangeText={(v) => { setEcPhone(v); setFormError(null); }} placeholder="(512) 555-0100" keyboardType="phone-pad" /></View>
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
