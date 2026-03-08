import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HotelBooking } from '@/types/database';
import { daysUntil } from '@/lib/dates';

interface HotelBookingCardProps {
  booking: HotelBooking;
  tournamentName?: string;
  onPress?: () => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  'Bonvoy': 'bg-purple-100 text-purple-700',
  'Booking.com': 'bg-blue-100 text-blue-700',
  'Travel Source': 'bg-teal-100 text-teal-700',
  'Expedia': 'bg-yellow-100 text-yellow-700',
  'Direct': 'bg-gray-100 text-gray-600',
  'Other': 'bg-gray-100 text-gray-600',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCancellationBadge(deadline: string | null): {
  text: string;
  bgClass: string;
  textClass: string;
  icon: 'alert-circle' | 'warning' | 'time-outline';
} | null {
  if (!deadline) return null;

  const days = daysUntil(deadline);

  if (days < 0) {
    return { text: 'Deadline passed', bgClass: 'bg-gray-100', textClass: 'text-gray-500', icon: 'time-outline' };
  }
  if (days <= 2) {
    return { text: `Cancel by ${formatDate(deadline)}`, bgClass: 'bg-red-100', textClass: 'text-red-700', icon: 'alert-circle' };
  }
  if (days <= 7) {
    return { text: `Cancel by ${formatDate(deadline)}`, bgClass: 'bg-red-50', textClass: 'text-red-600', icon: 'alert-circle' };
  }
  if (days <= 14) {
    return { text: `Cancel by ${formatDate(deadline)}`, bgClass: 'bg-amber-50', textClass: 'text-amber-600', icon: 'warning' };
  }
  return { text: `Cancel by ${formatDate(deadline)}`, bgClass: 'bg-gray-50', textClass: 'text-gray-500', icon: 'time-outline' };
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  tentative: { label: 'Tentative', color: 'text-amber-600' },
  confirmed: { label: 'Confirmed', color: 'text-green-600' },
  cancelled: { label: 'Cancelled', color: 'text-red-500' },
};

export default function HotelBookingCard({ booking, tournamentName, onPress }: HotelBookingCardProps) {
  const platformStyle = PLATFORM_COLORS[booking.platform] ?? PLATFORM_COLORS['Other'];
  const [platformBg, platformText] = platformStyle.split(' ');
  const cancellation = getCancellationBadge(booking.cancellation_deadline);
  const statusInfo = STATUS_LABEL[booking.status];
  const nights = Math.round(
    (new Date(booking.check_out + 'T00:00:00').getTime() - new Date(booking.check_in + 'T00:00:00').getTime()) /
    (1000 * 60 * 60 * 24)
  );

  return (
    <Pressable
      className="bg-white dark:bg-gray-800 rounded-2xl mb-3 overflow-hidden border border-gray-100 dark:border-gray-700 active:opacity-90"
      onPress={onPress}
    >
      <View className="p-4">
        {/* Header: hotel name + backup badge */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center">
              <Ionicons name="bed-outline" size={18} color="#6b7280" />
              <Text className="text-lg font-bold text-gray-900 dark:text-white ml-2" numberOfLines={1}>
                {booking.hotel_name}
              </Text>
            </View>
            {tournamentName && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-7">
                {tournamentName}
              </Text>
            )}
          </View>

          {booking.is_backup && (
            <View className="bg-amber-50 px-2 py-0.5 rounded-full">
              <Text className="text-xs font-semibold text-amber-600">Backup</Text>
            </View>
          )}
        </View>

        {/* Platform + status row */}
        <View className="flex-row items-center mb-3 ml-7">
          <View className={`px-2 py-0.5 rounded-full ${platformBg}`}>
            <Text className={`text-xs font-medium ${platformText}`}>{booking.platform}</Text>
          </View>
          <Text className={`text-xs font-medium ml-2 ${statusInfo.color}`}>
            {statusInfo.label}
          </Text>
        </View>

        {/* Details grid */}
        <View className="ml-7 space-y-1.5">
          {/* Check-in / Check-out */}
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
            <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
              {formatDate(booking.check_in)} — {formatDate(booking.check_out)}
              <Text className="text-gray-400"> ({nights} night{nights !== 1 ? 's' : ''})</Text>
            </Text>
          </View>

          {/* Reservation number */}
          {booking.reservation_number ? (
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="document-text-outline" size={14} color="#9ca3af" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2 font-mono">
                #{booking.reservation_number}
              </Text>
            </View>
          ) : null}

          {/* Booked by / name on reservation */}
          <View className="flex-row items-center mt-1.5">
            <Ionicons name="person-outline" size={14} color="#9ca3af" />
            <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
              {booking.booking_name}
              {booking.booked_by && booking.booked_by !== booking.booking_name
                ? ` (booked by ${booking.booked_by})`
                : ''}
            </Text>
          </View>

          {/* Cost */}
          {booking.cost != null && (
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="card-outline" size={14} color="#9ca3af" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
                ${booking.cost.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {/* Cancellation deadline badge */}
        {cancellation && booking.status !== 'cancelled' && (
          <View className={`flex-row items-center mt-3 ml-7 px-3 py-2 rounded-lg ${cancellation.bgClass}`}>
            <Ionicons name={cancellation.icon} size={14} color={cancellation.textClass.includes('red') ? '#dc2626' : cancellation.textClass.includes('amber') ? '#d97706' : '#6b7280'} />
            <Text className={`text-xs font-semibold ml-1.5 ${cancellation.textClass}`}>
              {cancellation.text}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
