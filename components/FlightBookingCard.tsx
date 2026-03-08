import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FlightBooking } from '@/types/database';

interface FlightBookingCardProps {
  booking: FlightBooking;
  tournamentName?: string;
  onPress?: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FlightBookingCard({ booking, tournamentName, onPress }: FlightBookingCardProps) {
  return (
    <Pressable
      className="bg-white dark:bg-gray-800 rounded-2xl mb-3 overflow-hidden border border-gray-100 dark:border-gray-700 active:opacity-90"
      onPress={onPress}
    >
      <View className="p-4">
        <View className="flex-row items-center mb-2">
          <Ionicons name="airplane" size={18} color="#6b7280" />
          <Text className="text-lg font-bold text-gray-900 dark:text-white ml-2">
            {booking.airline}
          </Text>
          {tournamentName && (
            <Text className="text-xs text-gray-400 ml-2" numberOfLines={1}>
              {tournamentName}
            </Text>
          )}
        </View>

        <View className="ml-7 space-y-1.5">
          {booking.confirmation_code ? (
            <View className="flex-row items-center">
              <Ionicons name="document-text-outline" size={14} color="#9ca3af" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2 font-mono">
                {booking.confirmation_code}
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
            <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
              {formatDate(booking.departure_date)} — {formatDate(booking.return_date)}
            </Text>
          </View>

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="people-outline" size={14} color="#9ca3af" />
            <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
              {booking.traveler_names.join(', ')}
            </Text>
          </View>

          {booking.cost != null && (
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="card-outline" size={14} color="#9ca3af" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 ml-2">
                ${booking.cost.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
