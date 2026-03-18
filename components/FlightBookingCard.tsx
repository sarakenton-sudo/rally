import { View, Text, Pressable, Linking, Platform } from 'react-native';
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

/** Extract just the numeric portion from a flight number like "WN 1234" or "DL1234" or "1234" */
function extractFlightNum(flightNumber: string): string {
  const match = flightNumber.match(/(\d+)\s*$/);
  return match ? match[1] : flightNumber.replace(/\s/g, '');
}

/** Build a flight status URL for major airlines. Returns null if unsupported. */
function getFlightStatusUrl(airline: string, flightNumber: string | null, departureDate: string): string | null {
  if (!flightNumber) return null;
  const num = extractFlightNum(flightNumber);
  // YYYY-MM-DD
  const date = departureDate;
  // MM/DD/YYYY
  const [y, m, d] = date.split('-');
  const dateSlash = `${m}/${d}/${y}`;

  const a = airline.toLowerCase();

  if (a.includes('southwest')) {
    // Southwest uses flight number + date
    return `https://www.southwest.com/air/flight-status/?departureDate=${date}&flightNumber=${num}`;
  }
  if (a.includes('delta')) {
    return `https://www.delta.com/flight-status/results?flightNo=${num}&depDate=${dateSlash}`;
  }
  if (a.includes('united')) {
    return `https://www.united.com/en/us/flightstatus/results/${num}/${date}`;
  }
  if (a.includes('american')) {
    return `https://www.aa.com/travelInformation/flights/status?search=AA&flightNumber=${num}&departureDate=${date}`;
  }
  if (a.includes('jetblue')) {
    return `https://www.jetblue.com/flight-status?flightNumber=${num}&departDate=${date}`;
  }
  if (a.includes('spirit')) {
    return `https://www.spirit.com/flight-status?DN=${date}&FN=${num}`;
  }
  if (a.includes('frontier')) {
    return `https://www.flyfrontier.com/travel/flight-status/?flightNumber=${num}&date=${date}`;
  }
  if (a.includes('alaska')) {
    return `https://www.alaskaair.com/flightstatus?fno=${num}&date=${dateSlash}`;
  }
  // Generic fallback — Google flight status search
  return `https://www.google.com/search?q=${encodeURIComponent(`${airline} flight ${num} status ${date}`)}`;
}

export default function FlightBookingCard({ booking, tournamentName, singleTraveler, onPress, onDelete }: FlightBookingCardProps) {
  const statusUrl = getFlightStatusUrl(booking.airline, booking.flight_number, booking.departure_date);

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
              {booking.airline}{booking.flight_number ? ` ${booking.flight_number}` : ''}
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
              {formatDate(booking.departure_date)}{booking.departure_time ? ` at ${booking.departure_time}` : ''}
              {booking.return_date ? ` — ${formatDate(booking.return_date)}${booking.arrival_time ? ` at ${booking.arrival_time}` : ''}` : ''}
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

          {statusUrl && (
            <Pressable
              className="flex-row items-center mt-2 active:opacity-70"
              onPress={(e) => {
                e.stopPropagation();
                if (Platform.OS === 'web') {
                  window.open(statusUrl, '_blank');
                } else {
                  Linking.openURL(statusUrl);
                }
              }}
            >
              <Ionicons name="pulse" size={14} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 ml-1.5">Check Flight Status</Text>
              <Ionicons name="open-outline" size={10} color="#3B82B0" style={{ marginLeft: 4 }} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
