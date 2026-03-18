import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FlightBooking } from '@/types/database';

interface FlightBookingCardProps {
  booking: FlightBooking;
  tournamentName?: string;
  singleTraveler?: string;
  onPress?: () => void;
  onDelete?: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FlightBookingCard({ booking, tournamentName, singleTraveler, onPress, onDelete }: FlightBookingCardProps) {
  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-2xl mb-3 overflow-hidden border border-parchment dark:border-rally-900 active:opacity-90"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
      onPress={onPress}
    >
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center flex-1">
            <Ionicons name="airplane" size={18} color="#8FA8BF" />
            <Text className="text-lg font-bold text-bark dark:text-cream ml-2">
              {booking.airline}
            </Text>
            {tournamentName && (
              <Text className="text-xs text-stone ml-2" numberOfLines={1}>
                {tournamentName}
              </Text>
            )}
          </View>
          {onDelete && (
            <Pressable onPress={onDelete} className="p-1.5 active:opacity-60">
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
            </Pressable>
          )}
        </View>

        <View className="ml-7 space-y-1.5">
          {booking.confirmation_code ? (
            <View className="flex-row items-center">
              <Ionicons name="document-text-outline" size={14} color="#8FA8BF" />
              <Text className="text-sm text-stone dark:text-parchment ml-2 font-mono">
                {booking.confirmation_code}
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="calendar-outline" size={14} color="#8FA8BF" />
            <Text className="text-sm text-stone dark:text-parchment ml-2">
              {booking.return_date
                ? `${formatDate(booking.departure_date)} — ${formatDate(booking.return_date)}`
                : formatDate(booking.departure_date)}
            </Text>
            {!booking.return_date && (
              <View className="bg-amber-100 dark:bg-amber-900/30 rounded px-1.5 py-0.5 ml-2">
                <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">One-way</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="people-outline" size={14} color="#8FA8BF" />
            <Text className="text-sm text-stone dark:text-parchment ml-2">
              {singleTraveler ?? booking.traveler_names.join(', ')}
            </Text>
          </View>

          {booking.cost != null && (
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="card-outline" size={14} color="#8FA8BF" />
              <Text className="text-sm text-stone dark:text-parchment ml-2">
                ${booking.cost.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
