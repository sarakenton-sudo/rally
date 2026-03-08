import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tournament } from '@/types/database';
import { formatDateRange, countdownText, daysUntil } from '@/lib/dates';

interface TournamentCardProps {
  tournament: Tournament;
  onPress?: () => void;
}

const STATUS_CONFIG = {
  upcoming: { label: 'Upcoming', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  travel_needed: { label: 'Needs Booking', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  booked: { label: 'Booked', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  complete: { label: 'Complete', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-400' },
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

export default function TournamentCard({ tournament, onPress }: TournamentCardProps) {
  const status = STATUS_CONFIG[tournament.status];
  const days = daysUntil(tournament.start_date);
  const countdown = countdownText(tournament.start_date, tournament.end_date);
  const confirmedVenue = tournament.venues.find((v) => v.is_confirmed);
  const venueAddress = confirmedVenue?.address ?? tournament.venues[0]?.address ?? tournament.location_city;
  const venueLabel = confirmedVenue?.label ?? (tournament.venues.length > 1 ? `${tournament.venues.length} possible venues` : null);

  return (
    <Pressable
      className="bg-white dark:bg-gray-800 rounded-2xl mb-3 overflow-hidden border border-gray-100 dark:border-gray-700 active:opacity-90"
      onPress={onPress}
    >
      {/* Top accent bar — color-coded by status */}
      <View
        className={`h-1 ${
          tournament.status === 'booked' ? 'bg-green-500' :
          tournament.status === 'travel_needed' ? 'bg-amber-400' :
          tournament.status === 'complete' ? 'bg-blue-400' :
          'bg-gray-300'
        }`}
      />

      <View className="p-4">
        {/* Header row: name + status badge */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {tournament.name}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
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
          <Ionicons name="location-outline" size={16} color="#9ca3af" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 ml-1 flex-1" numberOfLines={1}>
            {tournament.location_city}
          </Text>
          {tournament.travel_required && (
            <View className="flex-row items-center ml-2">
              <Ionicons name="airplane-outline" size={14} color="#6b7280" />
              <Text className="text-xs text-gray-500 ml-0.5">Travel</Text>
            </View>
          )}
        </View>

        {/* Venue detail (if known) */}
        {venueLabel && (
          <View className="flex-row items-center mb-3">
            <Ionicons name="business-outline" size={14} color="#9ca3af" />
            <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1" numberOfLines={1}>
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
              color={days <= 7 && days > 0 ? '#f59e0b' : '#9ca3af'}
            />
            <Text
              className={`text-sm font-medium ml-1 ${
                days <= 7 && days > 0
                  ? 'text-amber-600'
                  : days <= 0
                    ? 'text-blue-500'
                    : 'text-gray-500 dark:text-gray-400'
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
            <Ionicons name="navigate-outline" size={14} color="#2563eb" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">
              Directions
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
