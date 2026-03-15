import { View, Text, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { deleteFlightBooking } from '@/hooks/useSupabaseData';
import { useDataRefresh } from '@/providers/DataProvider';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DetailRow({ icon, label, value, mono, onCopy }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <View className="flex-row items-start py-3 border-b border-parchment dark:border-bark-light">
      <View className="w-8 items-center mt-0.5">
        <Ionicons name={icon} size={16} color="#8FA8BF" />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-stone uppercase tracking-wider">{label}</Text>
        <Text className={`text-sm text-bark dark:text-cream mt-0.5 ${mono ? 'font-mono' : ''}`}>
          {value}
        </Text>
      </View>
      {onCopy && (
        <Pressable onPress={onCopy} className="p-2 active:opacity-60">
          <Ionicons name="copy-outline" size={16} color="#3B82B0" />
        </Pressable>
      )}
    </View>
  );
}

export default function FlightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const { refresh } = useDataRefresh();
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const tournaments = useSeasonStore((s) => s.tournaments);

  const booking = flightBookings.find((f) => f.id === id);
  if (!booking) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center">
        <Text className="text-stone">Booking not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-rally-600 font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const tournament = tournaments.find((t) => t.id === booking.tournament_id);

  const handleCopy = async (text: string, label: string) => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(text);
    } else {
      await Clipboard.setStringAsync(text);
    }
    tapLight();
    if (Platform.OS !== 'web') {
      Alert.alert('Copied', `${label} copied to clipboard.`);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Flight', `Delete ${booking.airline} booking?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteFlightBooking(booking.id);
          await refresh();
          router.back();
        }
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Flight Details</Text>
        <Pressable onPress={() => router.push({ pathname: '/booking/add-flight', params: { editId: booking.id } })} className="p-1">
          <Ionicons name="create-outline" size={22} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero card */}
        <View className="mx-4 mt-4 bg-purple-600 rounded-2xl p-5" style={{ shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 }}>
          <View className="flex-row items-center">
            <Ionicons name="airplane" size={24} color="rgba(254,254,254,0.8)" />
            <View className="ml-3 flex-1">
              <Text className="text-xl font-bold text-cream">{booking.airline}</Text>
              {tournament && (
                <Text className="text-sm text-purple-200 mt-0.5">{tournament.name}</Text>
              )}
            </View>
            {booking.flight_number && (
              <View className="bg-white/15 px-3 py-1 rounded-full">
                <Text className="text-xs font-bold text-cream">{booking.flight_number}</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center mt-5">
            <View className="flex-1 items-center">
              <Text className="text-xs text-purple-200 uppercase">Depart</Text>
              <Text className="text-lg font-bold text-cream mt-1">{formatShortDate(booking.departure_date)}</Text>
              {booking.departure_time && (
                <Text className="text-sm text-purple-200 mt-0.5">{booking.departure_time}</Text>
              )}
            </View>
            <View className="items-center px-4">
              <Ionicons name="airplane" size={16} color="rgba(254,254,254,0.4)" />
            </View>
            <View className="flex-1 items-center">
              <Text className="text-xs text-purple-200 uppercase">Return</Text>
              <Text className="text-lg font-bold text-cream mt-1">{formatShortDate(booking.return_date)}</Text>
              {booking.arrival_time && (
                <Text className="text-sm text-purple-200 mt-0.5">{booking.arrival_time}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Details */}
        <View className="mx-4 mt-4 bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 px-4">
          {booking.confirmation_code ? (
            <DetailRow
              icon="document-text-outline"
              label="Confirmation Code"
              value={booking.confirmation_code}
              mono
              onCopy={() => handleCopy(booking.confirmation_code, 'Confirmation code')}
            />
          ) : null}
          {booking.flight_number ? (
            <DetailRow icon="airplane" label="Flight Number" value={booking.flight_number} />
          ) : null}
          <DetailRow icon="calendar-outline" label="Departure" value={`${formatDate(booking.departure_date)}${booking.departure_time ? ` at ${booking.departure_time}` : ''}`} />
          <DetailRow icon="calendar-outline" label="Return" value={`${formatDate(booking.return_date)}${booking.arrival_time ? ` at ${booking.arrival_time}` : ''}`} />
          {booking.seat_number ? (
            <DetailRow icon="grid-outline" label="Seat" value={booking.seat_number} />
          ) : null}
          <DetailRow icon="people-outline" label="Travelers" value={booking.traveler_names.join(', ')} />
          {booking.booked_by ? (
            <DetailRow icon="person-outline" label="Booked By" value={booking.booked_by} />
          ) : null}
          {booking.ticket_number ? (
            <DetailRow
              icon="ticket-outline"
              label="Ticket Number"
              value={booking.ticket_number}
              mono
              onCopy={() => handleCopy(booking.ticket_number!, 'Ticket number')}
            />
          ) : null}
          {booking.cost != null ? (
            <DetailRow icon="card-outline" label="Cost" value={`$${booking.cost.toFixed(2)}`} />
          ) : null}
        </View>

        {/* Action buttons */}
        <View className="mx-4 mt-4 gap-3">
          <Pressable
            className="bg-purple-600 rounded-xl py-3.5 flex-row items-center justify-center active:opacity-80"
            onPress={() => router.push({ pathname: '/booking/add-flight', params: { editId: booking.id } })}
          >
            <Ionicons name="create-outline" size={18} color="#FEFEFE" />
            <Text className="text-sm font-semibold text-cream ml-2">Edit Booking</Text>
          </Pressable>

          <Pressable
            className="border border-red-200 rounded-xl py-3.5 flex-row items-center justify-center active:opacity-80"
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text className="text-sm font-semibold text-red-600 ml-2">Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
