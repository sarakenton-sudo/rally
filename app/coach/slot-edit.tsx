import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import DatePickerField from '@/components/DatePickerField';
import SlotTargetingField from '@/components/SlotTargetingField';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchSlot, fetchFacilities, fetchSessionTypes, fetchCoachClients, fetchClientGroups, updateSlot, deleteSlot, isSupabaseConfigured,
  type SlotWithRefs,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { Facility, FacilityStatus, SessionType, SlotVisibility, CoachClient, ClientGroup } from '@/types/database';
import FacilityStatusField from '@/components/coach/FacilityStatusField';

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
function nearestTimeOption(mins: number): number {
  return TIME_OPTIONS.reduce((best, t) => (Math.abs(t.minutes - mins) < Math.abs(best - mins) ? t.minutes : best), TIME_OPTIONS[0].minutes);
}

export default function SlotEditScreen() {
  const ic = useIconColors();
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const coachProfile = useCoachStore((s) => s.coachProfile);

  const [slot, setSlot] = useState<SlotWithRefs | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [visibility, setVisibility] = useState<SlotVisibility>('all');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [facilityStatus, setFacilityStatus] = useState<FacilityStatus>('not_booked');
  const [anyType, setAnyType] = useState(false);
  const [eligibleTypeIds, setEligibleTypeIds] = useState<string[]>([]);
  const [date, setDate] = useState<Date | null>(null);
  const [timeMinutes, setTimeMinutes] = useState(16 * 60);
  const [durationMin, setDurationMin] = useState(60);
  const [spots, setSpots] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!coachProfile || !isSupabaseConfigured || !slotId) { setLoading(false); return; }
      const [sl, f, st, c, g] = await Promise.all([
        fetchSlot(slotId), fetchFacilities(coachProfile.id), fetchSessionTypes(coachProfile.id),
        fetchCoachClients(), fetchClientGroups(coachProfile.id),
      ]);
      setFacilities(f.data);
      setSessionTypes(st.data.filter((t) => t.is_active));
      setClients(c.data);
      setGroups(g.data);
      if (sl.data) {
        const s = sl.data;
        setSlot(s);
        setFacilityId(s.facility_id);
        setFacilityStatus(s.facility_status ?? 'not_booked');
        setVisibility(s.visibility);
        setConnectionId(s.shared_with_connection_id);
        setGroupId(s.shared_with_group_id);
        const ids = s.eligible_session_type_ids ?? [];
        setAnyType(ids.length === 0);
        setEligibleTypeIds(ids);
        const start = new Date(s.starts_at);
        const end = new Date(s.ends_at);
        setDate(start);
        setTimeMinutes(nearestTimeOption(start.getHours() * 60 + start.getMinutes()));
        setDurationMin(Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 30));
        setSpots(String(s.seats_total));
      }
      setLoading(false);
    })();
  }, [coachProfile, slotId]);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const booked = (slot?.seats_taken ?? 0) > 0; // a booking exists → restrict time/size edits
  const toggleType = (id: string) =>
    setEligibleTypeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const handleSave = async () => {
    if (!slot) return;
    if (!anyType && eligibleTypeIds.length === 0) { showAlert('Pick a type', 'Choose what this slot can be booked as, or turn on "any type".'); notifyError(); return; }
    if (!date) { showAlert('Pick a date', 'Choose a date.'); notifyError(); return; }
    const seatsNum = Math.max(parseInt(spots, 10) || 1, 1);
    if (seatsNum < slot.seats_taken) { showAlert('Too few spots', `This slot already has ${slot.seats_taken} booked.`); notifyError(); return; }

    const h = Math.floor(timeMinutes / 60);
    const m = timeMinutes % 60;
    const start = new Date(date); start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60000);

    const targeting = {
      visibility,
      shared_with_connection_id: visibility === 'individual' ? connectionId : null,
      shared_with_group_id: visibility === 'group' ? groupId : null,
    };
    const base = { facility_id: facilityId, facility_status: facilityStatus, eligible_session_type_ids: anyType ? [] : eligibleTypeIds, seats_total: seatsNum, ...targeting };
    const values = booked
      ? base
      : { ...base, starts_at: start.toISOString(), ends_at: end.toISOString() };

    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await updateSlot(slot.id, values);
        if (error) { showAlert('Could not save', error.message); return; }
      }
      notifySuccess();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!slot) return;
    if (slot.seats_taken > 0) { showAlert('Cannot delete', 'This slot has bookings. Cancel those first.'); return; }
    const doDelete = async () => {
      if (isSupabaseConfigured) await deleteSlot(slot.id);
      notifySuccess();
      router.back();
    };
    if (Platform.OS === 'web') { if (window.confirm('Delete this slot?')) doDelete(); }
    else Alert.alert('Delete slot', 'Delete this slot?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]);
  };

  const timeLabel = TIME_OPTIONS.find((t) => t.minutes === timeMinutes)?.label ?? '';

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Edit Slot</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving || loading}
            className={`px-4 py-1.5 rounded-lg ${saving || loading ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-8" />
        ) : !slot ? (
          <Text className="text-sm text-stone dark:text-parchment text-center mt-8">Slot not found.</Text>
        ) : (
          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
            {booked && (
              <View className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4 flex-row items-start">
                <Ionicons name="lock-closed" size={14} color="#B8924A" style={{ marginTop: 1 }} />
                <Text className="text-xs text-amber-700 dark:text-amber-300 ml-1.5 flex-1">
                  {slot.seats_taken} booked — date, time and length are locked. You can still change facility, types, and add spots.
                </Text>
              </View>
            )}

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

            <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Bookable as</Text>
            <View className="flex-row items-center justify-between bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-2">
              <Text className="text-sm text-bark dark:text-parchment flex-1 mr-3">Open to any session type</Text>
              <Switch value={anyType} onValueChange={setAnyType} trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }} thumbColor={anyType ? '#3B82B0' : '#FEFEFE'} />
            </View>
            {!anyType && (
              <View className="flex-row flex-wrap gap-2 mb-4">
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

            <View className="flex-row gap-3">
              <View className="flex-1">
                <DropdownField label="Length" value={`${durationMin} min`} options={DURATION_OPTIONS} onChange={(label) => !booked && setDurationMin(DURATION_TO_MIN[label] ?? 60)} />
              </View>
              <View className="flex-1">
                <FormField label="Spots" value={spots} onChangeText={setSpots} placeholder="1" keyboardType="number-pad" />
              </View>
            </View>

            <DatePickerField label="Date" value={date} onChange={(d) => !booked && setDate(d)} />
            <DropdownField
              label="Start time"
              value={timeLabel}
              options={TIME_OPTIONS.map((t) => t.label)}
              onChange={(label) => !booked && setTimeMinutes(TIME_OPTIONS.find((t) => t.label === label)?.minutes ?? timeMinutes)}
            />

            {slot.seats_taken === 0 && (
              <Pressable className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center mt-2 mb-6 active:opacity-80" onPress={handleDelete}>
                <View className="flex-row items-center">
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  <Text className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2">Delete Slot</Text>
                </View>
              </Pressable>
            )}
            <View className="h-8" />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
