import { useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Linking, Platform, Share, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import HotelBookingCard from '@/components/HotelBookingCard';
import FlightBookingCard from '@/components/FlightBookingCard';
import TournamentGuestList from '@/components/TournamentGuestList';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useTeamEvents, deleteTournament as deleteTournamentDB, updateTournament as updateTournamentDB, deleteHotelBooking as deleteHotelBookingDB, deleteFlightBooking as deleteFlightBookingDB, deleteTeamEvent as deleteTeamEventDB } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';

import GlobalAddFAB from '@/components/GlobalAddFAB';
import { MOCK_TEAM_EVENTS } from '@/lib/mock-data';
import { formatDateRange, countdownText, daysUntil } from '@/lib/dates';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';


const STATUS_CONFIG = {
  upcoming: { label: 'Upcoming', bg: 'bg-cream', text: 'text-stone' },
  travel_needed: { label: 'Needs Booking', bg: 'bg-amber-50', text: 'text-amber-700' },
  booked: { label: 'Booked', bg: 'bg-green-50', text: 'text-green-700' },
  complete: { label: 'Complete', bg: 'bg-rally-50', text: 'text-rally-600' },
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

function TicketDetail({ ticket }: { ticket: import('@/types/database').TournamentTicket }) {
  const [expanded, setExpanded] = useState(false);

  const details: { label: string; value: string }[] = [];
  if (ticket.order_id) details.push({ label: 'Order ID', value: ticket.order_id });
  if (ticket.ticket_id) details.push({ label: 'Ticket ID', value: ticket.ticket_id });
  if (ticket.age_category) details.push({ label: 'Category', value: ticket.age_category });
  if (ticket.order_date) details.push({ label: 'Purchased', value: new Date(ticket.order_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) });
  if (ticket.ticket_price != null) details.push({ label: 'Price', value: `$${ticket.ticket_price.toFixed(2)}` });
  if (ticket.sales_tax != null) details.push({ label: 'Tax', value: `$${ticket.sales_tax.toFixed(2)}` });
  if (ticket.photo_required) details.push({ label: 'Photo ID', value: 'Required for entry' });

  if (details.length === 0 && !ticket.refund_policy && !ticket.parking_notes) return null;

  return (
    <View className="mt-1">
      <Pressable
        className="flex-row items-center py-1.5 active:opacity-70"
        onPress={() => setExpanded(!expanded)}
      >
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#8FA8BF" />
        <Text className="text-xs text-stone ml-1">{expanded ? 'Hide details' : 'Show details'}</Text>
      </Pressable>
      {expanded && (
        <View className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 mt-1">
          {details.map((d) => (
            <View key={d.label} className="flex-row justify-between py-1">
              <Text className="text-xs text-stone">{d.label}</Text>
              <Text className="text-xs font-medium text-bark dark:text-cream">{d.value}</Text>
            </View>
          ))}
          {ticket.parking_notes && (
            <View className="mt-2 pt-2 border-t border-green-100 dark:border-green-800">
              <Text className="text-xs font-medium text-stone">Parking</Text>
              <Text className="text-xs text-stone/80 mt-0.5">{ticket.parking_notes}</Text>
            </View>
          )}
          {ticket.refund_policy && (
            <View className="mt-2 pt-2 border-t border-green-100 dark:border-green-800">
              <Text className="text-xs font-medium text-stone">Refund Policy</Text>
              <Text className="text-xs text-stone/80 mt-0.5">{ticket.refund_policy}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SectionHeader({ icon, title, iconColor }: { icon: keyof typeof Ionicons.glyphMap; title: string; iconColor: string }) {
  return (
    <View className="flex-row items-center mt-6 mb-3">
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2 uppercase tracking-wider">
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
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);

  const tournamentTickets = useSeasonStore((s) => s.tournamentTickets);

  const tournament = useMemo(() => tournaments.find((t) => t.id === id) ?? null, [tournaments, id]);
  const hotels = useMemo(() => hotelBookings.filter((h) => h.tournament_id === id), [hotelBookings, id]);
  const flights = useMemo(() => flightBookings.filter((f) => f.tournament_id === id), [flightBookings, id]);
  const flightsByTraveler = useMemo(() => {
    const map = new Map<string, { displayName: string; flights: typeof flights }>();
    for (const f of flights) {
      for (const name of f.traveler_names) {
        const key = name.toLowerCase().trim();
        const existing = map.get(key);
        if (existing) {
          existing.flights.push(f);
        } else {
          // Use title case for display
          const display = name.trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
          map.set(key, { displayName: display, flights: [f] });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [flights]);
  const tickets = useMemo(() => tournamentTickets.filter((t) => t.tournament_id === id), [tournamentTickets, id]);

  // Team events: try Supabase hook, fallback to mock
  const { events: supabaseEvents } = useTeamEvents(id);
  const teamEvents = supabaseEvents.length > 0
    ? supabaseEvents
    : MOCK_TEAM_EVENTS.filter((e) => e.tournament_id === id);

  const teamCode = activeSeason?.team_code;
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();

  // Invited guest phone numbers for bulk SMS
  const allGuests = useGuestStore((s) => s.guests);
  const tournamentGuests = useGuestStore((s) => s.tournamentGuests);
  const invitedPhones = useMemo(() => {
    const invitedGuestIds = tournamentGuests
      .filter((tg) => tg.tournament_id === id && tg.invited)
      .map((tg) => tg.guest_id);
    return allGuests
      .filter((g) => invitedGuestIds.includes(g.id) && g.phone)
      .map((g) => g.phone);
  }, [allGuests, tournamentGuests, id]);

  const { user } = useAuth();
  const removeTournament = useSeasonStore((s) => s.removeTournament);
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const removeHotelBooking = useSeasonStore((s) => s.removeHotelBooking);
  const removeFlightBooking = useSeasonStore((s) => s.removeFlightBooking);


  const handleDeleteHotel = (hotelId: string, hotelName: string) => {
    const doDelete = async () => {
      if (isSupabaseConfigured && user) await deleteHotelBookingDB(hotelId);
      removeHotelBooking(hotelId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete hotel "${hotelName}"?`)) doDelete();
    } else {
      Alert.alert('Delete Hotel', `Delete "${hotelName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleDeleteFlight = (flightId: string, airline: string) => {
    const doDelete = async () => {
      if (isSupabaseConfigured && user) await deleteFlightBookingDB(flightId);
      removeFlightBooking(flightId);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${airline} flight?`)) doDelete();
    } else {
      Alert.alert('Delete Flight', `Delete ${airline} flight?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };
  const handleDeleteEvent = (eventId: string, eventName: string) => {
    const doDelete = async () => {
      if (isSupabaseConfigured && user) await deleteTeamEventDB(eventId);
      refresh();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${eventName}"?`)) doDelete();
    } else {
      Alert.alert('Delete Event', `Delete "${eventName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const handleDeleteTournament = async () => {
    if (!tournament) return;
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Are you sure you want to delete "${tournament.name}"?`);
      if (!confirmed) return;
      if (isSupabaseConfigured && user) {
        await deleteTournamentDB(id);
      }
      removeTournament(id);
      router.back();
    } else {
      Alert.alert(
        'Delete Tournament',
        `Are you sure you want to delete "${tournament.name}"? All associated bookings will remain but this tournament will be removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              if (isSupabaseConfigured && user) {
                await deleteTournamentDB(id);
              }
              removeTournament(id);
              router.back();
            },
          },
        ]
      );
    }
  };

  if (!tournament) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center">
        <Text className="text-lg text-stone">Tournament not found</Text>
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
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        {/* Hero header */}
        <View className={`px-5 pt-4 pb-5 ${
          tournament.status === 'booked' ? 'bg-green-600' :
          tournament.status === 'travel_needed' ? 'bg-amber-500' :
          tournament.status === 'complete' ? 'bg-rally-500' : 'bg-rally-700'
        }`}>
          <View className="flex-row items-center justify-between mb-3">
            <Pressable onPress={() => router.back()} className="flex-row items-center">
              <Ionicons name="chevron-back" size={20} color="white" />
              <Text className="text-white text-sm ml-0.5">Season</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/tournament/edit', params: { editId: tournament.id } })}
              className="p-2 active:opacity-70"
            >
              <Ionicons name="create-outline" size={22} color="white" />
            </Pressable>
          </View>

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
          {/* ── Tournament Info (Green) — Venue, Schedule, Tickets ── */}
          <SectionHeader icon="trophy" title="Tournament Info" iconColor="#16a34a" />
          <View className="rounded-xl overflow-hidden mb-3">
            <View className="h-1.5 bg-green-500" />
            <View className="bg-green-50 dark:bg-green-900/10 px-3 py-3">

              {/* VENUE */}
              {(() => {
                const hasVenue = tournament.venues.length > 0 && (tournament.venues[0]?.label || tournament.venues[0]?.address);
                return (
                  <>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <Ionicons name="location" size={16} color={hasVenue ? '#16a34a' : ic.muted} />
                        <Text className="text-xs font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                          Venue
                        </Text>
                      </View>
                      <Pressable
                        className="flex-row items-center active:opacity-70"
                        onPress={() => router.push({ pathname: '/tournament/edit', params: { editId: tournament.id } })}
                      >
                        <Ionicons name="create-outline" size={14} color="#16a34a" />
                        <Text className="text-xs font-semibold text-green-700 ml-1">Edit</Text>
                      </Pressable>
                    </View>
                    {hasVenue ? (
                      <>
                        {tournament.venues.map((venue, i) => (
                          <View key={i} className="bg-white/70 dark:bg-bark-light rounded-xl p-4 mb-2 border border-green-100 dark:border-green-900">
                            <View className="flex-row items-start justify-between">
                              <View className="flex-1 mr-3">
                                <View className="flex-row items-center">
                                  <Text className="text-base font-semibold text-bark dark:text-cream">
                                    {venue.label || tournament.location_city}
                                  </Text>
                                  <View className={`px-2 py-0.5 rounded-full ml-2 ${venue.is_confirmed ? 'bg-green-100' : 'bg-cream'}`}>
                                    <Text className={`text-xs font-medium ${venue.is_confirmed ? 'text-green-700' : 'text-stone'}`}>
                                      {venue.is_confirmed ? 'Confirmed' : 'TBD'}
                                    </Text>
                                  </View>
                                </View>
                                <Text className="text-sm text-stone dark:text-parchment mt-1">{venue.address}</Text>
                              </View>
                              {venue.address ? (
                                <Pressable
                                  className="bg-green-100 dark:bg-green-900/30 px-3 py-2 rounded-lg active:opacity-70"
                                  onPress={() => openDirections(venue.address)}
                                >
                                  <Ionicons name="navigate" size={18} color="#3B82B0" />
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        ))}
                        {tournament.venues.length > 1 && (
                          <Text className="text-xs text-stone mb-2 ml-1">
                            Multiple possible venues — will be confirmed closer to event
                          </Text>
                        )}
                      </>
                    ) : (
                      <Pressable
                        className="bg-white/70 dark:bg-bark-light rounded-xl p-4 border border-dashed border-green-200 dark:border-green-900 active:opacity-70"
                        onPress={() => router.push({ pathname: '/tournament/edit', params: { editId: tournament.id } })}
                      >
                        <View className="flex-row items-center justify-center">
                          <Ionicons name="add-circle-outline" size={18} color="#16a34a" />
                          <Text className="text-sm text-green-700 font-semibold ml-2">Add Venue</Text>
                        </View>
                      </Pressable>
                    )}
                  </>
                );
              })()}

              {/* Divider */}
              <View className="h-px bg-green-200/50 dark:bg-green-800/30 my-3" />

              {/* SCHEDULE */}
              {(() => {
                const hasScheduleData = !!(tournament.schedule_link || tournament.aes_tournament_id || tournament.schedule_available_date || tournament.ticket_sales_date);
                return (
                  <>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <Ionicons name="list" size={16} color={hasScheduleData ? '#16a34a' : ic.muted} />
                        <Text className="text-xs font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                          Schedule
                        </Text>
                      </View>
                      <Pressable
                        className="flex-row items-center active:opacity-70"
                        onPress={() => router.push({ pathname: '/tournament/edit', params: { editId: tournament.id } })}
                      >
                        <Ionicons name="create-outline" size={14} color="#16a34a" />
                        <Text className="text-xs font-semibold text-green-700 ml-1">Edit</Text>
                      </Pressable>
                    </View>
                    <View className="bg-white/70 dark:bg-bark-light rounded-xl p-4 mb-2 border border-green-100 dark:border-green-900">
                      {/* Schedule link */}
                      {tournament.schedule_link && (
                        <Pressable
                          className="flex-row items-center active:opacity-80 mb-1"
                          onPress={() => Linking.openURL(tournament.schedule_link!)}
                        >
                          <Ionicons name="open-outline" size={18} color="#16a34a" />
                          <Text className="text-sm text-green-700 font-semibold ml-2 flex-1" numberOfLines={1}>View Schedule</Text>
                          <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                        </Pressable>
                      )}

                      {/* Streaming link */}
                      {(() => {
                        const streamUrl = tournament.streaming_links?.[0]?.url ?? activeSeason?.default_stream_url;
                        const streamLabel = tournament.streaming_links?.[0]?.label || 'Watch Live';
                        if (!streamUrl) return null;
                        return (
                          <Pressable
                            className={`flex-row items-center active:opacity-80 mb-1 ${tournament.schedule_link ? 'mt-2 pt-2 border-t border-green-100 dark:border-green-900' : ''}`}
                            onPress={() => Linking.openURL(streamUrl)}
                          >
                            <Ionicons name="tv-outline" size={18} color="#7c3aed" />
                            <Text className="text-sm text-purple-700 font-semibold ml-2 flex-1" numberOfLines={1}>{streamLabel}</Text>
                            <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                          </Pressable>
                        );
                      })()}

                      {/* AES feed info */}
                      {tournament.aes_tournament_id && (
                        <View className={tournament.schedule_link ? 'mt-3 pt-3 border-t border-green-100 dark:border-green-900' : ''}>
                          {tournament.aes_feed_available && tournament.aes_feed_data ? (
                            <Text className="text-sm text-stone dark:text-parchment">
                              Pool and bracket data loaded from AES
                            </Text>
                          ) : (
                            <Text className="text-sm text-stone">AES data will appear once available.</Text>
                          )}
                          <Pressable
                            className="mt-1"
                            onPress={() => Linking.openURL(`https://www.aesathletics.com/events/${tournament.aes_tournament_id}`)}
                          >
                            <Text className="text-sm text-green-700 font-semibold">View on AES →</Text>
                          </Pressable>
                        </View>
                      )}

                      {/* Schedule available date */}
                      {tournament.schedule_available_date && daysUntil(tournament.schedule_available_date) > 0 && (
                        <View className="flex-row items-center mt-3 pt-3 border-t border-green-100 dark:border-green-900">
                          <Ionicons name="calendar-outline" size={14} color={daysUntil(tournament.schedule_available_date) <= 0 ? '#16a34a' : '#d97706'} />
                          <Text className={`text-sm ml-2 font-medium ${daysUntil(tournament.schedule_available_date) <= 0 ? 'text-green-700' : 'text-amber-600'}`}>
                            {daysUntil(tournament.schedule_available_date) <= 0
                              ? 'Schedule should be posted!'
                              : `Schedule posts ${new Date(tournament.schedule_available_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
                          </Text>
                        </View>
                      )}

                      {/* Ticket sales date — hide once tickets are purchased */}
                      {tournament.ticket_sales_date && tickets.length === 0 && !tournament.tickets_purchased && (
                        <Pressable
                          className="flex-row items-center mt-3 pt-3 border-t border-green-100 dark:border-green-900 active:opacity-70"
                          disabled={!(daysUntil(tournament.ticket_sales_date) <= 0 && tournament.ticket_link)}
                          onPress={() => {
                            if (tournament.ticket_link) {
                              if (Platform.OS === 'web') {
                                window.open(tournament.ticket_link, '_blank');
                              } else {
                                Linking.openURL(tournament.ticket_link);
                              }
                            }
                          }}
                        >
                          <Ionicons name="ticket-outline" size={14} color={daysUntil(tournament.ticket_sales_date) <= 0 ? '#16a34a' : '#d97706'} />
                          <Text className={`text-sm ml-2 font-medium ${daysUntil(tournament.ticket_sales_date) <= 0 ? 'text-green-700' : 'text-amber-600'}`}>
                            {daysUntil(tournament.ticket_sales_date) <= 0
                              ? 'Tickets should be on sale!'
                              : `Tickets on sale ${new Date(tournament.ticket_sales_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
                          </Text>
                          {daysUntil(tournament.ticket_sales_date) <= 0 && tournament.ticket_link && (
                            <Ionicons name="open-outline" size={12} color="#16a34a" style={{ marginLeft: 6 }} />
                          )}
                        </Pressable>
                      )}

                      {/* Dormant state */}
                      {!hasScheduleData && (
                        <Pressable
                          className="active:opacity-70"
                          onPress={() => router.push({ pathname: '/tournament/edit', params: { editId: tournament.id } })}
                        >
                          <View className="flex-row items-center justify-center">
                            <Ionicons name="add-circle-outline" size={18} color="#16a34a" />
                            <Text className="text-sm text-green-700 font-semibold ml-2">Add Schedule Link</Text>
                          </View>
                        </Pressable>
                      )}
                    </View>
                  </>
                );
              })()}

              {/* Divider */}
              <View className="h-px bg-green-200/50 dark:bg-green-800/30 my-3" />

              {/* TICKETS */}
              {(() => {
                const hasTicketData = !!(tournament.ticket_link || teamCode || tickets.length > 0);
                return (
                  <>
                    <View className="flex-row items-center mb-2">
                      <Ionicons name="ticket" size={16} color={hasTicketData ? '#16a34a' : ic.muted} />
                      <Text className="text-xs font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                        Tickets
                      </Text>
                    </View>
                    <View className="bg-white/70 dark:bg-bark-light rounded-xl p-4 border border-green-100 dark:border-green-900">

            {/* Team code */}
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1">
                <Text className="text-xs text-stone uppercase tracking-wider">Team Code</Text>
                <Text className="text-2xl font-bold text-bark dark:text-cream tracking-widest mt-0.5">
                  {teamCode ?? '------'}
                </Text>
                <Pressable
                  className="bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-lg active:opacity-70 flex-row items-center self-start mt-2"
                  onPress={async () => {
                    if (teamCode) {
                      if (Platform.OS === 'web') {
                        navigator.clipboard.writeText(teamCode);
                      } else {
                        await Clipboard.setStringAsync(teamCode);
                      }
                      tapLight();
                      Alert.alert('Copied', 'Team code copied to clipboard.');
                    }
                  }}
                >
                  <Ionicons name="copy-outline" size={12} color="#16a34a" />
                  <Text className="text-xs font-semibold text-green-700 dark:text-parchment ml-1">Copy</Text>
                </Pressable>
              </View>
            </View>

            {tournament.ticket_system && (
              <Text className="text-xs text-stone mb-2">Platform: {tournament.ticket_system}</Text>
            )}

            {/* Purchased tickets */}
            {tickets.length > 0 ? (
              <>
                {tickets.map((ticket) => (
                  <View key={ticket.id} className="mb-3">
                    {/* Primary action: open ticket */}
                    <Pressable
                      className="bg-green-600 rounded-lg py-3 px-4 active:opacity-80"
                      onPress={() => {
                        if (ticket.ticket_url) {
                          if (Platform.OS === 'web') {
                            window.open(ticket.ticket_url, '_blank');
                          } else {
                            Linking.openURL(ticket.ticket_url);
                          }
                        }
                      }}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1">
                          <Ionicons name="ticket" size={18} color="#FEFEFE" />
                          <View className="ml-3 flex-1">
                            <Text className="text-sm font-bold text-cream">{ticket.ticket_holder_name}</Text>
                            <Text className="text-xs text-cream/70">{ticket.ticket_type ?? 'Ticket'}</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center">
                          {ticket.total_cost != null && (
                            <Text className="text-sm font-semibold text-cream mr-2">${ticket.total_cost.toFixed(2)}</Text>
                          )}
                          <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.7)" />
                        </View>
                      </View>
                    </Pressable>

                    {/* Expandable detail */}
                    <TicketDetail ticket={ticket} />
                  </View>
                ))}

                {/* Add more tickets via ticket_link */}
                {tournament.ticket_link && (
                  <Pressable
                    className="border border-green-300 dark:border-green-700 rounded-lg py-2.5 items-center active:opacity-70 mt-1"
                    onPress={async () => {
                      if (teamCode) {
                        if (Platform.OS === 'web') {
                          navigator.clipboard.writeText(teamCode);
                        } else {
                          await Clipboard.setStringAsync(teamCode);
                        }
                        tapLight();
                      }
                      Linking.openURL(tournament.ticket_link!);
                    }}
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="add-circle-outline" size={16} color="#16a34a" />
                      <Text className="text-sm font-semibold text-green-700 dark:text-green-400 ml-1.5">Buy More Tickets</Text>
                      {teamCode && <Text className="text-xs text-stone ml-2">(code copied)</Text>}
                    </View>
                  </Pressable>
                )}
              </>
            ) : tournament.ticket_link ? (
              <Pressable
                className="bg-green-600 rounded-lg py-3 items-center active:opacity-80"
                onPress={async () => {
                  if (teamCode) {
                    if (Platform.OS === 'web') {
                      navigator.clipboard.writeText(teamCode);
                    } else {
                      await Clipboard.setStringAsync(teamCode);
                    }
                    tapLight();
                  }
                  Linking.openURL(tournament.ticket_link!);
                }}
              >
                <View className="flex-row items-center justify-center">
                  <Ionicons name="ticket" size={16} color="#FEFEFE" />
                  <Text className="text-sm font-semibold text-cream ml-2">Buy Tickets</Text>
                  {teamCode && <Text className="text-xs text-cream/70 ml-2">(code copied)</Text>}
                </View>
              </Pressable>
            ) : (
              <Text className="text-sm text-stone">No ticket link set for this tournament.</Text>
            )}

            {tickets.length === 0 && (
              <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-green-100 dark:border-green-900">
                <Text className="text-sm text-stone dark:text-parchment">Tickets purchased</Text>
                <Switch
                  value={!!tournament.tickets_purchased}
                  onValueChange={async (value) => {
                    if (isSupabaseConfigured && user) {
                      await updateTournamentDB(tournament.id, { tickets_purchased: value });
                    }
                    updateTournamentStore(tournament.id, { tickets_purchased: value });
                  }}
                  trackColor={{ false: '#D8E2EC', true: '#86EFAC' }}
                  thumbColor={tournament.tickets_purchased ? '#16a34a' : '#FEFEFE'}
                />
              </View>
            )}
          </View>
                  </>
                );
              })()}

            </View>
          </View>

          {/* TRAVEL */}
          <>
              {/* ── Hotels (Purple) ── */}
              <SectionHeader icon="bed" title="Hotels" iconColor={hotels.length > 0 ? '#7c3aed' : ic.muted} />
              <View className="rounded-xl overflow-hidden mb-3">
                <View className="h-1.5 bg-purple-500" />
                <View className="bg-purple-50 dark:bg-purple-900/10 px-3 py-3">
                  {hotels.map((h) => (
                    <View key={h.id} className="mb-2">
                      <HotelBookingCard
                        booking={h}
                        onPress={() => router.push({ pathname: '/booking/hotel-detail', params: { id: h.id } })}
                        onDelete={() => handleDeleteHotel(h.id, h.hotel_name)}
                      />
                    </View>
                  ))}
                  {!tournament.hotel_not_needed && hotels.length === 0 && (
                    <Pressable
                      className="bg-white/70 dark:bg-bark-light rounded-xl p-4 border border-dashed border-purple-200 dark:border-purple-900 items-center active:opacity-80"
                      onPress={() => router.push({ pathname: '/booking/add-hotel', params: { tournamentId: tournament.id } })}
                    >
                      <Ionicons name="bed" size={22} color="#7c3aed" />
                      <Text className="text-sm text-stone mt-1">Add Hotel</Text>
                    </Pressable>
                  )}
                  {tournament.hotel_not_needed && hotels.length === 0 && (
                    <Text className="text-xs text-stone text-center py-2">No hotel needed</Text>
                  )}
                </View>
              </View>

              {/* ── Flights (Blue) ── */}
              <SectionHeader icon="airplane" title="Flights" iconColor={flights.length > 0 ? '#3B82B0' : ic.muted} />
              <View className="rounded-xl overflow-hidden mb-3">
                <View className="h-1.5 bg-rally-600" />
                <View className="bg-rally-50 dark:bg-rally-900/10 px-3 py-3">
                  {flightsByTraveler.map(({ displayName, flights: travelerFlights }) => (
                    <View key={displayName} className="mb-3">
                      <View className="flex-row items-center mb-1.5">
                        <Ionicons name="person" size={13} color="#3B82B0" />
                        <Text className="text-xs font-semibold text-rally-700 dark:text-rally-300 ml-1.5 uppercase tracking-wider">{displayName}</Text>
                      </View>
                      {travelerFlights.map((f) => (
                        <View key={f.id} className="mb-2">
                          <FlightBookingCard
                            booking={f}
                            hideTravelers
                            onPress={() => router.push({ pathname: '/booking/flight-detail', params: { id: f.id } })}
                            onDelete={() => handleDeleteFlight(f.id, f.airline)}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                  {!tournament.air_not_needed && flights.length === 0 && (
                    <Pressable
                      className="bg-white/70 dark:bg-bark-light rounded-xl p-4 border border-dashed border-rally-200 dark:border-rally-900 items-center active:opacity-80"
                      onPress={() => router.push({ pathname: '/booking/add-flight', params: { tournamentId: tournament.id } })}
                    >
                      <Ionicons name="airplane" size={22} color="#3B82B0" />
                      <Text className="text-sm text-stone mt-1">Add Flight</Text>
                    </Pressable>
                  )}
                  {tournament.air_not_needed && flights.length === 0 && (
                    <Text className="text-xs text-stone text-center py-2">No flights needed</Text>
                  )}
                </View>
              </View>

              {/* ── Team Events (Amber/Yellow) — only show when events exist ── */}
              {teamEvents.length > 0 && (
                <>
                  <View className="flex-row items-center justify-between mt-4 mb-2">
                    <View className="flex-row items-center">
                      <Ionicons name="restaurant" size={16} color="#d97706" />
                      <Text className="text-xs font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                        Team Events
                      </Text>
                    </View>
                    <Pressable
                      className="flex-row items-center active:opacity-70"
                      onPress={() => router.push({ pathname: '/booking/add-team-event', params: { tournamentId: tournament.id } })}
                    >
                      <Ionicons name="add-circle-outline" size={16} color="#d97706" />
                      <Text className="text-xs font-semibold text-amber-600 ml-1">Add</Text>
                    </Pressable>
                  </View>
                  <View className="rounded-xl overflow-hidden mb-3">
                    <View className="h-1.5 bg-amber-500" />
                    <View className="bg-amber-50 dark:bg-amber-900/10 px-3 py-3">
                      {teamEvents.map((event) => (
                        <Pressable
                          key={event.id}
                          className="bg-white/70 dark:bg-bark-light rounded-xl p-4 mb-2 border border-amber-100 dark:border-amber-900 active:opacity-80"
                          onPress={() => router.push({ pathname: '/booking/add-team-event', params: { editId: event.id, tournamentId: tournament.id } })}
                        >
                          <View className="flex-row items-start justify-between">
                            <View className="flex-1 mr-3">
                              <Text className="text-base font-semibold text-bark dark:text-cream">{event.name}</Text>
                              <Text className="text-sm text-stone dark:text-parchment mt-0.5">{event.venue_name}</Text>
                              {event.time && (
                                <View className="flex-row items-center mt-1">
                                  <Ionicons name="time-outline" size={14} color={ic.subtle} />
                                  <Text className="text-sm text-stone ml-1">{event.time}</Text>
                                </View>
                              )}
                              {event.notes && <Text className="text-xs text-stone mt-2 italic">{event.notes}</Text>}
                            </View>
                            <View className="flex-col items-center gap-2">
                              {event.address ? (
                                <Pressable
                                  className="bg-amber-100 dark:bg-amber-900/30 px-3 py-2 rounded-lg active:opacity-70"
                                  onPress={(e) => { e.stopPropagation(); openDirections(event.address); }}
                                >
                                  <Ionicons name="navigate" size={18} color="#3B82B0" />
                                </Pressable>
                              ) : null}
                              <Pressable
                                className="px-3 py-2 rounded-lg active:opacity-70"
                                onPress={(e) => { e.stopPropagation(); handleDeleteEvent(event.id, event.name); }}
                              >
                                <Ionicons name="trash-outline" size={16} color="#dc2626" />
                              </Pressable>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* Not needed toggles — hidden when bookings exist */}
              {hotels.length === 0 && (
                <View className="flex-row items-center justify-between mt-3 mb-2 bg-warm-white dark:bg-bark-light rounded-xl px-4 py-3 border border-parchment dark:border-rally-900">
                  <View className="flex-1 mr-4">
                    <Text className="text-sm font-medium text-bark dark:text-parchment">
                      No hotel needed
                    </Text>
                    <Text className="text-xs text-stone dark:text-stone mt-0.5">
                      Staying local or with family
                    </Text>
                  </View>
                  <Switch
                    value={tournament.hotel_not_needed}
                    onValueChange={async (value) => {
                      if (isSupabaseConfigured && user) {
                        await updateTournamentDB(tournament.id, { hotel_not_needed: value });
                      }
                      updateTournamentStore(tournament.id, { hotel_not_needed: value });
                    }}
                    trackColor={{ false: '#D8E2EC', true: '#86EFAC' }}
                    thumbColor={tournament.hotel_not_needed ? '#16a34a' : '#FEFEFE'}
                  />
                </View>
              )}

              {flights.length === 0 && (
                <View className="flex-row items-center justify-between mb-3 bg-warm-white dark:bg-bark-light rounded-xl px-4 py-3 border border-parchment dark:border-rally-900">
                  <View className="flex-1 mr-4">
                    <Text className="text-sm font-medium text-bark dark:text-parchment">
                      No air needed
                    </Text>
                    <Text className="text-xs text-stone dark:text-stone mt-0.5">
                      Driving or getting a ride
                    </Text>
                  </View>
                  <Switch
                    value={tournament.air_not_needed}
                    onValueChange={async (value) => {
                      if (isSupabaseConfigured && user) {
                        await updateTournamentDB(tournament.id, { air_not_needed: value });
                      }
                      updateTournamentStore(tournament.id, { air_not_needed: value });
                    }}
                    trackColor={{ false: '#D8E2EC', true: '#86EFAC' }}
                    thumbColor={tournament.air_not_needed ? '#16a34a' : '#FEFEFE'}
                  />
                </View>
              )}
            </>

          {/* Non-travel tournament bookings (if any exist — legacy fallback, hidden since travel always shows) */}
          {false && (
            <>
              <SectionHeader icon="bed" title="Travel" iconColor={ic.muted} />
              {hotels.map((h) => (
                <HotelBookingCard
                  key={h.id}
                  booking={h}
                  onPress={() => router.push({ pathname: '/booking/hotel-detail', params: { id: h.id } })}
                />
              ))}
              {flights.map((f) => (
                <FlightBookingCard
                  key={f.id}
                  booking={f}
                  onPress={() => router.push({ pathname: '/booking/flight-detail', params: { id: f.id } })}
                />
              ))}
            </>
          )}

          {/* ── Guests (Pink) ── */}
          <SectionHeader icon="people" title="Guests" iconColor="#ec4899" />
          <View className="rounded-xl overflow-hidden mb-3">
            <View className="h-1.5 bg-pink-400" />
            <View className="bg-pink-50 dark:bg-pink-900/10 px-3 py-3">
              <TournamentGuestList tournament={tournament} />

              {/* Send details to all guests */}
              <View className="flex-row gap-2 mt-2">
                <Pressable
                  className="flex-1 bg-white/70 dark:bg-bark-light rounded-xl py-3 items-center flex-row justify-center active:opacity-80 border border-pink-100"
                  onPress={() => {
                    const venue = tournament.venues.find((v) => v.is_confirmed) ?? tournament.venues[0];
                    const lines = [tournament.name];
                    if (tournament.ticket_link) {
                      lines.push('', `Tickets: ${tournament.ticket_link}`);
                      if (activeSeason?.team_code) lines.push(`Team Code: ${activeSeason.team_code}`);
                    }
                    if (venue?.address) {
                      lines.push('', `Venue: ${venue.label || tournament.location_city}`, `Directions: https://maps.google.com/?q=${encodeURIComponent(venue.address)}`);
                    }
                    const smsBody = encodeURIComponent(lines.join('\n'));
                    const recipients = invitedPhones.join(',');
                    const smsUrl = Platform.OS === 'ios'
                      ? `sms:${recipients}&body=${smsBody}`
                      : `sms:${recipients}?body=${smsBody}`;
                    Platform.OS === 'web' ? window.open(smsUrl, '_blank') : Linking.openURL(smsUrl);
                  }}
                >
                  <Ionicons name="location" size={16} color="#ec4899" />
                  <Text className="text-xs font-semibold text-pink-700 dark:text-pink-300 ml-1.5">Send In-Person Details</Text>
                </Pressable>
                <Pressable
                  className="flex-1 bg-white/70 dark:bg-bark-light rounded-xl py-3 items-center flex-row justify-center active:opacity-80 border border-pink-100"
                  onPress={() => {
                    const lines = [tournament.name];
                    const streamUrl = tournament.streaming_links[0]?.url ?? activeSeason?.default_stream_url;
                    if (streamUrl) lines.push('', `Watch: ${streamUrl}`);
                    if (tournament.schedule_link) lines.push('', `Schedule: ${tournament.schedule_link}`);
                    const smsBody = encodeURIComponent(lines.join('\n'));
                    const recipients = invitedPhones.join(',');
                    const smsUrl = Platform.OS === 'ios'
                      ? `sms:${recipients}&body=${smsBody}`
                      : `sms:${recipients}?body=${smsBody}`;
                    Platform.OS === 'web' ? window.open(smsUrl, '_blank') : Linking.openURL(smsUrl);
                  }}
                >
                  <Ionicons name="videocam" size={16} color="#ec4899" />
                  <Text className="text-xs font-semibold text-pink-700 dark:text-pink-300 ml-1.5">Send Streaming Details</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* STREAMING */}
          <View className="flex-row items-center justify-between mt-6 mb-3">
            <View className="flex-row items-center">
              <Ionicons name="videocam" size={18} color={ic.muted} />
              <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2 uppercase tracking-wider">
                Streaming
              </Text>
            </View>
            <Pressable
              className="flex-row items-center active:opacity-70"
              onPress={() => router.push({ pathname: '/tournament/add-stream', params: { tournamentId: tournament.id } })}
            >
              <Ionicons name="add-circle-outline" size={18} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 ml-1">Add</Text>
            </Pressable>
          </View>
          {tournament.streaming_links.length > 0 ? (
            tournament.streaming_links.map((link, i) => (
              <View
                key={i}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900"
              >
                <Pressable
                  className="flex-row items-center active:opacity-80"
                  onPress={() => Linking.openURL(link.url)}
                >
                  <Ionicons name="play-circle" size={24} color="#dc2626" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">{link.label}</Text>
                    <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={ic.subtle} />
                </Pressable>
                <View className="flex-row mt-3 pt-3 border-t border-parchment dark:border-rally-900 gap-2">
                  <Pressable
                    className="flex-1 flex-row items-center justify-center py-2 bg-cream dark:bg-rally-900 rounded-lg active:opacity-70"
                    onPress={async () => {
                      await Clipboard.setStringAsync(link.url);
                      tapLight();
                      Alert.alert('Copied', 'Streaming link copied.');
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color={ic.subtle} />
                    <Text className="text-xs font-medium text-stone dark:text-parchment ml-1">Copy</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 flex-row items-center justify-center py-2 bg-cream dark:bg-rally-900 rounded-lg active:opacity-70"
                    onPress={() => Share.share({
                      message: `Watch ${tournament.name} live: ${link.url}`,
                      url: link.url,
                    })}
                  >
                    <Ionicons name="share-outline" size={14} color={ic.subtle} />
                    <Text className="text-xs font-medium text-stone dark:text-parchment ml-1">Share</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : activeSeason?.default_stream_url ? (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
              <View className="flex-row items-center mb-2">
                <View className="bg-rally-50 dark:bg-rally-900/20 px-2 py-0.5 rounded-full">
                  <Text className="text-xs font-semibold text-rally-600">Team Default</Text>
                </View>
              </View>
              <Pressable
                className="flex-row items-center active:opacity-80"
                onPress={() => Linking.openURL(activeSeason.default_stream_url!)}
              >
                <Ionicons name="play-circle" size={24} color="#dc2626" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">
                    {activeSeason.default_streaming_platform ?? 'Stream'}
                  </Text>
                  <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>{activeSeason.default_stream_url}</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={ic.subtle} />
              </Pressable>
            </View>
          ) : (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
              <Text className="text-sm text-stone">
                No streaming links yet. Set a default team channel in Hub → Streaming Hub, or add a link for this tournament.
              </Text>
            </View>
          )}

          {/* ADD TO CALENDAR */}
          <Pressable
            className="bg-rally-50 dark:bg-rally-900/20 rounded-xl py-4 items-center mt-6 active:opacity-80 flex-row justify-center"
            onPress={() => {
              const title = encodeURIComponent(tournament.name);
              const location = encodeURIComponent(
                confirmedVenue?.address || tournament.location_city || ''
              );
              const startDate = tournament.start_date.replace(/-/g, '') + 'T080000';
              const endDate = tournament.end_date.replace(/-/g, '') + 'T200000';
              if (Platform.OS === 'web') {
                // Google Calendar link for web
                const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&location=${location}`;
                Linking.openURL(gcalUrl);
              } else {
                // .ics data URI for native
                const icsContent = [
                  'BEGIN:VCALENDAR',
                  'VERSION:2.0',
                  'PRODID:-//RALLY//Tournament//EN',
                  'BEGIN:VEVENT',
                  `DTSTART:${startDate}`,
                  `DTEND:${endDate}`,
                  `SUMMARY:${tournament.name}`,
                  `LOCATION:${confirmedVenue?.address || tournament.location_city || ''}`,
                  'END:VEVENT',
                  'END:VCALENDAR',
                ].join('\r\n');
                const encoded = encodeURIComponent(icsContent);
                Linking.openURL(`data:text/calendar;charset=utf-8,${encoded}`);
              }
            }}
          >
            <Ionicons name="calendar-outline" size={18} color="#3B82B0" />
            <Text className="text-sm font-semibold text-rally-600 dark:text-rally-300 ml-2">
              Add to Calendar
            </Text>
          </Pressable>

          {/* DELETE TOURNAMENT */}
          <Pressable
            className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center mt-8 active:opacity-80"
            onPress={handleDeleteTournament}
          >
            <View className="flex-row items-center">
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2">
                Delete Tournament
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
      <GlobalAddFAB />
    </SafeAreaView>
  );
}
