import { View, Text, Pressable, ScrollView, Alert, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { daysUntil } from '@/lib/dates';
import { deleteHotelBooking } from '@/hooks/useSupabaseData';
import { useDataRefresh } from '@/providers/DataProvider';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openDirections(address: string) {
  const encoded = encodeURIComponent(address);
  const url = Platform.select({
    ios: `maps:?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://maps.google.com/?q=${encoded}`,
  });
  if (url) Linking.openURL(url);
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

export default function HotelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const { refresh } = useDataRefresh();
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const tournaments = useSeasonStore((s) => s.tournaments);

  const booking = hotelBookings.find((h) => h.id === id);
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
  const nights = Math.round(
    (new Date(booking.check_out + 'T00:00:00').getTime() - new Date(booking.check_in + 'T00:00:00').getTime()) /
    (1000 * 60 * 60 * 24)
  );

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
    Alert.alert('Delete Hotel', `Delete ${booking.hotel_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteHotelBooking(booking.id);
          await refresh();
          router.back();
        }
      },
    ]);
  };

  const deadlineDays = booking.cancellation_deadline ? daysUntil(booking.cancellation_deadline) : null;

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Hotel Details</Text>
        <Pressable onPress={() => router.push({ pathname: '/booking/add-hotel', params: { editId: booking.id } })} className="p-1">
          <Ionicons name="create-outline" size={22} color="#3B82B0" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero card */}
        <View className="mx-4 mt-4 bg-rally-600 rounded-2xl p-5" style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-xl font-bold text-cream">{booking.hotel_name}</Text>
              {tournament && (
                <Text className="text-sm text-rally-200 mt-1">{tournament.name}</Text>
              )}
            </View>
            {booking.is_backup && (
              <View className="bg-amber-400 px-3 py-1 rounded-full">
                <Text className="text-xs font-bold text-amber-900">BACKUP</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center mt-4">
            <View className="flex-1 items-center">
              <Text className="text-xs text-rally-200 uppercase">Check In</Text>
              <Text className="text-lg font-bold text-cream mt-1">{formatShortDate(booking.check_in)}</Text>
            </View>
            <View className="items-center px-4">
              <Text className="text-xs text-rally-200">{nights} night{nights !== 1 ? 's' : ''}</Text>
              <Ionicons name="arrow-forward" size={16} color="rgba(254,254,254,0.5)" />
            </View>
            <View className="flex-1 items-center">
              <Text className="text-xs text-rally-200 uppercase">Check Out</Text>
              <Text className="text-lg font-bold text-cream mt-1">{formatShortDate(booking.check_out)}</Text>
            </View>
          </View>
        </View>

        {/* Cancellation deadline alert */}
        {booking.cancellation_deadline && deadlineDays != null && deadlineDays >= 0 && (
          <View className={`mx-4 mt-3 flex-row items-center p-3 rounded-xl ${deadlineDays <= 3 ? 'bg-red-50' : deadlineDays <= 7 ? 'bg-amber-50' : 'bg-cream'}`}>
            <Ionicons
              name={deadlineDays <= 3 ? 'alert-circle' : 'time-outline'}
              size={18}
              color={deadlineDays <= 3 ? '#dc2626' : deadlineDays <= 7 ? '#d97706' : '#8FA8BF'}
            />
            <Text className={`text-sm font-semibold ml-2 ${deadlineDays <= 3 ? 'text-red-600' : deadlineDays <= 7 ? 'text-amber-600' : 'text-stone'}`}>
              Cancel by {formatDate(booking.cancellation_deadline)}
              {deadlineDays === 0 ? ' (today!)' : ` (${deadlineDays} day${deadlineDays !== 1 ? 's' : ''})`}
            </Text>
          </View>
        )}

        {/* Details */}
        <View className="mx-4 mt-4 bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 px-4">
          <DetailRow icon="business-outline" label="Platform" value={booking.platform} />
          <DetailRow icon="calendar-outline" label="Dates" value={`${formatDate(booking.check_in)} — ${formatDate(booking.check_out)}`} />
          {booking.reservation_number ? (
            <DetailRow
              icon="document-text-outline"
              label="Confirmation #"
              value={booking.reservation_number}
              mono
              onCopy={() => handleCopy(booking.reservation_number, 'Confirmation number')}
            />
          ) : null}
          <DetailRow icon="person-outline" label="Name on Reservation" value={booking.booking_name} />
          {booking.booked_by && booking.booked_by !== booking.booking_name ? (
            <DetailRow icon="people-outline" label="Booked By" value={booking.booked_by} />
          ) : null}
          {booking.address ? (
            <DetailRow icon="location-outline" label="Address" value={booking.address} />
          ) : null}
          {booking.cost != null ? (
            <DetailRow icon="card-outline" label="Cost" value={`$${booking.cost.toFixed(2)}`} />
          ) : null}
          {booking.notes ? (
            <DetailRow icon="chatbubble-outline" label="Notes" value={booking.notes} />
          ) : null}
          <DetailRow icon="checkmark-circle-outline" label="Status" value={booking.status.charAt(0).toUpperCase() + booking.status.slice(1)} />
        </View>

        {/* Action buttons */}
        <View className="mx-4 mt-4 gap-3">
          {booking.address ? (
            <Pressable
              className="bg-rally-50 dark:bg-rally-900/30 border border-rally-200 dark:border-rally-800 rounded-xl py-3.5 flex-row items-center justify-center active:opacity-80"
              onPress={() => openDirections(booking.address)}
            >
              <Ionicons name="navigate" size={18} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-600 ml-2">Get Directions</Text>
            </Pressable>
          ) : null}

          <Pressable
            className="bg-rally-600 rounded-xl py-3.5 flex-row items-center justify-center active:opacity-80"
            onPress={() => router.push({ pathname: '/booking/add-hotel', params: { editId: booking.id } })}
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
