import { useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Linking, Platform, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import HotelBookingCard from '@/components/HotelBookingCard';
import FlightBookingCard from '@/components/FlightBookingCard';
import TournamentGuestList from '@/components/TournamentGuestList';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useTeamEvents } from '@/hooks/useSupabaseData';
import { useNotificationActions } from '@/hooks/useNotificationActions';
import { MOCK_TEAM_EVENTS } from '@/lib/mock-data';
import { formatDateRange, countdownText, daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import QRCode from 'react-native-qrcode-svg';

const STATUS_CONFIG = {
  upcoming: { label: 'Upcoming', bg: 'bg-gray-100', text: 'text-gray-600' },
  travel_needed: { label: 'Needs Booking', bg: 'bg-amber-50', text: 'text-amber-700' },
  booked: { label: 'Booked', bg: 'bg-green-50', text: 'text-green-700' },
  complete: { label: 'Complete', bg: 'bg-blue-50', text: 'text-blue-600' },
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

function SectionHeader({ icon, title, iconColor }: { icon: keyof typeof Ionicons.glyphMap; title: string; iconColor: string }) {
  return (
    <View className="flex-row items-center mt-6 mb-3">
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-2 uppercase tracking-wider">
        {title}
      </Text>
    </View>
  );
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const tournaments = useSeasonStore((s) => s.tournaments);
  const hotelBookings = useSeasonStore((s) => s.hotelBookings);
  const flightBookings = useSeasonStore((s) => s.flightBookings);
  const teamConfig = useSeasonStore((s) => s.teamConfig);

  const tournament = useMemo(() => tournaments.find((t) => t.id === id) ?? null, [tournaments, id]);
  const hotels = useMemo(() => hotelBookings.filter((h) => h.tournament_id === id), [hotelBookings, id]);
  const flights = useMemo(() => flightBookings.filter((f) => f.tournament_id === id), [flightBookings, id]);

  // Team events: try Supabase hook, fallback to mock
  const { events: supabaseEvents } = useTeamEvents(id);
  const teamEvents = supabaseEvents.length > 0
    ? supabaseEvents
    : MOCK_TEAM_EVENTS.filter((e) => e.tournament_id === id);

  const teamCode = teamConfig?.team_code;
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();
  const { sendRSVPRequest, sendTournamentReminder } = useNotificationActions();

  if (!tournament) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-900 items-center justify-center">
        <Text className="text-lg text-gray-500">Tournament not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-rally-600 font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const status = STATUS_CONFIG[tournament.status];
  const countdown = countdownText(tournament.start_date, tournament.end_date);
  const confirmedVenue = tournament.venues.find((v) => v.is_confirmed);

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="white" />}
      >
        {/* Hero header */}
        <View className={`px-5 pt-4 pb-5 ${
          tournament.status === 'booked' ? 'bg-green-600' :
          tournament.status === 'travel_needed' ? 'bg-amber-500' :
          tournament.status === 'complete' ? 'bg-blue-500' : 'bg-gray-600'
        }`}>
          <Pressable onPress={() => router.back()} className="flex-row items-center mb-3">
            <Ionicons name="chevron-back" size={20} color="white" />
            <Text className="text-white text-sm ml-0.5">Season</Text>
          </Pressable>

          <Text className="text-2xl font-bold text-white">{tournament.name}</Text>
          <Text className="text-base text-white/80 mt-1">
            {formatDateRange(tournament.start_date, tournament.end_date)}
          </Text>

          <View className="flex-row items-center mt-3">
            <View className="bg-white/20 px-3 py-1 rounded-full flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-white mr-1.5" />
              <Text className="text-xs font-semibold text-white">{status.label}</Text>
            </View>
            <Text className="text-sm text-white/80 ml-3">{countdown}</Text>
            {tournament.travel_required && (
              <View className="flex-row items-center ml-3">
                <Ionicons name="airplane" size={14} color="white" />
                <Text className="text-xs text-white/80 ml-1">Travel</Text>
              </View>
            )}
          </View>
        </View>

        <View className="px-4">
          {/* VENUE */}
          <SectionHeader icon="location" title="Venue" iconColor={ic.muted} />
          {tournament.venues.map((venue, i) => (
            <View key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-700">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center">
                    <Text className="text-base font-semibold text-gray-900 dark:text-white">
                      {venue.label || tournament.location_city}
                    </Text>
                    <View className={`px-2 py-0.5 rounded-full ml-2 ${venue.is_confirmed ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <Text className={`text-xs font-medium ${venue.is_confirmed ? 'text-green-700' : 'text-gray-500'}`}>
                        {venue.is_confirmed ? 'Confirmed' : 'TBD'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">{venue.address}</Text>
                </View>
                <Pressable
                  className="bg-rally-50 dark:bg-rally-900/30 px-3 py-2 rounded-lg active:opacity-70"
                  onPress={() => openDirections(venue.address)}
                >
                  <Ionicons name="navigate" size={18} color="#2563eb" />
                </Pressable>
              </View>
            </View>
          ))}
          {tournament.venues.length > 1 && (
            <Text className="text-xs text-gray-400 mb-2 ml-1">
              Multiple possible venues — will be confirmed closer to event
            </Text>
          )}

          {/* SCHEDULE */}
          <SectionHeader icon="list" title={tournament.aes_tournament_id ? 'Schedule (AES)' : 'Schedule'} iconColor={ic.muted} />
          <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            {tournament.aes_tournament_id ? (
              tournament.aes_feed_available && tournament.aes_feed_data ? (
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  Pool and bracket data loaded from AES
                </Text>
              ) : (
                <>
                  <Text className="text-sm text-gray-500">Schedule data will appear once available from AES.</Text>
                  <Pressable
                    className="mt-2"
                    onPress={() => Linking.openURL(`https://www.aesathletics.com/events/${tournament.aes_tournament_id}`)}
                  >
                    <Text className="text-sm text-rally-600 font-semibold">View on AES →</Text>
                  </Pressable>
                </>
              )
            ) : (
              <Text className="text-sm text-gray-400">
                No AES Tournament ID set. Add one to auto-import pool assignments and court numbers.
              </Text>
            )}
          </View>

          {/* TICKETS */}
          <SectionHeader icon="ticket" title="Tickets" iconColor={ic.muted} />
          <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            {/* Team code + QR */}
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1">
                <Text className="text-xs text-gray-400 uppercase tracking-wider">Team Code</Text>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white tracking-widest mt-0.5">
                  {teamCode ?? '------'}
                </Text>
                <Pressable
                  className="bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg active:opacity-70 flex-row items-center self-start mt-2"
                  onPress={async () => {
                    if (teamCode) {
                      await Clipboard.setStringAsync(teamCode);
                      tapLight();
                      Alert.alert('Copied', 'Team code copied to clipboard.');
                    }
                  }}
                >
                  <Ionicons name="copy-outline" size={12} color="#6b7280" />
                  <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300 ml-1">Copy</Text>
                </Pressable>
              </View>

              {teamCode && (
                <View className="bg-white p-2 rounded-xl border border-gray-200">
                  <QRCode
                    value={teamCode}
                    size={80}
                    backgroundColor="white"
                    color="#111827"
                  />
                </View>
              )}
            </View>

            {tournament.ticket_system && (
              <Text className="text-xs text-gray-400 mb-2">Platform: {tournament.ticket_system}</Text>
            )}

            {tournament.ticket_link ? (
              <Pressable
                className="bg-rally-600 rounded-lg py-3 items-center active:opacity-80"
                onPress={() => Linking.openURL(tournament.ticket_link!)}
              >
                <Text className="text-sm font-semibold text-white">Buy Tickets</Text>
              </Pressable>
            ) : (
              <Text className="text-sm text-gray-400">No ticket link set for this tournament.</Text>
            )}

            <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <Text className="text-sm text-gray-600 dark:text-gray-300">Tickets purchased</Text>
              <View className={`px-3 py-1 rounded-full ${tournament.tickets_purchased ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Text className={`text-xs font-semibold ${tournament.tickets_purchased ? 'text-green-700' : 'text-gray-500'}`}>
                  {tournament.tickets_purchased ? 'Yes' : 'Not yet'}
                </Text>
              </View>
            </View>
          </View>

          {/* TRAVEL */}
          {(hotels.length > 0 || flights.length > 0) && (
            <>
              <SectionHeader icon="bed" title="Travel" iconColor={ic.muted} />
              {hotels.map((h) => <HotelBookingCard key={h.id} booking={h} />)}
              {flights.map((f) => <FlightBookingCard key={f.id} booking={f} />)}
            </>
          )}

          {tournament.travel_required && hotels.length === 0 && flights.length === 0 && (
            <>
              <SectionHeader icon="bed" title="Travel" iconColor={ic.muted} />
              <View className="flex-row gap-2">
                <Pressable
                  className="flex-1 bg-white dark:bg-gray-800 rounded-xl p-4 border border-dashed border-gray-300 dark:border-gray-600 items-center active:opacity-80"
                  onPress={() => router.push({ pathname: '/booking/add-hotel', params: { tournamentId: tournament.id } })}
                >
                  <Ionicons name="bed" size={22} color="#7c3aed" />
                  <Text className="text-sm text-gray-500 mt-1">Add Hotel</Text>
                </Pressable>
                <Pressable
                  className="flex-1 bg-white dark:bg-gray-800 rounded-xl p-4 border border-dashed border-gray-300 dark:border-gray-600 items-center active:opacity-80"
                  onPress={() => router.push({ pathname: '/booking/add-flight', params: { tournamentId: tournament.id } })}
                >
                  <Ionicons name="airplane" size={22} color="#2563eb" />
                  <Text className="text-sm text-gray-500 mt-1">Add Flight</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* GUESTS / RSVP */}
          <SectionHeader icon="people" title="Guests" iconColor={ic.muted} />
          <TournamentGuestList tournamentId={tournament.id} />

          {/* Notification actions */}
          <View className="flex-row gap-2 mt-2">
            <Pressable
              className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-xl py-3 items-center flex-row justify-center active:opacity-80"
              onPress={() => sendRSVPRequest(tournament)}
            >
              <Ionicons name="mail-outline" size={16} color="#7c3aed" />
              <Text className="text-xs font-semibold text-purple-700 dark:text-purple-300 ml-1.5">Send RSVP</Text>
            </Pressable>
            <Pressable
              className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl py-3 items-center flex-row justify-center active:opacity-80"
              onPress={() => sendTournamentReminder(tournament)}
            >
              <Ionicons name="notifications-outline" size={16} color="#2563eb" />
              <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300 ml-1.5">Send Reminder</Text>
            </Pressable>
          </View>

          {/* STREAMING */}
          <View className="flex-row items-center justify-between mt-6 mb-3">
            <View className="flex-row items-center">
              <Ionicons name="videocam" size={18} color={ic.muted} />
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-2 uppercase tracking-wider">
                Streaming
              </Text>
            </View>
            <Pressable
              className="flex-row items-center active:opacity-70"
              onPress={() => router.push({ pathname: '/tournament/add-stream', params: { tournamentId: tournament.id } })}
            >
              <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
              <Text className="text-xs font-semibold text-rally-600 ml-1">Add</Text>
            </Pressable>
          </View>
          {tournament.streaming_links.length > 0 ? (
            tournament.streaming_links.map((link, i) => (
              <View
                key={i}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-700"
              >
                <Pressable
                  className="flex-row items-center active:opacity-80"
                  onPress={() => Linking.openURL(link.url)}
                >
                  <Ionicons name="play-circle" size={24} color="#dc2626" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">{link.label}</Text>
                    <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={ic.subtle} />
                </Pressable>
                <View className="flex-row mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 gap-2">
                  <Pressable
                    className="flex-1 flex-row items-center justify-center py-2 bg-gray-50 dark:bg-gray-700 rounded-lg active:opacity-70"
                    onPress={async () => {
                      await Clipboard.setStringAsync(link.url);
                      tapLight();
                      Alert.alert('Copied', 'Streaming link copied.');
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color={ic.subtle} />
                    <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">Copy</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 flex-row items-center justify-center py-2 bg-gray-50 dark:bg-gray-700 rounded-lg active:opacity-70"
                    onPress={() => Share.share({
                      message: `Watch ${tournament.name} live: ${link.url}`,
                      url: link.url,
                    })}
                  >
                    <Ionicons name="share-outline" size={14} color={ic.subtle} />
                    <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">Share</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <Text className="text-sm text-gray-400">
                No streaming links yet. Links will auto-detect from your team's YouTube channel, or add manually.
              </Text>
            </View>
          )}

          {/* TEAM EVENTS */}
          {teamEvents.length > 0 && (
            <>
              <SectionHeader icon="restaurant" title="Team Events" iconColor={ic.muted} />
              {teamEvents.map((event) => (
                <View key={event.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-700">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-semibold text-gray-900 dark:text-white">{event.name}</Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{event.venue_name}</Text>
                      {event.time && (
                        <View className="flex-row items-center mt-1">
                          <Ionicons name="time-outline" size={14} color={ic.subtle} />
                          <Text className="text-sm text-gray-500 ml-1">{event.time}</Text>
                        </View>
                      )}
                      {event.reservation_name && (
                        <View className="flex-row items-center mt-1">
                          <Ionicons name="person-outline" size={14} color={ic.subtle} />
                          <Text className="text-sm text-gray-500 ml-1">
                            Reservation: {event.reservation_name}
                            {event.party_size ? ` (party of ${event.party_size})` : ''}
                          </Text>
                        </View>
                      )}
                      {event.notes && <Text className="text-xs text-gray-400 mt-2 italic">{event.notes}</Text>}
                      {event.family_welcome && (
                        <View className="bg-green-50 px-2 py-0.5 rounded-full self-start mt-2">
                          <Text className="text-xs font-medium text-green-700">Family welcome</Text>
                        </View>
                      )}
                    </View>
                    <Pressable
                      className="bg-rally-50 dark:bg-rally-900/30 px-3 py-2 rounded-lg active:opacity-70"
                      onPress={() => openDirections(event.address)}
                    >
                      <Ionicons name="navigate" size={18} color="#2563eb" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* SPORTWRENCH */}
          {tournament.sportwrench_url && (
            <>
              <SectionHeader icon="globe" title="SportsWrench" iconColor={ic.muted} />
              <Pressable
                className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex-row items-center active:opacity-80"
                onPress={() => Linking.openURL(tournament.sportwrench_url!)}
              >
                <Ionicons name="open-outline" size={18} color="#2563eb" />
                <Text className="text-sm text-rally-600 font-semibold ml-2">View on SportsWrench</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
