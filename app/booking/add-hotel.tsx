import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DatePickerField from '@/components/DatePickerField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertHotelBooking, updateHotelBooking as updateHotelBookingDB, deleteHotelBooking as deleteHotelBookingDB } from '@/hooks/useSupabaseData';
import { daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { HotelBooking, BookingPlatform, BookingStatus } from '@/types/database';

const PLATFORMS: BookingPlatform[] = ['Bonvoy', 'Booking.com', 'Travel Source', 'Expedia', 'Direct', 'Other'];

export default function AddHotelBookingScreen() {
  const params = useLocalSearchParams<{ tournamentId?: string; editId?: string }>();
  const editId = params.editId;
  const existing = useSeasonStore((s) => s.hotelBookings.find((h) => h.id === editId));

  // Form state — pre-fill from existing booking when editing
  const [hotelName, setHotelName] = useState(existing?.hotel_name ?? '');
  const [platform, setPlatform] = useState<string>(existing?.platform ?? '');
  const [reservationNumber, setReservationNumber] = useState(existing?.reservation_number ?? '');
  const [checkIn, setCheckIn] = useState<Date | null>(existing ? new Date(existing.check_in + 'T12:00:00') : null);
  const [checkOut, setCheckOut] = useState<Date | null>(existing ? new Date(existing.check_out + 'T12:00:00') : null);
  const [bookedBy, setBookedBy] = useState(existing?.booked_by ?? '');
  const [bookingName, setBookingName] = useState(existing?.booking_name ?? '');
  const [cancellationDeadline, setCancellationDeadline] = useState<Date | null>(
    existing?.cancellation_deadline ? new Date(existing.cancellation_deadline + 'T12:00:00') : null
  );
  const [cost, setCost] = useState(existing?.cost != null ? String(existing.cost) : '');
  const [isBackup, setIsBackup] = useState(existing?.is_backup ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState(
    existing?.tournament_id ?? params.tournamentId ?? ''
  );

  // Read from store
  const tournaments = useSeasonStore((s) => s.tournaments);
  const { user } = useAuth();

  const tournamentOptions = useMemo(
    () => tournaments.filter((t) => t.travel_required).map((t) => t.name),
    [tournaments]
  );
  const selectedTournamentName = tournaments.find((t) => t.id === selectedTournamentId)?.name ?? '';

  const handleTournamentChange = (name: string) => {
    const t = tournaments.find((tour) => tour.name === name);
    if (t) setSelectedTournamentId(t.id);
  };

  // Cancellation deadline danger highlight
  const cancellationDaysAway = cancellationDeadline
    ? daysUntil(cancellationDeadline.toISOString().split('T')[0])
    : null;
  const cancellationDanger = cancellationDaysAway !== null && cancellationDaysAway <= 7 && cancellationDaysAway >= 0;

  const ic = useIconColors();
  const addHotelBooking = useSeasonStore((s) => s.addHotelBooking);
  const updateHotelBookingStore = useSeasonStore((s) => s.updateHotelBooking);
  const removeHotelBooking = useSeasonStore((s) => s.removeHotelBooking);

  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const showAlert = (title: string, msg: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
      onOk?.();
    } else {
      Alert.alert(title, msg, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const handleSave = async () => {
    if (!hotelName.trim()) { showAlert('Missing field', 'Please enter a hotel name.'); return; }
    if (!platform) { showAlert('Missing field', 'Please select a booking platform.'); return; }
    if (!checkIn || !checkOut) { showAlert('Missing field', 'Please set check-in and check-out dates.'); return; }
    if (!selectedTournamentId) { showAlert('Missing field', 'Please select a tournament.'); return; }

    setIsSaving(true);

    const bookingData = {
      created_by_user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
      tournament_id: selectedTournamentId,
      hotel_name: hotelName.trim(),
      platform: platform as BookingPlatform,
      booking_name: bookingName.trim(),
      booked_by: bookedBy.trim(),
      reservation_number: reservationNumber.trim(),
      check_in: checkIn.toISOString().split('T')[0],
      check_out: checkOut.toISOString().split('T')[0],
      cancellation_deadline: cancellationDeadline
        ? cancellationDeadline.toISOString().split('T')[0]
        : null,
      cost: cost ? parseFloat(cost) : null,
      is_backup: isBackup,
      status: (existing?.status ?? 'confirmed') as BookingStatus,
    };

    try {
      if (editId && existing) {
        if (isSupabaseConfigured && user) {
          const { error } = await updateHotelBookingDB(editId, bookingData);
          if (error) { showAlert('Save failed', error.message); return; }
        }
        updateHotelBookingStore(editId, bookingData);
        notifySuccess();
      } else {
        if (isSupabaseConfigured && user) {
          const { data, error } = await insertHotelBooking(bookingData);
          if (error) { showAlert('Save failed', error.message); return; }
          if (data) { addHotelBooking(data); notifySuccess(); }
        } else {
          const booking: HotelBooking = {
            ...bookingData,
            id: `h-${Date.now()}`,
            created_at: new Date().toISOString(),
          };
          addHotelBooking(booking);
          notifySuccess();
        }
      }
      showAlert('Saved', 'Hotel booking saved.', () => router.back());
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete "${existing?.hotel_name}"? This cannot be undone.`)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert('Delete Hotel', `Delete "${existing?.hotel_name}"? This cannot be undone.`, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            if (isSupabaseConfigured && user && editId) await deleteHotelBookingDB(editId);
            removeHotelBooking(editId!);
            notifySuccess();
            router.back();
            resolve();
          }},
        ]);
      });
    }
    if (isSupabaseConfigured && user && editId) await deleteHotelBookingDB(editId);
    removeHotelBooking(editId!);
    notifySuccess();
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">
            {editId ? 'Edit Hotel Booking' : 'Add Hotel Booking'}
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <DropdownField
            label="Tournament"
            value={selectedTournamentName}
            options={tournamentOptions}
            onChange={handleTournamentChange}
          />
          <FormField label="Hotel Name" value={hotelName} onChangeText={setHotelName} placeholder="e.g. Marriott Marquis Houston" />
          <DropdownField label="Booking Platform" value={platform} options={PLATFORMS} onChange={setPlatform} />
          <FormField label="Reservation Number" value={reservationNumber} onChangeText={setReservationNumber} placeholder="e.g. 217759" />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField label="Check-in" value={checkIn} onChange={setCheckIn} />
            </View>
            <View className="flex-1">
              <DatePickerField label="Check-out" value={checkOut} onChange={setCheckOut} />
            </View>
          </View>

          <FormField label="Booked By" value={bookedBy} onChangeText={setBookedBy} placeholder="e.g. Sara" />
          <FormField label="Name on Reservation" value={bookingName} onChangeText={setBookingName} placeholder="e.g. Sara + Kenton" />

          <DatePickerField label="Cancellation Deadline" value={cancellationDeadline} onChange={setCancellationDeadline} highlightDanger={cancellationDanger} />
          {cancellationDanger && (
            <View className="bg-red-50 rounded-lg px-3 py-2 mb-4 flex-row items-center -mt-2">
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text className="text-xs font-semibold text-red-600 ml-1.5">
                Cancellation deadline is {cancellationDaysAway} day{cancellationDaysAway !== 1 ? 's' : ''} away!
              </Text>
            </View>
          )}

          <FormField label="Estimated Cost" value={cost} onChangeText={setCost} placeholder="0.00" keyboardType="decimal-pad" />

          {/* Backup toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Backup Hotel
              </Text>
              <Text className="text-xs text-stone dark:text-stone mt-0.5">
                Mark as "just in case" — gets a distinct visual indicator and its own cancellation tracking
              </Text>
            </View>
            <Switch
              value={isBackup}
              onValueChange={setIsBackup}
              trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
              thumbColor={isBackup ? '#3B82B0' : '#FEFEFE'}
            />
          </View>

          {/* Delete button when editing */}
          {editId && existing && (
            <Pressable
              className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center mb-6 active:opacity-80"
              onPress={handleDelete}
            >
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2">
                  Delete Hotel Booking
                </Text>
              </View>
            </Pressable>
          )}

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
