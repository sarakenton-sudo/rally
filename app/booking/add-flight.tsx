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
import { insertFlightBooking, updateFlightBooking as updateFlightBookingDB, deleteFlightBooking as deleteFlightBookingDB } from '@/hooks/useSupabaseData';
import type { FlightBooking } from '@/types/database';

const AIRLINES = [
  'Southwest', 'Delta', 'United', 'American', 'JetBlue',
  'Spirit', 'Frontier', 'Alaska', 'Other',
];

export default function AddFlightBookingScreen() {
  const params = useLocalSearchParams<{
    tournamentId?: string; editId?: string;
    airline?: string; confirmationCode?: string;
    departureDate?: string; returnDate?: string;
    travelerName?: string; cost?: string;
    ticketNumber?: string;
  }>();
  const editId = params.editId;
  const existing = useSeasonStore((s) => s.flightBookings.find((f) => f.id === editId));

  const [airline, setAirline] = useState(existing?.airline ?? params.airline ?? '');
  const [confirmationCode, setConfirmationCode] = useState(existing?.confirmation_code ?? params.confirmationCode ?? '');
  const [departureDate, setDepartureDate] = useState<Date | null>(() => {
    const val = existing?.departure_date || params.departureDate || '';
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const d = new Date(val + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  });
  const [returnDate, setReturnDate] = useState<Date | null>(() => {
    const val = existing?.return_date || params.returnDate || '';
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const d = new Date(val + 'T12:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  });
  const [ticketNumber, setTicketNumber] = useState(existing?.ticket_number ?? params.ticketNumber ?? '');
  const [flightNumber, setFlightNumber] = useState(existing?.flight_number ?? '');
  const [departureTime, setDepartureTime] = useState(existing?.departure_time ?? '');
  const [arrivalTime, setArrivalTime] = useState(existing?.arrival_time ?? '');
  const [seatNumber, setSeatNumber] = useState(existing?.seat_number ?? '');
  const [bookedBy, setBookedBy] = useState(existing?.booked_by ?? '');
  const [cost, setCost] = useState(
    existing?.cost != null ? String(existing.cost) : params.cost ?? ''
  );
  const [selectedTournamentId, setSelectedTournamentId] = useState(
    existing?.tournament_id ?? params.tournamentId ?? ''
  );

  const [isSaving, setIsSaving] = useState(false);

  // Traveler names — dynamic list
  const [travelers, setTravelers] = useState<string[]>(
    existing?.traveler_names?.length ? existing.traveler_names :
    params.travelerName ? [params.travelerName] : ['']
  );

  const tournaments = useSeasonStore((s) => s.tournaments);
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const addFlightBooking = useSeasonStore((s) => s.addFlightBooking);
  const updateFlightBookingStore = useSeasonStore((s) => s.updateFlightBooking);
  const removeFlightBooking = useSeasonStore((s) => s.removeFlightBooking);
  const { user } = useAuth();

  const ic = useIconColors();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  // Athlete/season selection for filtering tournaments
  const hasMultipleAthletes = athletes.length > 1;
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (existing) {
      const t = tournaments.find((tour) => tour.id === existing.tournament_id);
      const s = t ? seasons.find((se) => se.id === t.season_id) : null;
      return s?.athlete_id ?? athletes[0]?.id ?? '';
    }
    const activeSeason = seasons.find((s) => s.id === activeSeasonId);
    return activeSeason?.athlete_id ?? athletes[0]?.id ?? '';
  });

  const athleteSeasonIds = useMemo(() => {
    const athleteSeasons = seasons.filter((s) => s.athlete_id === selectedAthleteId);
    return new Set(athleteSeasons.map((s) => s.id));
  }, [seasons, selectedAthleteId]);

  const filteredTournaments = useMemo(
    () => tournaments.filter((t) => t.travel_required && athleteSeasonIds.has(t.season_id)),
    [tournaments, athleteSeasonIds]
  );

  const tournamentOptions = useMemo(
    () => filteredTournaments.map((t) => t.name),
    [filteredTournaments]
  );
  const selectedTournamentName = tournaments.find((t) => t.id === selectedTournamentId)?.name ?? '';

  const handleAthleteChange = (name: string) => {
    const a = athletes.find((ath) => `${ath.first_name}${ath.last_name ? ' ' + ath.last_name : ''}` === name);
    if (a) {
      setSelectedAthleteId(a.id);
      setSelectedTournamentId('');
    }
  };

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

  const showAlert = (title: string, msg: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
      onOk?.();
    } else {
      Alert.alert(title, msg, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const handleSave = async () => {
    if (!airline) { showAlert('Missing field', 'Please select an airline.'); return; }
    if (!confirmationCode.trim()) { showAlert('Missing field', 'Please enter a confirmation code.'); return; }
    if (!departureDate) { showAlert('Missing field', 'Please set a departure date.'); return; }
    if (!selectedTournamentId) { showAlert('Missing field', 'Please select a tournament.'); return; }

    const travelerNames = travelers.map((t) => t.trim()).filter(Boolean);
    if (travelerNames.length === 0) { showAlert('Missing field', 'Please add at least one traveler name.'); return; }

    setIsSaving(true);

    const bookingData = {
      created_by_user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
      tournament_id: selectedTournamentId,
      airline,
      confirmation_code: confirmationCode.trim().toUpperCase(),
      ticket_number: ticketNumber.trim() || null,
      flight_number: flightNumber.trim() || null,
      departure_date: departureDate.toISOString().split('T')[0],
      return_date: returnDate ? returnDate.toISOString().split('T')[0] : null,
      departure_time: departureTime.trim() || null,
      arrival_time: arrivalTime.trim() || null,
      seat_number: seatNumber.trim() || null,
      booked_by: bookedBy.trim(),
      traveler_names: travelerNames,
      cost: cost ? parseFloat(cost) : null,
    };

    try {
      if (editId && existing) {
        if (isSupabaseConfigured && user) {
          const { error } = await updateFlightBookingDB(editId, bookingData);
          if (error) { showAlert('Save failed', error.message); return; }
        }
        updateFlightBookingStore(editId, bookingData);
        notifySuccess();
      } else {
        if (isSupabaseConfigured && user) {
          const { data, error } = await insertFlightBooking(bookingData);
          if (error) { showAlert('Save failed', error.message); return; }
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
      }
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete this ${existing?.airline} flight? This cannot be undone.`)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert('Delete Flight', `Are you sure you want to delete this ${existing?.airline} flight?`, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            if (isSupabaseConfigured && user && editId) await deleteFlightBookingDB(editId);
            removeFlightBooking(editId!);
            notifySuccess();
            router.back();
            resolve();
          }},
        ]);
      });
    }
    // Web path
    if (isSupabaseConfigured && user && editId) await deleteFlightBookingDB(editId);
    removeFlightBooking(editId!);
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
            {editId ? 'Edit Flight' : 'Add Flight'}
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
          {hasMultipleAthletes && (
            <DropdownField
              label="Athlete"
              value={athletes.find((a) => a.id === selectedAthleteId)
                ? `${athletes.find((a) => a.id === selectedAthleteId)!.first_name}${athletes.find((a) => a.id === selectedAthleteId)!.last_name ? ' ' + athletes.find((a) => a.id === selectedAthleteId)!.last_name : ''}`
                : ''}
              options={athletes.map((a) => `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`)}
              onChange={handleAthleteChange}
            />
          )}
          <DropdownField label="Tournament" value={selectedTournamentName} options={tournamentOptions} onChange={handleTournamentChange} />
          <DropdownField label="Airline" value={airline} options={AIRLINES} onChange={setAirline} />
          <FormField label="Confirmation Code" value={confirmationCode} onChangeText={setConfirmationCode} placeholder="e.g. ABC123" autoCapitalize="characters" />
          <FormField label="Ticket Number" value={ticketNumber} onChangeText={setTicketNumber} placeholder="e.g. 00623456789" />
          <FormField label="Flight Number" value={flightNumber} onChangeText={setFlightNumber} placeholder="e.g. SW 1234" />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField label="Departure" value={departureDate} onChange={setDepartureDate} />
            </View>
            <View className="flex-1">
              <DatePickerField label="Return" value={returnDate} onChange={setReturnDate} />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Departure Time" value={departureTime} onChangeText={setDepartureTime} placeholder="e.g. 6:00 AM" />
            </View>
            <View className="flex-1">
              <FormField label="Arrival Time" value={arrivalTime} onChangeText={setArrivalTime} placeholder="e.g. 9:30 AM" />
            </View>
          </View>

          <FormField label="Seat Number" value={seatNumber} onChangeText={setSeatNumber} placeholder="e.g. 12A" />
          <FormField label="Booked By" value={bookedBy} onChangeText={setBookedBy} placeholder="e.g. Sara" />

          {/* Traveler names */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Travelers
              </Text>
              <Pressable
                className="flex-row items-center active:opacity-70"
                onPress={addTraveler}
              >
                <Ionicons name="add-circle-outline" size={18} color="#3B82B0" />
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

          <FormField label="Estimated Cost" value={cost} onChangeText={setCost} placeholder="0.00" keyboardType="decimal-pad" />

          {/* Flight info */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-8">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#3B82B0" />
              <Text className="text-xs text-rally-700 dark:text-rally-300 ml-2 flex-1">
                Tip: For Southwest, use the 6-character confirmation code. For multi-leg flights, add the full itinerary as one booking.
              </Text>
            </View>
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
                  Delete Flight Booking
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
