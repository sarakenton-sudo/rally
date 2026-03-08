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
import { insertHotelBooking } from '@/hooks/useSupabaseData';
import { daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { HotelBooking, BookingPlatform, BookingStatus } from '@/types/database';

const PLATFORMS: BookingPlatform[] = ['Bonvoy', 'Booking.com', 'Travel Source', 'Expedia', 'Direct', 'Other'];

export default function AddHotelBookingScreen() {
  const params = useLocalSearchParams<{ tournamentId?: string }>();

  // Form state
  const [hotelName, setHotelName] = useState('');
  const [platform, setPlatform] = useState<string>('');
  const [reservationNumber, setReservationNumber] = useState('');
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [bookedBy, setBookedBy] = useState('');
  const [bookingName, setBookingName] = useState('');
  const [cancellationDeadline, setCancellationDeadline] = useState<Date | null>(null);
  const [cost, setCost] = useState('');
  const [isBackup, setIsBackup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState(params.tournamentId ?? '');

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

  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const handleSave = async () => {
    // Validation
    if (!hotelName.trim()) {
      Alert.alert('Missing field', 'Please enter a hotel name.');
      return;
    }
    if (!platform) {
      Alert.alert('Missing field', 'Please select a booking platform.');
      return;
    }
    if (!checkIn || !checkOut) {
      Alert.alert('Missing field', 'Please set check-in and check-out dates.');
      return;
    }
    if (!selectedTournamentId) {
      Alert.alert('Missing field', 'Please select a tournament.');
      return;
    }

    setIsSaving(true);

    const bookingData = {
      user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
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
      status: 'tentative' as BookingStatus,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { data, error } = await insertHotelBooking(bookingData);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
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
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Add Hotel Booking
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-gray-300' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-white">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Tournament selector */}
          <DropdownField
            label="Tournament"
            value={selectedTournamentName}
            options={tournamentOptions}
            onChange={handleTournamentChange}
          />

          {/* Hotel name */}
          <FormField
            label="Hotel Name"
            value={hotelName}
            onChangeText={setHotelName}
            placeholder="e.g. Marriott Marquis Houston"
          />

          {/* Platform */}
          <DropdownField
            label="Booking Platform"
            value={platform}
            options={PLATFORMS}
            onChange={setPlatform}
          />

          {/* Reservation number */}
          <FormField
            label="Reservation Number"
            value={reservationNumber}
            onChangeText={setReservationNumber}
            placeholder="e.g. 217759"
          />

          {/* Check-in / Check-out row */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField
                label="Check-in"
                value={checkIn}
                onChange={setCheckIn}
              />
            </View>
            <View className="flex-1">
              <DatePickerField
                label="Check-out"
                value={checkOut}
                onChange={setCheckOut}
              />
            </View>
          </View>

          {/* Booked by */}
          <FormField
            label="Booked By"
            value={bookedBy}
            onChangeText={setBookedBy}
            placeholder="e.g. Sara"
          />

          {/* Name on reservation */}
          <FormField
            label="Name on Reservation"
            value={bookingName}
            onChangeText={setBookingName}
            placeholder="e.g. Sara + Kenton"
          />

          {/* Cancellation deadline */}
          <DatePickerField
            label="Cancellation Deadline"
            value={cancellationDeadline}
            onChange={setCancellationDeadline}
            highlightDanger={cancellationDanger}
          />
          {cancellationDanger && (
            <View className="bg-red-50 rounded-lg px-3 py-2 mb-4 flex-row items-center -mt-2">
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text className="text-xs font-semibold text-red-600 ml-1.5">
                Cancellation deadline is {cancellationDaysAway} day{cancellationDaysAway !== 1 ? 's' : ''} away!
              </Text>
            </View>
          )}

          {/* Cost */}
          <FormField
            label="Estimated Cost"
            value={cost}
            onChangeText={setCost}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          {/* Backup toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Backup Hotel
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Mark as "just in case" — gets a distinct visual indicator and its own cancellation tracking
              </Text>
            </View>
            <Switch
              value={isBackup}
              onValueChange={setIsBackup}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={isBackup ? '#2563eb' : '#f4f4f5'}
            />
          </View>

          {/* Bottom spacing */}
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
