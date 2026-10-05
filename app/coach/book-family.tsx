import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import Avatar from '@/components/Avatar';
import DatePickerField from '@/components/DatePickerField';
import DropdownField from '@/components/DropdownField';
import { showToast } from '@/components/Toast';
import {
  fetchBookableAthletes, fetchSessionTypes, fetchFacilities, fetchUpcomingSlots, coachCreateBooking,
  sessionKindStyle, fmtMoney, isSupabaseConfigured, type BookableAthlete, type SlotWithRefs,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';
import type { Facility, SessionType } from '@/types/database';

// 30-minute start times, 6:00am–9:30pm
const TIMES = Array.from({ length: 32 }, (_, i) => {
  const mins = 360 + i * 30;
  const h = Math.floor(mins / 60), m = mins % 60;
  return { label: `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`, h, m };
});

/** Coach books a lesson for a family they already work with (Phase 2). */
export default function BookFamilyScreen() {
  const ic = useIconColors();
  const coach = useCoachStore((s) => s.coachProfile);
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState<BookableAthlete[]>([]);
  const [types, setTypes] = useState<SessionType[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [openSlots, setOpenSlots] = useState<SlotWithRefs[]>([]);

  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [mode, setMode] = useState<'open' | 'new'>('open');
  const [slotId, setSlotId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [timeLabel, setTimeLabel] = useState('');
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [charge, setCharge] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!coach || !isSupabaseConfigured) { setLoading(false); return; }
    const [a, t, f, s] = await Promise.all([fetchBookableAthletes(), fetchSessionTypes(coach.id), fetchFacilities(coach.id), fetchUpcomingSlots(coach.id)]);
    setAthletes(a);
    setTypes(t.data.filter((x) => x.is_active));
    setFacilities(f.data);
    setFacilityId((cur) => cur ?? f.data[0]?.id ?? null);
    const in30 = Date.now() + 30 * 86_400_000;
    setOpenSlots(s.data.filter((x) => x.status === 'open' && x.seats_taken < x.seats_total && new Date(x.starts_at).getTime() < in30));
    setLoading(false);
  }, [coach?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAthlete = (a: BookableAthlete) => {
    tapLight();
    setAthleteId(a.athlete_id);
    if (a.last_session_type_id && types.some((t) => t.id === a.last_session_type_id)) setTypeId(a.last_session_type_id);
  };

  const type = types.find((t) => t.id === typeId) ?? null;
  // Open times this lesson type can be booked into.
  const eligibleSlots = useMemo(() => openSlots.filter((s) => {
    const ids = s.eligible_session_type_ids ?? [];
    return !typeId || ids.length === 0 || ids.includes(typeId);
  }), [openSlots, typeId]);
  const paysInApp = !!(coach as any)?.stripe_charges_enabled;

  const book = async () => {
    if (!athleteId) return showToast('Pick an athlete');
    if (!typeId || !type) return showToast('Pick a lesson type');
    let startsAt: Date | null = null, endsAt: Date | null = null;
    if (mode === 'open') {
      if (!slotId) return showToast('Pick one of your open times');
    } else {
      const t = TIMES.find((x) => x.label === timeLabel);
      if (!date || !t) return showToast('Pick a date and start time');
      if (!facilityId) return showToast('Pick a facility');
      startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.h, t.m);
      endsAt = new Date(startsAt.getTime() + type.duration_min * 60_000);
      if (startsAt.getTime() < Date.now()) return showToast('That time has already passed');
    }
    setSaving(true);
    const { bookingId, error } = await coachCreateBooking({
      athleteId, sessionTypeId: typeId, slotId: mode === 'open' ? slotId : null,
      startsAt, endsAt, facilityId: mode === 'new' ? facilityId : null, notes, chargeInApp: paysInApp && charge,
    });
    setSaving(false);
    if (error || !bookingId) {
      notifyError();
      const msg = (error?.message ?? 'Could not book').replace(/^[A-Z_]+: /, '');
      return showToast(msg.includes('POLICIES_NOT_ACCEPTED') || msg.includes('terms') ? "This family needs to sign your terms first — ask them to request a lesson once." : msg);
    }
    notifySuccess();
    router.back();
    showToast('Lesson booked — the family was notified', { actionLabel: 'View', onAction: () => router.push('/coach-schedule') });
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
          <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Book a family</Text>
          <Pressable onPress={book} disabled={saving} className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}>
            <Text className="text-sm font-semibold text-cream">{saving ? 'Booking…' : 'Book'}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-8" />
        ) : athletes.length === 0 ? (
          <View className="items-center px-8 mt-16">
            <Ionicons name="people-outline" size={40} color={ic.placeholder} />
            <Text className="text-base font-bold text-bark dark:text-cream mt-3 text-center">No athletes to book yet</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
              A family needs to request their first lesson so they can sign your terms and add health info. After that, you can book them here anytime.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {/* Athlete */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Athlete</Text>
            <View className="flex-row flex-wrap mb-4">
              {athletes.map((a) => {
                const on = athleteId === a.athlete_id;
                return (
                  <Pressable key={a.athlete_id} onPress={() => pickAthlete(a)} className={`flex-row items-center rounded-full pl-1 pr-3 py-1 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900 bg-warm-white dark:bg-bark-light'}`}>
                    <Avatar uri={a.photo_url} name={a.athlete_name} size={26} colorKey={a.athlete_id} />
                    <Text className={`text-sm font-semibold ml-1.5 ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>{a.athlete_name}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Lesson type */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Lesson type</Text>
            <View className="flex-row flex-wrap mb-4">
              {types.map((t) => {
                const on = typeId === t.id;
                const st = sessionKindStyle(t.kind);
                return (
                  <Pressable key={t.id} onPress={() => { setTypeId(t.id); setSlotId(null); }} className="rounded-xl px-3 py-2 mr-2 mb-2 border" style={{ backgroundColor: on ? st.color : st.color + '12', borderColor: on ? st.color : st.color + '40' }}>
                    <Text className="text-sm font-semibold" style={{ color: on ? '#fff' : st.color }}>{t.name}</Text>
                    <Text className="text-[11px]" style={{ color: on ? '#ffffffcc' : st.color }}>{fmtMoney(t.price_cents)} · {t.duration_min} min</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* When */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">When</Text>
            <View className="flex-row bg-parchment dark:bg-bark-light rounded-lg p-0.5 mb-3">
              {([['open', 'One of my open times'], ['new', 'A new time']] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setMode(k)} className={`flex-1 py-2 rounded-md items-center ${mode === k ? 'bg-warm-white dark:bg-bark' : ''}`}>
                  <Text className={`text-xs font-semibold ${mode === k ? 'text-bark dark:text-cream' : 'text-stone'}`}>{l}</Text>
                </Pressable>
              ))}
            </View>
            {mode === 'open' ? (
              eligibleSlots.length === 0 ? (
                <Text className="text-sm text-stone dark:text-parchment mb-4">No open times{type ? ` for ${type.name}` : ''} in the next 30 days — use "A new time".</Text>
              ) : (
                <View className="flex-row flex-wrap mb-4">
                  {eligibleSlots.map((s) => {
                    const on = slotId === s.id;
                    const d = new Date(s.starts_at);
                    return (
                      <Pressable key={s.id} onPress={() => setSlotId(s.id)} className={`rounded-lg px-3 py-2 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900 bg-warm-white dark:bg-bark-light'}`}>
                        <Text className={`text-sm font-semibold ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>
                          {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                        {s.facilities?.label ? <Text className={`text-[11px] ${on ? 'text-cream/80' : 'text-stone'}`}>{s.facilities.label}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : (
              <View className="mb-2">
                <DatePickerField label="Date" value={date} onChange={setDate} />
                <DropdownField label="Start time" value={timeLabel} options={TIMES.map((t) => t.label)} onChange={setTimeLabel} />
                <DropdownField label="Facility" value={facilities.find((f) => f.id === facilityId)?.label ?? ''} options={facilities.map((f) => f.label)} onChange={(l) => setFacilityId(facilities.find((f) => f.label === l)?.id ?? null)} />
                {type && <Text className="text-xs text-stone -mt-2 mb-3">{type.duration_min} minutes · only this family can see this time.</Text>}
              </View>
            )}

            {/* Payment */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Payment</Text>
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-4">
              {paysInApp ? (
                <View className="flex-row items-center">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">{charge ? 'Charge their saved payment method' : 'Collect directly (cash, Venmo…)'}</Text>
                    <Text className="text-xs text-stone dark:text-parchment">{charge ? 'Charged on your usual payment timing.' : 'Mark it paid later under Record a payment.'}</Text>
                  </View>
                  <Switch value={charge} onValueChange={setCharge} />
                </View>
              ) : (
                <Text className="text-sm text-stone dark:text-parchment">Collect directly — set up Stripe in Business → Payments to charge in the app.</Text>
              )}
            </View>

            {/* Note */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Lesson notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Bring knee pads — we'll work on serve receive"
              placeholderTextColor="#8FA8BF"
              multiline
              className="bg-warm-white dark:bg-bark-light rounded-xl p-3 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              style={{ minHeight: 70, textAlignVertical: 'top' }}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
