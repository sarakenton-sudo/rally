import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertHotelBooking, insertFlightBooking } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { HotelBooking, FlightBooking } from '@/types/database';

interface ExtractedBooking {
  type: 'hotel' | 'flight';
  // Hotel fields
  hotel_name?: string;
  reservation_number?: string;
  check_in?: string;
  check_out?: string;
  platform?: string;
  booking_name?: string;
  booked_by?: string;
  // Flight fields
  airline?: string;
  confirmation_code?: string;
  departure_date?: string;
  return_date?: string;
  traveler_names?: string[];
  // Shared
  cost?: number | null;
}

export default function ReviewTravelScreen() {
  const { bookings: raw } = useLocalSearchParams<{ bookings: string }>();
  const parsed: ExtractedBooking[] = raw ? JSON.parse(raw) : [];

  const ic = useIconColors();
  const [items, setItems] = useState<ExtractedBooking[]>(parsed);
  const [isSaving, setIsSaving] = useState(false);

  const addHotelBooking = useSeasonStore((s) => s.addHotelBooking);
  const addFlightBooking = useSeasonStore((s) => s.addFlightBooking);
  const { user } = useAuth();

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (items.length === 0) {
      Alert.alert('No bookings', 'Add at least one booking to save.');
      return;
    }

    setIsSaving(true);

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const userId = user?.id ?? '00000000-0000-0000-0000-000000000001';

        if (item.type === 'hotel') {
          const hotelData = {
            user_id: userId,
            tournament_id: '', // Will need to be linked later
            hotel_name: item.hotel_name || 'Unknown Hotel',
            platform: (item.platform as any) || 'Other',
            booking_name: item.booking_name || '',
            booked_by: item.booked_by || '',
            reservation_number: item.reservation_number || '',
            check_in: item.check_in || '',
            check_out: item.check_out || '',
            cancellation_deadline: null,
            cost: item.cost ?? null,
            is_backup: false,
            status: 'confirmed' as const,
          };

          if (isSupabaseConfigured && user) {
            const { data, error } = await insertHotelBooking(hotelData);
            if (error) {
              Alert.alert('Save failed', `Failed to save hotel: ${error.message}`);
              setIsSaving(false);
              return;
            }
            if (data) addHotelBooking(data);
          } else {
            const booking: HotelBooking = {
              ...hotelData,
              id: `h-import-${Date.now()}-${i}`,
              created_at: new Date().toISOString(),
            };
            addHotelBooking(booking);
          }
        } else {
          const flightData = {
            user_id: userId,
            tournament_id: '', // Will need to be linked later
            airline: item.airline || 'Unknown Airline',
            confirmation_code: item.confirmation_code || '',
            departure_date: item.departure_date || '',
            return_date: item.return_date || '',
            booked_by: item.booked_by || '',
            traveler_names: item.traveler_names || [],
            cost: item.cost ?? null,
          };

          if (isSupabaseConfigured && user) {
            const { data, error } = await insertFlightBooking(flightData);
            if (error) {
              Alert.alert('Save failed', `Failed to save flight: ${error.message}`);
              setIsSaving(false);
              return;
            }
            if (data) addFlightBooking(data);
          } else {
            const booking: FlightBooking = {
              ...flightData,
              id: `f-import-${Date.now()}-${i}`,
              created_at: new Date().toISOString(),
            };
            addFlightBooking(booking);
          }
        }
      }

      notifySuccess();
      Alert.alert(
        'Imported!',
        `${items.length} booking${items.length !== 1 ? 's' : ''} added.`,
        [{ text: 'OK', onPress: () => router.dismissAll() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save bookings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-warm-white dark:bg-bark border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">
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
        <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 mb-4 flex-row items-start">
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-green-700 dark:text-green-300 ml-2 flex-1">
            {items.length} booking{items.length !== 1 ? 's' : ''} extracted. Review before saving.
          </Text>
        </View>

        {items.map((item, index) => (
          <View
            key={index}
            className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 mb-3 overflow-hidden"
          >
            {/* Color bar */}
            <View className={`h-1.5 ${item.type === 'hotel' ? 'bg-rally-600' : 'bg-amber-500'}`} />

            <View className="p-4">
              {/* Header */}
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center flex-1">
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

              {item.type === 'hotel' ? (
                <View>
                  <Text className="text-base font-bold text-bark dark:text-cream mb-2">
                    {item.hotel_name || 'Unknown Hotel'}
                  </Text>
                  {item.check_in && (
                    <DetailRow icon="calendar-outline" label="Check-in" value={item.check_in} muted={ic.muted} />
                  )}
                  {item.check_out && (
                    <DetailRow icon="calendar-outline" label="Check-out" value={item.check_out} muted={ic.muted} />
                  )}
                  {item.reservation_number && (
                    <DetailRow icon="document-outline" label="Confirmation" value={item.reservation_number} muted={ic.muted} />
                  )}
                </View>
              ) : (
                <View>
                  <Text className="text-base font-bold text-bark dark:text-cream mb-2">
                    {item.airline || 'Unknown Airline'}
                  </Text>
                  {item.departure_date && (
                    <DetailRow icon="airplane-outline" label="Departure" value={item.departure_date} muted={ic.muted} />
                  )}
                  {item.return_date && (
                    <DetailRow icon="return-down-back" label="Return" value={item.return_date} muted={ic.muted} />
                  )}
                  {item.confirmation_code && (
                    <DetailRow icon="document-outline" label="Confirmation" value={item.confirmation_code} muted={ic.muted} />
                  )}
                </View>
              )}
            </View>
          </View>
        ))}

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

function DetailRow({ icon, label, value, muted }: { icon: string; label: string; value: string; muted: string }) {
  return (
    <View className="flex-row items-center mb-1.5">
      <Ionicons name={icon as any} size={14} color={muted} />
      <Text className="text-xs text-stone ml-1.5">{label}:</Text>
      <Text className="text-sm text-bark dark:text-cream ml-1 font-medium">{value}</Text>
    </View>
  );
}
