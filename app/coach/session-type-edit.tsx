import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  createSessionType, updateSessionType, deleteSessionType, isSupabaseConfigured,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { SessionKind, BookingMode } from '@/types/database';

const KIND_OPTIONS = ['Private 1:1', 'Semi-Private 2:1', 'Small Group', 'Clinic', 'Camp'];
const KIND_TO_VALUE: Record<string, SessionKind> = {
  'Private 1:1': 'private_1',
  'Semi-Private 2:1': 'semi_2',
  'Small Group': 'small_group',
  'Clinic': 'clinic',
  'Camp': 'camp',
};
const VALUE_TO_KIND: Record<string, string> = {
  private_1: 'Private 1:1',
  semi_2: 'Semi-Private 2:1',
  small_group: 'Small Group',
  clinic: 'Clinic',
  camp: 'Camp',
};
const DEFAULT_CAPACITY: Record<SessionKind, number> = { private_1: 1, semi_2: 2, small_group: 4, clinic: 12, camp: 20 };

const MODE_OPTIONS = ['Request to book', 'Instant book'];
const MODE_TO_VALUE: Record<string, BookingMode> = { 'Request to book': 'request', 'Instant book': 'instant' };
const VALUE_TO_MODE: Record<BookingMode, string> = { request: 'Request to book', instant: 'Instant book' };

export default function SessionTypeEditScreen() {
  const ic = useIconColors();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const existing = useCoachStore((s) => s.sessionTypes.find((t) => t.id === editId));
  const addSessionType = useCoachStore((s) => s.addSessionType);
  const updateSessionTypeStore = useCoachStore((s) => s.updateSessionType);
  const removeSessionType = useCoachStore((s) => s.removeSessionType);

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<SessionKind>(existing?.kind ?? 'private_1');
  const [price, setPrice] = useState(existing ? String(existing.price_cents / 100) : '');
  const [duration, setDuration] = useState(existing ? String(existing.duration_min) : '60');
  const [capacity, setCapacity] = useState(existing ? String(existing.capacity) : '1');
  const [bookingMode, setBookingMode] = useState<BookingMode>(existing?.booking_mode ?? 'request');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [isSaving, setIsSaving] = useState(false);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const handleKindChange = (label: string) => {
    const v = KIND_TO_VALUE[label];
    setKind(v);
    setCapacity(String(DEFAULT_CAPACITY[v])); // sensible default for the kind
  };

  const handleSave = async () => {
    if (!coachProfile) return;
    if (!name.trim()) { showAlert('Missing field', 'Give this session type a name.'); notifyError(); return; }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) { showAlert('Missing field', 'Enter a valid price.'); notifyError(); return; }
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0) { showAlert('Missing field', 'Enter a valid duration.'); notifyError(); return; }

    const values = {
      kind,
      name: name.trim(),
      description: description.trim() || null,
      price_cents: Math.round(priceNum * 100),
      duration_min: durationNum,
      capacity: Math.max(parseInt(capacity, 10) || DEFAULT_CAPACITY[kind], 1),
      booking_mode: bookingMode,
      is_active: isActive,
    };

    setIsSaving(true);
    try {
      if (editId && existing) {
        if (isSupabaseConfigured) {
          const { error } = await updateSessionType(editId, values);
          if (error) { showAlert('Save failed', error.message); return; }
        }
        updateSessionTypeStore(editId, values);
      } else {
        if (isSupabaseConfigured) {
          const { data, error } = await createSessionType(coachProfile.id, values);
          if (error) { showAlert('Save failed', error.message); return; }
          if (data) addSessionType(data);
        }
      }
      notifySuccess();
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    const doDelete = async () => {
      if (isSupabaseConfigured) await deleteSessionType(editId);
      removeSessionType(editId);
      notifySuccess();
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${existing?.name}"?`)) doDelete();
    } else {
      Alert.alert('Delete session type', `Delete "${existing?.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">{editId ? 'Edit Session Type' : 'New Session Type'}</Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <FormField label="Name" value={name} onChangeText={setName} placeholder="e.g. 60-min Private Lesson" />
          <DropdownField label="Type" value={VALUE_TO_KIND[kind]} options={KIND_OPTIONS} onChange={handleKindChange} />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Price ($)" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" />
            </View>
            <View className="flex-1">
              <FormField label="Duration (min)" value={duration} onChangeText={setDuration} placeholder="60" keyboardType="number-pad" />
            </View>
            <View className="flex-1">
              <FormField label="Athletes" value={capacity} onChangeText={setCapacity} placeholder="1" keyboardType="number-pad" />
            </View>
          </View>

          <DropdownField
            label="Booking"
            value={VALUE_TO_MODE[bookingMode]}
            options={MODE_OPTIONS}
            onChange={(v) => setBookingMode(MODE_TO_VALUE[v])}
          />
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-lg px-3 py-2 mb-4 -mt-2 flex-row items-start">
            <Ionicons name="information-circle" size={15} color="#3B82B0" style={{ marginTop: 1 }} />
            <Text className="text-xs text-rally-600 ml-1.5 flex-1">
              {bookingMode === 'request'
                ? 'You review each request before the parent is charged.'
                : "Parents are charged immediately when they book — no approval step."}
            </Text>
          </View>

          <FormField
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What this session focuses on"
            multiline
            numberOfLines={3}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />

          <View className="flex-row items-center justify-between bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-sm font-medium text-bark dark:text-parchment">Active</Text>
              <Text className="text-xs text-stone dark:text-stone mt-0.5">Off = hidden from booking, kept for later</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
              thumbColor={isActive ? '#3B82B0' : '#FEFEFE'}
            />
          </View>

          {editId && existing && (
            <Pressable className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center mb-6 active:opacity-80" onPress={handleDelete}>
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2">Delete Session Type</Text>
              </View>
            </Pressable>
          )}
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
