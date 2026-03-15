import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertHotelBooking, insertFlightBooking } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { HotelBooking, FlightBooking, BookingPlatform, BookingStatus } from '@/types/database';

const AIRLINES = ['Southwest', 'Delta', 'United', 'American', 'JetBlue', 'Spirit', 'Frontier', 'Alaska', 'Other'];
const PLATFORMS: BookingPlatform[] = ['Bonvoy', 'Booking.com', 'Travel Source', 'Expedia', 'Direct', 'Other'];

interface ExtractedBooking {
  type: 'hotel' | 'flight';
  hotel_name?: string;
  reservation_number?: string;
  check_in?: string;
  check_out?: string;
  platform?: string;
  booking_name?: string;
  booked_by?: string;
  airline?: string;
  confirmation_code?: string;
  ticket_number?: string;
  departure_date?: string;
  return_date?: string;
  traveler_names?: string[];
  cost?: number | null;
}

export default function ReviewTravelScreen() {
  const { bookings: raw } = useLocalSearchParams<{ bookings: string }>();
  const parsed: ExtractedBooking[] = raw ? JSON.parse(raw) : [];

  const ic = useIconColors();
  const [items, setItems] = useState<ExtractedBooking[]>(parsed);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<Record<number, string>>({});

  const addHotelBooking = useSeasonStore((s) => s.addHotelBooking);
  const addFlightBooking = useSeasonStore((s) => s.addFlightBooking);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const { user } = useAuth();

  const tournamentOptions = useMemo(
    () => tournaments.map((t) => t.name),
    [tournaments]
  );

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedTournamentIds((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleTournamentChange = (index: number, name: string) => {
    const t = tournaments.find((tour) => tour.name === name);
    if (t) {
      setSelectedTournamentIds((prev) => ({ ...prev, [index]: t.id }));
    }
  };

  const showError = (msg: string) => {
    if (Platform.OS === 'web') {
      setErrorMsg(msg);
    } else {
      Alert.alert('Error', msg);
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      showError('No bookings to save.');
      return;
    }

    // Validate tournament selection
    for (let i = 0; i < items.length; i++) {
      if (!selectedTournamentIds[i]) {
        showError(`Please select a tournament for ${items[i].type === 'hotel' ? items[i].hotel_name || 'hotel' : items[i].airline || 'flight'}.`);
        return;
      }
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const tournamentId = selectedTournamentIds[i];

        if (item.type === 'hotel') {
          const hotelData = {
            created_by_user_id: userId,
            tournament_id: tournamentId,
            hotel_name: item.hotel_name || 'Unknown Hotel',
            platform: (item.platform as BookingPlatform) || 'Other',
            booking_name: item.booking_name || '',
            booked_by: item.booked_by || '',
            reservation_number: item.reservation_number || '',
            check_in: item.check_in || '',
            check_out: item.check_out || '',
            cancellation_deadline: null,
            cost: item.cost ?? null,
            is_backup: false,
            status: 'confirmed' as BookingStatus,
          };

          if (isSupabaseConfigured && user) {
            const { data, error } = await insertHotelBooking(hotelData);
            if (error) { showError(`Failed to save hotel: ${error.message}`); setIsSaving(false); return; }
            if (data) addHotelBooking(data);
          } else {
            const booking: HotelBooking = { ...hotelData, id: `h-import-${Date.now()}-${i}`, created_at: new Date().toISOString() };
            addHotelBooking(booking);
          }
        } else {
          const flightData = {
            created_by_user_id: userId,
            tournament_id: tournamentId,
            airline: item.airline || 'Other',
            confirmation_code: item.confirmation_code || '',
            ticket_number: item.ticket_number || null,
            departure_date: item.departure_date || '',
            return_date: item.return_date || '',
            booked_by: item.booked_by || '',
            traveler_names: item.traveler_names || [],
            cost: item.cost ?? null,
          };

          if (isSupabaseConfigured && user) {
            const { data, error } = await insertFlightBooking(flightData);
            if (error) { showError(`Failed to save flight: ${error.message}`); setIsSaving(false); return; }
            if (data) addFlightBooking(data);
          } else {
            const booking: FlightBooking = { ...flightData, id: `f-import-${Date.now()}-${i}`, created_at: new Date().toISOString() };
            addFlightBooking(booking);
          }
        }
      }

      notifySuccess();
      router.dismissAll();
    } catch (err: any) {
      showError(err.message || 'Failed to save bookings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-warm-white border-b border-parchment">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark">
          Review Travel ({items.length})
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving || items.length === 0}
          className={`px-4 py-1.5 rounded-lg ${
            isSaving || items.length === 0 ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'
          }`}
        >
          <Text className="text-sm font-semibold text-cream">
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Info banner */}
        <View className="bg-green-50 rounded-xl p-3 mb-4 flex-row items-start">
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-green-700 ml-2 flex-1">
            {items.length} booking{items.length !== 1 ? 's' : ''} extracted. Review and select a tournament, then save.
          </Text>
        </View>

        {/* Error */}
        {errorMsg && (
          <View className="bg-red-50 rounded-xl p-3 mb-4 flex-row items-start">
            <Ionicons name="alert-circle" size={18} color="#dc2626" />
            <Text className="text-sm text-red-700 ml-2 flex-1">{errorMsg}</Text>
          </View>
        )}

        {items.map((item, index) => {
          const selectedName = tournaments.find((t) => t.id === selectedTournamentIds[index])?.name ?? '';
          return (
            <View
              key={index}
              className="bg-warm-white rounded-xl border border-parchment mb-4 overflow-hidden"
              style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}
            >
              {/* Color bar */}
              <View className={`h-1.5 ${item.type === 'hotel' ? 'bg-rally-600' : 'bg-amber-500'}`} />

              <View className="p-4">
                {/* Header row */}
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Ionicons
                      name={item.type === 'hotel' ? 'bed-outline' : 'airplane-outline'}
                      size={18}
                      color={item.type === 'hotel' ? '#3B82B0' : '#d97706'}
                    />
                    <Text className="text-xs font-semibold uppercase tracking-wider text-stone ml-2">
                      {item.type === 'hotel' ? 'Hotel' : 'Flight'}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeItem(index)} className="p-1.5">
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>

                {/* Tournament selector */}
                {tournamentOptions.length > 0 ? (
                  <DropdownField
                    label="Link to Tournament"
                    value={selectedName}
                    options={tournamentOptions}
                    onChange={(name) => handleTournamentChange(index, name)}
                  />
                ) : (
                  <View className="bg-amber-50 rounded-xl p-3 mb-4">
                    <Text className="text-sm text-amber-700">
                      No tournaments yet. Add tournaments first, then import travel.
                    </Text>
                  </View>
                )}

                {item.type === 'hotel' ? (
                  <>
                    <FormField label="Hotel Name" value={item.hotel_name || ''} onChangeText={(v) => updateItem(index, 'hotel_name', v)} placeholder="Hotel name" />
                    <DropdownField label="Platform" value={item.platform || ''} options={PLATFORMS} onChange={(v) => updateItem(index, 'platform', v)} />
                    <FormField label="Reservation #" value={item.reservation_number || ''} onChangeText={(v) => updateItem(index, 'reservation_number', v)} placeholder="Confirmation number" />
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <FormField label="Check-in" value={item.check_in || ''} onChangeText={(v) => updateItem(index, 'check_in', v)} placeholder="YYYY-MM-DD" />
                      </View>
                      <View className="flex-1">
                        <FormField label="Check-out" value={item.check_out || ''} onChangeText={(v) => updateItem(index, 'check_out', v)} placeholder="YYYY-MM-DD" />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <DropdownField label="Airline" value={item.airline || ''} options={AIRLINES} onChange={(v) => updateItem(index, 'airline', v)} />
                    <FormField label="Confirmation Code" value={item.confirmation_code || ''} onChangeText={(v) => updateItem(index, 'confirmation_code', v)} placeholder="e.g. ABC123" autoCapitalize="characters" />
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <FormField label="Departure" value={item.departure_date || ''} onChangeText={(v) => updateItem(index, 'departure_date', v)} placeholder="YYYY-MM-DD" />
                      </View>
                      <View className="flex-1">
                        <FormField label="Return" value={item.return_date || ''} onChangeText={(v) => updateItem(index, 'return_date', v)} placeholder="YYYY-MM-DD" />
                      </View>
                    </View>
                    <FormField
                      label="Travelers"
                      value={(item.traveler_names || []).join(', ')}
                      onChangeText={(v) => updateItem(index, 'traveler_names', v.split(',').map((s: string) => s.trim()).filter(Boolean))}
                      placeholder="Names separated by commas"
                    />
                  </>
                )}
              </View>
            </View>
          );
        })}

        {items.length === 0 && (
          <View className="items-center py-16">
            <Ionicons name="airplane-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-stone mt-4">No bookings</Text>
            <Text className="text-sm text-stone mt-1">All extracted bookings were removed.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
