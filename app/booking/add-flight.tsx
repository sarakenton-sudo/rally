import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DatePickerField from '@/components/DatePickerField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { insertFlightBooking } from '@/hooks/useSupabaseData';
import type { FlightBooking } from '@/types/database';

const AIRLINES = [
  'Southwest', 'Delta', 'United', 'American', 'JetBlue',
  'Spirit', 'Frontier', 'Alaska', 'Other',
];

export default function AddFlightBookingScreen() {
  const params = useLocalSearchParams<{ tournamentId?: string }>();

  const [airline, setAirline] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [bookedBy, setBookedBy] = useState('');
  const [cost, setCost] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState(params.tournamentId ?? '');

  const [isSaving, setIsSaving] = useState(false);

  // Traveler names — dynamic list
  const [travelers, setTravelers] = useState<string[]>(['']);

  const tournaments = useSeasonStore((s) => s.tournaments);
  const addFlightBooking = useSeasonStore((s) => s.addFlightBooking);
  const { user } = useAuth();

  const ic = useIconColors();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const tournamentOptions = useMemo(
    () => tournaments.filter((t) => t.travel_required).map((t) => t.name),
    [tournaments]
  );
  const selectedTournamentName = tournaments.find((t) => t.id === selectedTournamentId)?.name ?? '';

  const handleTournamentChange = (name: string) => {
    const t = tournaments.find((tour) => tour.name === name);
    if (t) setSelectedTournamentId(t.id);
  };

  const addTraveler = () => {
    setTravelers((prev) => [...prev, '']);
  };

  const updateTraveler = (index: number, value: string) => {
    setTravelers((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const removeTraveler = (index: number) => {
    if (travelers.length <= 1) return;
    setTravelers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!airline) {
      Alert.alert('Missing field', 'Please select an airline.');
      return;
    }
    if (!confirmationCode.trim()) {
      Alert.alert('Missing field', 'Please enter a confirmation code.');
      return;
    }
    if (!departureDate || !returnDate) {
      Alert.alert('Missing field', 'Please set departure and return dates.');
      return;
    }
    if (!selectedTournamentId) {
      Alert.alert('Missing field', 'Please select a tournament.');
      return;
    }

    const travelerNames = travelers.map((t) => t.trim()).filter(Boolean);
    if (travelerNames.length === 0) {
      Alert.alert('Missing field', 'Please add at least one traveler name.');
      return;
    }

    setIsSaving(true);

    const bookingData = {
      user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
      tournament_id: selectedTournamentId,
      airline,
      confirmation_code: confirmationCode.trim().toUpperCase(),
      departure_date: departureDate.toISOString().split('T')[0],
      return_date: returnDate.toISOString().split('T')[0],
      booked_by: bookedBy.trim(),
      traveler_names: travelerNames,
      cost: cost ? parseFloat(cost) : null,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { data, error } = await insertFlightBooking(bookingData);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
        if (data) { addFlightBooking(data); notifySuccess(); }
      } else {
        const booking: FlightBooking = {
          ...bookingData,
          id: `f-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        addFlightBooking(booking);
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
            Add Flight
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

          {/* Airline */}
          <DropdownField
            label="Airline"
            value={airline}
            options={AIRLINES}
            onChange={setAirline}
          />

          {/* Confirmation code */}
          <FormField
            label="Confirmation Code"
            value={confirmationCode}
            onChangeText={setConfirmationCode}
            placeholder="e.g. ABC123"
            autoCapitalize="characters"
          />

          {/* Departure / Return dates */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField
                label="Departure"
                value={departureDate}
                onChange={setDepartureDate}
              />
            </View>
            <View className="flex-1">
              <DatePickerField
                label="Return"
                value={returnDate}
                onChange={setReturnDate}
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

          {/* Traveler names */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Travelers
              </Text>
              <Pressable
                className="flex-row items-center active:opacity-70"
                onPress={addTraveler}
              >
                <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">Add</Text>
              </Pressable>
            </View>

            {travelers.map((traveler, index) => (
              <View key={index} className="flex-row items-center mb-2">
                <View className="flex-1 mr-2">
                  <FormField
                    label=""
                    value={traveler}
                    onChangeText={(v) => updateTraveler(index, v)}
                    placeholder={`Traveler ${index + 1} name`}
                  />
                </View>
                {travelers.length > 1 && (
                  <Pressable
                    onPress={() => removeTraveler(index)}
                    className="p-2 -mt-4"
                  >
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          {/* Cost */}
          <FormField
            label="Estimated Cost"
            value={cost}
            onChangeText={setCost}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          {/* Flight info */}
          <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-8">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#2563eb" />
              <Text className="text-xs text-blue-700 dark:text-blue-300 ml-2 flex-1">
                Tip: For Southwest, use the 6-character confirmation code. For multi-leg flights, add the full itinerary as one booking.
              </Text>
            </View>
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
