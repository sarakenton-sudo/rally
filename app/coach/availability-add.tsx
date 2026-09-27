import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import DatePickerField from '@/components/DatePickerField';
import SlotTargetingField from '@/components/SlotTargetingField';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchFacilities, fetchSessionTypes, fetchCoachClients, fetchClientGroups, createSlots, isSupabaseConfigured, type NewSlotInput,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { Facility, FacilityStatus, SessionType, SlotVisibility, CoachClient, ClientGroup } from '@/types/database';
import FacilityStatusField from '@/components/coach/FacilityStatusField';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_OPTIONS = ['1 week', '2 weeks', '3 weeks', '4 weeks', '6 weeks', '8 weeks', '12 weeks'];
const WEEK_TO_N: Record<string, number> = { '1 week': 1, '2 weeks': 2, '3 weeks': 3, '4 weeks': 4, '6 weeks': 6, '8 weeks': 8, '12 weeks': 12 };

const DURATION_OPTIONS = ['30 min', '45 min', '60 min', '75 min', '90 min', '120 min'];
const DURATION_TO_MIN: Record<string, number> = { '30 min': 30, '45 min': 45, '60 min': 60, '75 min': 75, '90 min': 90, '120 min': 120 };

const TIME_OPTIONS: { label: string; minutes: number }[] = [];
for (let mins = 6 * 60; mins <= 21 * 60 + 30; mins += 30) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  TIME_OPTIONS.push({ label: `${h12}:${m.toString().padStart(2, '0')} ${ampm}`, minutes: mins });
}

export default function AvailabilityAddScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [visibility, setVisibility] = useState<SlotVisibility>('all');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityStatus, setFacilityStatus] = useState<FacilityStatus>('not_booked');
  const [anyType, setAnyType] = useState(false);
  const [eligibleTypeIds, setEligibleTypeIds] = useState<string[]>([]);
  const [durationMin, setDurationMin] = useState(60);
  const [spots, setSpots] = useState('1');
  const [mode, setMode] = useState<'oneoff' | 'recurring'>('recurring');
  const [timeMinutes, setTimeMinutes] = useState<number>(16 * 60);
  const [date, setDate] = useState<Date | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!coachProfile || !isSupabaseConfigured) { setLoaded(true); return; }
      const [f, s, c, g] = await Promise.all([
        fetchFacilities(coachProfile.id),
        fetchSessionTypes(coachProfile.id),
        fetchCoachClients(),
        fetchClientGroups(coachProfile.id),
      ]);
      setFacilities(f.data);
      const active = s.data.filter((t) => t.is_active);
      setSessionTypes(active);
      setClients(c.data);
      setGroups(g.data);
      if (f.data.length) setFacilityId(f.data[0].id);
      if (active.length) { setEligibleTypeIds([active[0].id]); setSpots(String(active[0].capacity)); }
      setLoaded(true);
    })();
  }, [coachProfile]);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const toggleType = (id: string) => {
    setEligibleTypeIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      // default spots to the largest capacity among selected types
      const caps = sessionTypes.filter((t) => next.includes(t.id)).map((t) => t.capacity);
      if (caps.length) setSpots(String(Math.max(...caps)));
      return next;
    });
  };
  const toggleWeekday = (wd: number) =>
    setWeekdays((cur) => (cur.includes(wd) ? cur.filter((x) => x !== wd) : [...cur, wd]));

  const buildRows = (): NewSlotInput[] => {
    if (!coachProfile) return [];
    const h = Math.floor(timeMinutes / 60);
    const m = timeMinutes % 60;
    const durationMs = durationMin * 60000;
    const seatsTotal = Math.max(parseInt(spots, 10) || 1, 1);
    const eligible = anyType ? [] : eligibleTypeIds;
    const now = new Date();
    const rows: NewSlotInput[] = [];

    const push = (d: Date) => {
      d.setHours(h, m, 0, 0);
      if (d < now) return;
      rows.push({
        coachId: coachProfile.id,
        facilityId,
        facilityStatus,
        eligibleTypeIds: eligible,
        startsAt: new Date(d),
        endsAt: new Date(d.getTime() + durationMs),
        seatsTotal,
        visibility,
        sharedWithConnectionId: connectionId,
        sharedWithGroupId: groupId,
      });
    };

    if (mode === 'oneoff') {
      if (date) push(new Date(date));
    } else {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (const wd of weekdays) {
        const base = new Date(today);
        base.setDate(base.getDate() + ((wd - base.getDay() + 7) % 7));
        for (let w = 0; w < weeks; w++) {
          const d = new Date(base);
          d.setDate(d.getDate() + 7 * w);
          push(d);
        }
      }
    }
    return rows;
  };

  const handleSave = async () => {
    if (!anyType && eligibleTypeIds.length === 0) { showAlert('Pick a type', 'Choose what this slot can be booked as, or turn on "any type".'); notifyError(); return; }
    if (facilities.length > 0 && !facilityId) { showAlert('Pick a facility', 'Choose where these lessons are.'); notifyError(); return; }
    if (mode === 'oneoff' && !date) { showAlert('Pick a date', 'Choose a date for this slot.'); notifyError(); return; }
    if (mode === 'recurring' && weekdays.length === 0) { showAlert('Pick days', 'Choose at least one weekday.'); notifyError(); return; }

    const rows = buildRows();
    if (rows.length === 0) { showAlert('Nothing to add', 'Those times are all in the past — pick a future date/time.'); notifyError(); return; }

    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await createSlots(rows);
        if (error) { showAlert('Could not save', error.message); return; }
      }
      notifySuccess();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const timeLabel = TIME_OPTIONS.find((t) => t.minutes === timeMinutes)?.label ?? '';
  const seatsNum = Math.max(parseInt(spots, 10) || 1, 1);

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Add Availability</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {loaded && sessionTypes.length === 0 ? (
            <View className="items-center py-8">
              <Ionicons name="pricetags-outline" size={28} color={ic.placeholder} />
              <Text className="text-sm text-stone dark:text-parchment mt-2 mb-4 text-center">
                Add a session type first — slots are booked as one of your session types.
              </Text>
              <Pressable className="bg-rally-600 rounded-xl px-5 py-3 active:opacity-80" onPress={() => router.replace('/coach/session-types')}>
                <Text className="text-sm font-semibold text-cream">Go to session types</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {facilities.length > 0 && (
                <DropdownField
                  label="Facility"
                  value={facilities.find((f) => f.id === facilityId)?.label ?? ''}
                  options={facilities.map((f) => f.label)}
                  onChange={(label) => setFacilityId(facilities.find((f) => f.label === label)?.id ?? null)}
                />
              )}
              <FacilityStatusField value={facilityStatus} onChange={setFacilityStatus} />

              <SlotTargetingField
                clients={clients}
                groups={groups}
                visibility={visibility}
                connectionId={connectionId}
                groupId={groupId}
                onChange={(v, cid, gid) => { setVisibility(v); setConnectionId(cid); setGroupId(gid); }}
              />

              {/* Bookable as */}
              <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Bookable as</Text>
              <View className="flex-row items-center justify-between bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-2">
                <Text className="text-sm text-bark dark:text-parchment flex-1 mr-3">Open to any session type</Text>
                <Switch
                  value={anyType}
                  onValueChange={setAnyType}
                  trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
                  thumbColor={anyType ? '#3B82B0' : '#FEFEFE'}
                />
              </View>
              {!anyType && (
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {sessionTypes.map((t) => {
                    const on = eligibleTypeIds.includes(t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => toggleType(t.id)}
                        className={`px-3 py-2 rounded-full border ${on ? 'bg-rally-600 border-rally-600' : 'bg-cream dark:bg-bark-light border-parchment dark:border-rally-900'}`}
                      >
                        <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-stone dark:text-parchment'}`}>
                          {t.name} · ${(t.price_cents / 100).toFixed(0)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text className="text-xs text-stone dark:text-parchment mb-4 ml-1">
                {anyType
                  ? 'A parent can book this as any of your active session types.'
                  : 'Select one for a fixed format, or several to stay flexible — a parent picks one when booking.'}
              </Text>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <DropdownField
                    label="Length"
                    value={`${durationMin} min`}
                    options={DURATION_OPTIONS}
                    onChange={(label) => setDurationMin(DURATION_TO_MIN[label] ?? 60)}
                  />
                </View>
                <View className="flex-1">
                  <FormField label="Spots" value={spots} onChangeText={setSpots} placeholder="1" keyboardType="number-pad" />
                </View>
              </View>
              <Text className="text-xs text-stone dark:text-parchment -mt-2 mb-4 ml-1">
                {seatsNum === 1 ? '1 spot — private/exclusive.' : `${seatsNum} spots — athletes book individual spots (clinic/camp). Parents see how many are left.`}
              </Text>

              {/* Mode toggle */}
              <View className="flex-row bg-cream dark:bg-bark-light rounded-xl p-1 mb-4">
                {(['recurring', 'oneoff'] as const).map((mOpt) => (
                  <Pressable
                    key={mOpt}
                    onPress={() => setMode(mOpt)}
                    className={`flex-1 py-2 rounded-lg items-center ${mode === mOpt ? 'bg-rally-600' : ''}`}
                  >
                    <Text className={`text-sm font-semibold ${mode === mOpt ? 'text-cream' : 'text-stone dark:text-parchment'}`}>
                      {mOpt === 'recurring' ? 'Recurring' : 'One-off'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <DropdownField
                label="Start time"
                value={timeLabel}
                options={TIME_OPTIONS.map((t) => t.label)}
                onChange={(label) => setTimeMinutes(TIME_OPTIONS.find((t) => t.label === label)?.minutes ?? timeMinutes)}
              />

              {mode === 'oneoff' ? (
                <DatePickerField label="Date" value={date} onChange={setDate} />
              ) : (
                <>
                  <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Repeat on</Text>
                  <View className="flex-row justify-between mb-4">
                    {WEEKDAYS.map((d, i) => {
                      const on = weekdays.includes(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => toggleWeekday(i)}
                          className={`w-10 h-10 rounded-full items-center justify-center ${on ? 'bg-rally-600' : 'bg-cream dark:bg-bark-light border border-parchment dark:border-rally-900'}`}
                        >
                          <Text className={`text-xs font-bold ${on ? 'text-cream' : 'text-stone dark:text-parchment'}`}>{d[0]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <DropdownField
                    label="For how long"
                    value={`${weeks} week${weeks === 1 ? '' : 's'}`}
                    options={WEEK_OPTIONS}
                    onChange={(label) => setWeeks(WEEK_TO_N[label] ?? 4)}
                  />
                </>
              )}

              <View className="h-8" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
