import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tournament, Athlete } from '@/types/database';
import { formatDateRange, countdownText, daysUntil } from '@/lib/dates';

const AVATAR_COLORS = [
  '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
  '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
];

interface TournamentCardProps {
  tournament: Tournament;
  hotelCount?: number;
  flightCount?: number;
  backupHotelCount?: number;
  athlete?: Athlete | null;
  onPress?: () => void;
}

const STATUS_CONFIG = {
  upcoming: { label: 'Upcoming', bg: 'bg-cream', text: 'text-stone', dot: 'bg-stone' },
  travel_needed: { label: 'Needs Booking', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  partial: { label: 'Partially Booked', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  booked: { label: 'Ready to Go', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  complete: { label: 'Complete', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
} as const;

function openDirections(address: string) {
  const encoded = encodeURIComponent(address);
  const url = Platform.select({
    ios: `maps:?q=${encoded}`,
    android: `geo:0,0?q=${encoded}`,
    default: `https://maps.google.com/?q=${encoded}`,
  });
  if (url) Linking.openURL(url);
}

export default function TournamentCard({ tournament, hotelCount = 0, flightCount = 0, backupHotelCount = 0, athlete, onPress }: TournamentCardProps) {
  const hasHotel = hotelCount > 0;
  const hasFlight = flightCount > 0;
  const hasMultipleBookings = backupHotelCount > 0 || hotelCount > 1 || flightCount > 1;
  // Compute display status based on actual booking state for upcoming tournaments
  const hotelResolved = tournament.hotel_not_needed || hasHotel;
  const airResolved = tournament.air_not_needed || hasFlight;
  const isPast = daysUntil(tournament.end_date) < 0;
  let displayStatus: keyof typeof STATUS_CONFIG;
  if (isPast) {
    displayStatus = 'complete';
  } else if (hotelResolved && airResolved) {
    displayStatus = 'booked';
  } else if (hotelResolved || airResolved) {
    displayStatus = 'partial';
  } else {
    displayStatus = 'travel_needed';
  }
  const status = STATUS_CONFIG[displayStatus];
  const days = daysUntil(tournament.start_date);
  const countdown = countdownText(tournament.start_date, tournament.end_date);
  const confirmedVenue = tournament.venues.find((v) => v.is_confirmed);
  const venueAddress = confirmedVenue?.address ?? tournament.venues[0]?.address ?? tournament.location_city;
  const venueLabel = confirmedVenue?.label ?? (tournament.venues.length > 1 ? `${tournament.venues.length} possible venues` : null);

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-2xl mb-3 overflow-hidden border border-parchment dark:border-rally-900 active:opacity-90"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
      onPress={onPress}
    >
      {/* Top accent bar — color-coded by booking readiness */}
      <View
        className={`h-1.5 ${
          displayStatus === 'booked' || displayStatus === 'complete' ? 'bg-green-500' :
          displayStatus === 'partial' ? 'bg-amber-400' :
          displayStatus === 'travel_needed' ? 'bg-red-400' :
          'bg-stone'
        }`}
      />

      <View className="p-4">
        {/* Header row: avatar + name + status badge */}
        <View className="flex-row items-start justify-between mb-2">
          {athlete && (
            <View
              className="w-9 h-9 rounded-full items-center justify-center mr-3 mt-0.5"
              style={{ backgroundColor: athlete.avatar_color || AVATAR_COLORS[athlete.first_name.charCodeAt(0) % AVATAR_COLORS.length] }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FEFEFE' }}>
                {athlete.first_name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1 mr-3">
            <Text className="text-lg font-bold text-bark dark:text-cream">
              {tournament.name}
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-0.5">
              {formatDateRange(tournament.start_date, tournament.end_date)}
            </Text>
          </View>

          {/* Status badge */}
          <View className={`flex-row items-center px-2.5 py-1 rounded-full ${status.bg}`}>
            <View className={`w-1.5 h-1.5 rounded-full ${status.dot} mr-1.5`} />
            <Text className={`text-xs font-semibold ${status.text}`}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* Location row */}
        <View className="flex-row items-center mb-3">
          <Ionicons name="location-outline" size={16} color="#8FA8BF" />
          <Text className="text-sm text-stone dark:text-parchment ml-1 flex-1" numberOfLines={1}>
            {tournament.location_city}
          </Text>
          {tournament.travel_required && (
            <View className="flex-row items-center ml-2">
              <Ionicons name="airplane-outline" size={14} color="#8FA8BF" />
              <Text className="text-xs text-stone ml-0.5">Travel</Text>
            </View>
          )}
        </View>

        {/* Booking badges */}
        {tournament.travel_required ? (
          <View className="flex-row items-center mb-3 gap-3">
            <View className="flex-row items-center">
              <Ionicons name="bed-outline" size={14} color={tournament.hotel_not_needed ? '#16a34a' : hasHotel ? '#16a34a' : '#d97706'} />
              <Text className={`text-xs font-semibold ml-1 ${tournament.hotel_not_needed || hasHotel ? 'text-green-700' : 'text-amber-600'}`}>
                {tournament.hotel_not_needed ? 'Hotel Not Needed' : hasHotel ? 'Booked' : 'Needs Booking'}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="airplane-outline" size={14} color={tournament.air_not_needed ? '#16a34a' : hasFlight ? '#16a34a' : '#d97706'} />
              <Text className={`text-xs font-semibold ml-1 ${tournament.air_not_needed || hasFlight ? 'text-green-700' : 'text-amber-600'}`}>
                {tournament.air_not_needed ? 'Air Not Needed' : hasFlight ? 'Booked' : 'Needs Booking'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Multiple bookings flag */}
        {hasMultipleBookings && (
          <View className="flex-row items-center mb-3">
            <Ionicons name="alert-circle" size={14} color="#dc2626" />
            <Text className="text-xs font-semibold text-red-600 ml-1">
              Multiple Bookings
            </Text>
            <Text className="text-xs text-red-400 ml-1">
              — {[hotelCount > 1 ? `${hotelCount} hotels` : null, flightCount > 1 ? `${flightCount} flights` : null, backupHotelCount > 0 ? `${backupHotelCount} backup` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {/* Venue detail (if known) */}
        {venueLabel && (
          <View className="flex-row items-center mb-3">
            <Ionicons name="business-outline" size={14} color="#8FA8BF" />
            <Text className="text-xs text-stone dark:text-parchment ml-1" numberOfLines={1}>
              {venueLabel}
              {!confirmedVenue && tournament.venues.length <= 1 && ' — venue TBD'}
            </Text>
          </View>
        )}

        {/* Bottom row: countdown + directions */}
        <View className="flex-row items-center justify-between">
          {/* Countdown */}
          <View className="flex-row items-center">
            <Ionicons
              name={days <= 0 ? 'checkmark-circle' : 'time-outline'}
              size={16}
              color={days <= 7 && days > 0 ? '#6A9E8A' : '#8FA8BF'}
            />
            <Text
              className={`text-sm font-medium ml-1 ${
                days <= 7 && days > 0
                  ? 'text-amber-600'
                  : days <= 0
                    ? 'text-rally-500'
                    : 'text-stone dark:text-parchment'
              }`}
            >
              {countdown}
            </Text>
          </View>

          {/* Directions button */}
          <Pressable
            className="flex-row items-center bg-rally-50 dark:bg-rally-900/30 px-3 py-1.5 rounded-lg active:opacity-70"
            onPress={() => openDirections(venueAddress)}
          >
            <Ionicons name="navigate-outline" size={14} color="#3B82B0" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">
              Directions
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
